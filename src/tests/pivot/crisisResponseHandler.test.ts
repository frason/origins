import { describe, it, expect, beforeEach, vi } from 'vitest';
import { World } from '../../simulation/world';
import { ResourceLedger } from '../../simulation/pivot/economy';
import { SIMULATION_CONSTANTS } from '../../utils/constants';
import type { Crisis } from '../../simulation/pivot/crisis';
import {
  createDefaultBurstWindow,
  tickBurstWindowRecharge,
  dischargeBurstWindow,
  checkTier2Gating,
  checkTier3Gating,
  isWithinLocalComputeCoverage,
  parseLLMResponse,
  resolveTier2,
  resolveTier3,
  type BurstWindowState,
  type LocalComputeBuilding,
  type TierResponseResult,
} from '../../simulation/pivot/crisisResponseHandler';
import type { LLMProviderSettings } from '../../services/llmProviderConfig';
import { WHITELISTED_PARAMETERS } from '../../simulation/pivot/interventionCommand';
import * as llmAdapter from '../../services/llmProviderAdapter';

// Mock LLM provider
vi.mock('../../services/llmProviderAdapter', () => ({
  callLLMProvider: vi.fn(),
  isLLMError: vi.fn((val) => Boolean(val && typeof val === 'object' && 'code' in val)),
  formatLLMError: vi.fn((err) => `${err.code}: ${err.message}`),
}));

describe('Tier 2/3 Crisis Response Handler', () => {
  let world: World;
  let ledger: ResourceLedger;
  let testCrisis: Crisis;
  let llmSettings: LLMProviderSettings;

  beforeEach(() => {
    world = new World(100, 100, SIMULATION_CONSTANTS, 12345);
    ledger = new ResourceLedger();
    testCrisis = {
      id: 'crisis_100_25_25',
      type: 'toxicity_spike',
      x: 25,
      y: 25,
      tick: 100,
      status: 'active',
    };

    llmSettings = {
      provider: 'openai',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      modelName: 'gpt-4',
      dailySpendLimitUSD: 10,
    };

    // Set some toxicity for the crisis location
    world.setCell(25, 25, { toxicity: 1.5 });
  });

  describe('Burst Window State', () => {
    it('should create a default burst window state', () => {
      const burst = createDefaultBurstWindow();
      expect(burst.isCharged).toBe(true);
      expect(burst.chargePercentage).toBe(100);
      expect(burst.rechargeRatePerTick).toBe(1);
    });

    it('should tick recharge the burst window when not charged', () => {
      const burst = createDefaultBurstWindow();
      burst.chargePercentage = 50;
      burst.isCharged = false;

      tickBurstWindowRecharge(burst);

      expect(burst.chargePercentage).toBe(51);
      expect(burst.isCharged).toBe(false);
    });

    it('should flip isCharged when charging reaches 100%', () => {
      const burst = createDefaultBurstWindow();
      burst.chargePercentage = 99;
      burst.isCharged = false;

      tickBurstWindowRecharge(burst);

      expect(burst.chargePercentage).toBe(100);
      expect(burst.isCharged).toBe(true);
    });

    it('should not recharge if already charged', () => {
      const burst = createDefaultBurstWindow();
      burst.chargePercentage = 100;
      burst.isCharged = true;

      tickBurstWindowRecharge(burst);

      expect(burst.chargePercentage).toBe(100); // Unchanged
      expect(burst.isCharged).toBe(true);
    });

    it('should discharge the burst window after use', () => {
      const burst = createDefaultBurstWindow();
      expect(burst.isCharged).toBe(true);

      dischargeBurstWindow(burst);

      expect(burst.chargePercentage).toBe(0);
      expect(burst.isCharged).toBe(false);
    });

    it('should allow partial discharge', () => {
      const burst = createDefaultBurstWindow();
      dischargeBurstWindow(burst, 30); // 30% cost

      expect(burst.chargePercentage).toBe(70);
      expect(burst.isCharged).toBe(false); // Not charged anymore after discharge
    });
  });

  describe('Tier 2 Gating', () => {
    it('should allow Tier 2 when burst window is charged', () => {
      const burst = createDefaultBurstWindow();
      const gating = checkTier2Gating(burst);

      expect(gating.available).toBe(true);
      expect(gating.reason).toContain('charged');
    });

    it('should block Tier 2 when burst window is not charged', () => {
      const burst = createDefaultBurstWindow();
      burst.isCharged = false;
      burst.chargePercentage = 50;

      const gating = checkTier2Gating(burst);

      expect(gating.available).toBe(false);
      expect(gating.reason).toContain('not charged');
      expect(gating.reason).toContain('50%');
    });

    it('should mention Tier 1 fallback in gating message', () => {
      const burst = createDefaultBurstWindow();
      burst.isCharged = false;

      const gating = checkTier2Gating(burst);

      expect(gating.reason).toContain('Tier 1');
    });

    it('should block Tier 2 when daily budget is exhausted', () => {
      const burst = createDefaultBurstWindow();
      const mockSpendTracker = {
        canAfford(costUSD: number): boolean {
          return false; // Budget exhausted
        },
        recordSpend(costUSD: number): void {},
      };

      const gating = checkTier2Gating(burst, mockSpendTracker);

      expect(gating.available).toBe(false);
      expect(gating.reason).toContain('budget exhausted');
      expect(gating.reason).toContain('Tier 1');
    });
  });

  describe('Tier 3 Local Compute Coverage', () => {
    it('should find coverage within radius', () => {
      const infrastructure: LocalComputeBuilding[] = [
        {
          id: 'lc_1',
          x: 50,
          y: 50,
          coveredRadius: 10,
          state: 'operational',
        },
      ];

      const inCoverage = isWithinLocalComputeCoverage(50, 50, infrastructure); // Center
      expect(inCoverage).toBe(true);

      const nearCoverage = isWithinLocalComputeCoverage(55, 55, infrastructure); // Chebyshev distance 5
      expect(nearCoverage).toBe(true);

      const atRadius = isWithinLocalComputeCoverage(60, 50, infrastructure); // Chebyshev distance 10
      expect(atRadius).toBe(true);
    });

    it('should exclude coverage outside radius', () => {
      const infrastructure: LocalComputeBuilding[] = [
        {
          id: 'lc_1',
          x: 50,
          y: 50,
          coveredRadius: 10,
          state: 'operational',
        },
      ];

      const outCoverage = isWithinLocalComputeCoverage(61, 50, infrastructure); // Chebyshev distance 11
      expect(outCoverage).toBe(false);
    });

    it('should ignore dormant or demolished buildings', () => {
      const infrastructure: LocalComputeBuilding[] = [
        {
          id: 'lc_1',
          x: 50,
          y: 50,
          coveredRadius: 20,
          state: 'dormant',
        },
      ];

      const inRadius = isWithinLocalComputeCoverage(55, 55, infrastructure); // Would be in radius if operational
      expect(inRadius).toBe(false);
    });

    it('should check all buildings for coverage', () => {
      const infrastructure: LocalComputeBuilding[] = [
        {
          id: 'lc_1',
          x: 10,
          y: 10,
          coveredRadius: 5,
          state: 'operational',
        },
        {
          id: 'lc_2',
          x: 80,
          y: 80,
          coveredRadius: 5,
          state: 'operational',
        },
      ];

      const nearFirst = isWithinLocalComputeCoverage(12, 12, infrastructure);
      expect(nearFirst).toBe(true);

      const nearSecond = isWithinLocalComputeCoverage(82, 82, infrastructure);
      expect(nearSecond).toBe(true);

      const nearNeither = isWithinLocalComputeCoverage(50, 50, infrastructure);
      expect(nearNeither).toBe(false);
    });
  });

  describe('Tier 3 Gating', () => {
    it('should allow Tier 3 when scout is in coverage', () => {
      const infrastructure: LocalComputeBuilding[] = [
        {
          id: 'lc_1',
          x: 50,
          y: 50,
          coveredRadius: 10,
          state: 'operational',
        },
      ];

      const gating = checkTier3Gating(50, 50, infrastructure);

      expect(gating.available).toBe(true);
      expect(gating.reason).toContain('within');
    });

    it('should block Tier 3 when scout is outside coverage', () => {
      const infrastructure: LocalComputeBuilding[] = [
        {
          id: 'lc_1',
          x: 50,
          y: 50,
          coveredRadius: 10,
          state: 'operational',
        },
      ];

      const gating = checkTier3Gating(10, 10, infrastructure);

      expect(gating.available).toBe(false);
      expect(gating.reason).toContain('outside');
    });

    it('should mention fallback options in gating message', () => {
      const infrastructure: LocalComputeBuilding[] = [];

      const gating = checkTier3Gating(50, 50, infrastructure);

      expect(gating.reason).toContain('Tier 1');
    });

    it('should block Tier 3 when daily budget is exhausted', () => {
      const infrastructure: LocalComputeBuilding[] = [
        {
          id: 'lc_1',
          x: 50,
          y: 50,
          coveredRadius: 10,
          state: 'operational',
        },
      ];
      const mockSpendTracker = {
        canAfford(costUSD: number): boolean {
          return false; // Budget exhausted
        },
        recordSpend(costUSD: number): void {},
      };

      const gating = checkTier3Gating(50, 50, infrastructure, mockSpendTracker);

      expect(gating.available).toBe(false);
      expect(gating.reason).toContain('budget exhausted');
      expect(gating.reason).toContain('Tier 1');
    });
  });

  describe('LLM Response Parsing', () => {
    it('should parse valid JSON response', () => {
      const llmResponse = {
        id: 'test-response',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                command: {
                  parameter: 'toxicity_reduction',
                  value: 5.0,
                  targetX: 25,
                  targetY: 25,
                },
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      const command = parseLLMResponse(llmResponse, 2, testCrisis, 'scout_0', 100);

      expect(command).not.toBeNull();
      expect(command?.parameter).toBe('toxicity_reduction');
      expect(command?.value).toBe(5.0);
      expect(command?.targetX).toBe(25);
      expect(command?.targetY).toBe(25);
      expect(command?.tier).toBe(2);
    });

    it('should default to crisis location if targetX/Y not specified', () => {
      const llmResponse = {
        id: 'test-response',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                command: {
                  parameter: 'toxicity_reduction',
                  value: 5.0,
                },
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      const command = parseLLMResponse(llmResponse, 2, testCrisis, 'scout_0', 100);

      expect(command?.targetX).toBe(testCrisis.x);
      expect(command?.targetY).toBe(testCrisis.y);
    });

    it('should return null for invalid JSON', () => {
      const llmResponse = {
        id: 'test-response',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'This is not JSON',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      const command = parseLLMResponse(llmResponse, 2, testCrisis, 'scout_0', 100);

      expect(command).toBeNull();
    });

    it('should return null for missing command object', () => {
      const llmResponse = {
        id: 'test-response',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({ response: 'no command here' }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      const command = parseLLMResponse(llmResponse, 2, testCrisis, 'scout_0', 100);

      expect(command).toBeNull();
    });

    it('should handle missing content gracefully', () => {
      const llmResponse = {
        id: 'test-response',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 0,
          total_tokens: 100,
        },
      };

      const command = parseLLMResponse(llmResponse, 2, testCrisis, 'scout_0', 100);

      expect(command).toBeNull();
    });
  });

  describe('Tier 2 Resolution', () => {
    it('should reject Tier 2 when burst window not charged', async () => {
      const burst = createDefaultBurstWindow();
      burst.isCharged = false;
      burst.chargePercentage = 0;

      const result = await resolveTier2(
        testCrisis,
        world,
        ledger,
        burst,
        'scout_0',
        100,
        llmSettings
      );

      expect(result.success).toBe(false);
      expect(result.failureType).toBe('validation');
      expect(result.failureReason).toContain('not charged');
    });

    it('should handle LLM call error (first attempt)', async () => {
      const burst = createDefaultBurstWindow();

      vi.mocked(llmAdapter.callLLMProvider).mockResolvedValueOnce({
        code: 'api_error',
        message: 'Rate limited',
        statusCode: 429,
      });

      const failureState = { count: 0 };

      const result = await resolveTier2(
        testCrisis,
        world,
        ledger,
        burst,
        'scout_0',
        100,
        llmSettings,
        failureState
      );

      expect(result.success).toBe(false);
      expect(result.failureType).toBe('llm_call');
      expect(result.failureCount).toBe(1);
      expect(result.failureReason).toContain('Signal degradation'); // In-fiction message for first strike
      expect(result.failureReason).toContain('Attempt 1/2');
    });

    it('should show different message on second LLM failure', async () => {
      const burst = createDefaultBurstWindow();

      vi.mocked(llmAdapter.callLLMProvider).mockResolvedValueOnce({
        code: 'timeout',
        message: 'Request timed out',
      });

      const failureState = { count: 1 }; // Already one failure

      const result = await resolveTier2(
        testCrisis,
        world,
        ledger,
        burst,
        'scout_0',
        100,
        llmSettings,
        failureState
      );

      expect(result.success).toBe(false);
      expect(result.failureCount).toBe(2);
      expect(result.failureReason).toContain('Attempt 2/2');
    });

    it('should show system troubleshooting message on third failure', async () => {
      const burst = createDefaultBurstWindow();

      vi.mocked(llmAdapter.callLLMProvider).mockResolvedValueOnce({
        code: 'api_error',
        message: 'Invalid API key',
        statusCode: 401,
      });

      const failureState = { count: 2 }; // Already two failures

      const result = await resolveTier2(
        testCrisis,
        world,
        ledger,
        burst,
        'scout_0',
        100,
        llmSettings,
        failureState
      );

      expect(result.success).toBe(false);
      expect(result.failureCount).toBe(3);
      expect(result.failureReason).toContain('[SYSTEM]');
      expect(result.failureReason).toContain('API key');
    });

    it('should handle validation failure when response is malformed', async () => {
      const burst = createDefaultBurstWindow();

      vi.mocked(llmAdapter.callLLMProvider).mockResolvedValueOnce({
        id: 'test-response',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'I cannot help with that.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 10,
          total_tokens: 110,
        },
      });

      const result = await resolveTier2(
        testCrisis,
        world,
        ledger,
        burst,
        'scout_0',
        100,
        llmSettings,
        undefined,
        WHITELISTED_PARAMETERS
      );

      expect(result.success).toBe(false);
      expect(result.failureType).toBe('validation');
      expect(result.failureReason).toContain(`couldn't be translated`);
    });

    it('should handle validation failure when command is out of bounds', async () => {
      const burst = createDefaultBurstWindow();

      vi.mocked(llmAdapter.callLLMProvider).mockResolvedValueOnce({
        id: 'test-response',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                command: {
                  parameter: 'toxicity_reduction',
                  value: 5.0,
                  targetX: 150, // Out of bounds
                  targetY: 25,
                },
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      });

      const result = await resolveTier2(
        testCrisis,
        world,
        ledger,
        burst,
        'scout_0',
        100,
        llmSettings,
        undefined,
        WHITELISTED_PARAMETERS
      );

      expect(result.success).toBe(false);
      expect(result.failureType).toBe('validation');
      expect(result.failureReason).toContain('failed safety checks');
    });

    it('should successfully resolve a valid crisis', async () => {
      const burst = createDefaultBurstWindow();
      const commandLog: any[] = [];

      vi.mocked(llmAdapter.callLLMProvider).mockResolvedValueOnce({
        id: 'test-response',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                command: {
                  parameter: 'toxicity_reduction',
                  value: 5.0,
                  targetX: 25,
                  targetY: 25,
                },
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      });

      const result = await resolveTier2(
        testCrisis,
        world,
        ledger,
        burst,
        'scout_0',
        100,
        llmSettings,
        undefined,
        WHITELISTED_PARAMETERS,
        undefined,
        commandLog
      );

      expect(result.success).toBe(true);
      expect(result.commandLogEntry).toBeDefined();
      expect(result.commandLogEntry?.command.tier).toBe(2);
      expect(result.commandLogEntry?.validationResult.valid).toBe(true);

      // Check that command was recorded in log
      expect(commandLog).toHaveLength(1);
      expect(commandLog[0].command.tier).toBe(2);

      // Check that crisis is marked resolved
      expect(testCrisis.status).toBe('resolved');

      // Check that burst window was discharged
      expect(burst.isCharged).toBe(false);

      // Check that toxicity was reduced
      const newCell = world.getCell(25, 25);
      // Original toxicity: 1.5, reduce by 5 = -3.5, floored at 0
      expect(newCell.toxicity).toBe(0);
    });
  });

  describe('Tier 3 Resolution', () => {
    const infrastructure: LocalComputeBuilding[] = [
      {
        id: 'lc_1',
        x: 50,
        y: 50,
        coveredRadius: 20,
        state: 'operational',
      },
    ];

    it('should reject Tier 3 when outside coverage', async () => {
      const result = await resolveTier3(
        testCrisis,
        world,
        ledger,
        10, // Outside coverage (far from x: 50, y: 50)
        10,
        infrastructure,
        'scout_0',
        100,
        llmSettings
      );

      expect(result.success).toBe(false);
      expect(result.failureType).toBe('validation');
      expect(result.failureReason).toContain('outside');
    });

    it('should handle LLM call error (Tier 3)', async () => {
      vi.mocked(llmAdapter.callLLMProvider).mockResolvedValueOnce({
        code: 'network_error',
        message: 'Connection failed',
      });

      const failureState = { count: 0 };

      const result = await resolveTier3(
        testCrisis,
        world,
        ledger,
        50, // Within coverage
        50,
        infrastructure,
        'scout_0',
        100,
        llmSettings,
        failureState
      );

      expect(result.success).toBe(false);
      expect(result.failureType).toBe('llm_call');
      expect(result.failureCount).toBe(1);
      expect(result.failureReason).toContain('degradation'); // In-fiction message for Tier 3
    });

    it('should successfully resolve via Tier 3', async () => {
      const commandLog: any[] = [];

      vi.mocked(llmAdapter.callLLMProvider).mockResolvedValueOnce({
        id: 'test-response',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                command: {
                  parameter: 'toxicity_reduction',
                  value: 8.0,
                  targetX: 25,
                  targetY: 25,
                },
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      });

      const result = await resolveTier3(
        testCrisis,
        world,
        ledger,
        50, // Within coverage
        50,
        infrastructure,
        'scout_0',
        100,
        llmSettings,
        undefined,
        WHITELISTED_PARAMETERS,
        undefined,
        commandLog
      );

      expect(result.success).toBe(true);
      expect(result.commandLogEntry?.command.tier).toBe(3);
      expect(commandLog).toHaveLength(1);
      expect(testCrisis.status).toBe('resolved');

      // Tier 3 does NOT discharge burst window (only Tier 2 does)
      // But the command should be applied to world state
      const newCell = world.getCell(25, 25);
      // Original toxicity: 1.5, reduce by 8 = -6.5, floored at 0
      expect(newCell.toxicity).toBe(0);
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle empty infrastructure array for Tier 3', () => {
      const gating = checkTier3Gating(50, 50, []);

      expect(gating.available).toBe(false);
    });

    it('should handle multiple crises with separate failure states', async () => {
      const crisis2: Crisis = {
        id: 'crisis_100_30_30',
        type: 'toxicity_spike',
        x: 30,
        y: 30,
        tick: 100,
        status: 'active',
      };

      const burst = createDefaultBurstWindow();

      vi.mocked(llmAdapter.callLLMProvider).mockResolvedValueOnce({
        code: 'timeout',
        message: 'Timeout',
      });

      const failure1 = { count: 0 };
      const failure2 = { count: 0 };

      const result1 = await resolveTier2(
        testCrisis,
        world,
        ledger,
        burst,
        'scout_0',
        100,
        llmSettings,
        failure1
      );

      expect(result1.failureCount).toBe(1);
      expect(failure1.count).toBe(1);
      expect(failure2.count).toBe(0); // Separate failure states
    });
  });
});
