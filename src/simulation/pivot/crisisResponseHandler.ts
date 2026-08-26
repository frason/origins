/**
 * Phase A: Tier 2/3 Crisis Response Handler
 *
 * Wires the BYOK provider adapter (#251) and InterventionCommand validation (#252)
 * into the actual Tier 2 (cloud LLM, gated behind quantum burst window) and Tier 3
 * (local LLM, gated behind local-compute infrastructure) crisis-response flow.
 *
 * Implements:
 * 1. Gating conditions: Tier 2 (burst window charged), Tier 3 (local infrastructure coverage)
 * 2. LLM request generation and call
 * 3. Response parsing and validation
 * 4. Failure handling (validation failure vs. LLM call failure)
 * 5. Command logging
 */

import type { World } from '../world';
import type { ResourceLedger } from './economy';
import type { Crisis } from './crisis';
import type { InterventionCommand, ParameterBounds } from './interventionCommand';
import {
  validateInterventionCommand,
  appendValidatedCommand,
  type ValidatedCommandLogEntry,
} from './interventionCommand';
import type { LLMProviderSettings } from '../../services/llmProviderConfig';
import {
  callLLMProvider,
  isLLMError,
  formatLLMError,
  estimateCallCost,
  type LLMCallError,
  type LLMResponse,
  type LLMMessage,
} from '../../services/llmProviderAdapter';
import {
  recordSpend,
  checkBudgetAllowance,
  getTotalSpendInWindow,
} from '../../services/spendTracker';

/**
 * SpendTracker interface for budget gating
 * This is a simplified interface that allows checking and recording spend
 */
export interface SpendTracker {
  canAfford(costUSD: number): boolean;
  recordSpend(costUSD: number): void;
}

/**
 * Create a spend tracker adapter that wraps the real BYOK tracker functions
 * and provides the interface expected by crisis response handlers
 */
export function createSpendTrackerAdapter(dailyLimitUSD: number): SpendTracker {
  return {
    canAfford(costUSD: number): boolean {
      const result = checkBudgetAllowance(costUSD, dailyLimitUSD);
      return result.allowed;
    },
    recordSpend(costUSD: number): void {
      recordSpend(costUSD);
    },
  };
}

/**
 * Burst window state for Tier 2 gating
 * Tracks whether the quantum comms link is ready for LLM calls
 */
export interface BurstWindowState {
  isCharged: boolean; // Can Tier 2 requests be sent?
  chargePercentage: number; // 0-100; at 100%, isCharged flips to true
  rechargeRatePerTick: number; // How much charge per tick (for simulation)
}

/**
 * Create a default burst window state
 */
export function createDefaultBurstWindow(): BurstWindowState {
  return {
    isCharged: true, // Start charged for testing
    chargePercentage: 100,
    rechargeRatePerTick: 1,
  };
}

/**
 * Tick the burst window recharge logic
 * Increments chargePercentage and flips isCharged when 100% is reached
 */
export function tickBurstWindowRecharge(burst: BurstWindowState): void {
  if (!burst.isCharged) {
    burst.chargePercentage = Math.min(100, burst.chargePercentage + burst.rechargeRatePerTick);
    if (burst.chargePercentage >= 100) {
      burst.isCharged = true;
    }
  }
}

/**
 * Discharge the burst window after a Tier 2 call
 * Sets chargePercentage to 0 and isCharged to false
 */
export function dischargeBurstWindow(burst: BurstWindowState, costPercentage: number = 100): void {
  burst.chargePercentage = Math.max(0, burst.chargePercentage - costPercentage);
  if (burst.chargePercentage < 100) {
    burst.isCharged = false;
  }
}

/**
 * Local compute infrastructure coverage check
 * For Tier 3, a robot must be within range of at least one LocalComputeBuilding
 * to use Tier 3 LLM responses.
 */
export interface LocalComputeBuilding {
  id: string;
  x: number;
  y: number;
  coveredRadius: number; // Chebyshev distance radius of coverage
  state: 'operational' | 'dormant' | 'demolished';
}

/**
 * Check if a position is within range of any local-compute infrastructure
 * Uses Chebyshev distance (max of abs differences, 8-directional)
 */
export function isWithinLocalComputeCoverage(
  scoutX: number,
  scoutY: number,
  infrastructure: LocalComputeBuilding[]
): boolean {
  for (const building of infrastructure) {
    if (building.state !== 'operational') continue; // Only operational buildings provide coverage

    const distance = Math.max(Math.abs(scoutX - building.x), Math.abs(scoutY - building.y));
    if (distance <= building.coveredRadius) {
      return true; // Within range of at least one operational building
    }
  }
  return false;
}

/**
 * Gating result: indicates whether a tier is available and why
 */
export interface TierGatingResult {
  available: boolean;
  reason: string; // Human-readable explanation of availability
}

/**
 * Check if Tier 2 is available
 */
export function checkTier2Gating(burst: BurstWindowState, spendTracker?: SpendTracker): TierGatingResult {
  if (!burst.isCharged) {
    return {
      available: false,
      reason: `Quantum burst window is not charged (${Math.round(burst.chargePercentage)}% ready). Tier 1 still available.`,
    };
  }

  // Check BYOK budget if spend tracker is provided
  if (spendTracker && !spendTracker.canAfford(0.005)) { // Minimum estimated cost for a call
    return {
      available: false,
      reason: `Daily LLM budget exhausted. Tier 1 still available.`,
    };
  }

  return {
    available: true,
    reason: 'Quantum burst window is charged and ready.',
  };
}

/**
 * Check if Tier 3 is available
 */
export function checkTier3Gating(
  scoutX: number,
  scoutY: number,
  infrastructure: LocalComputeBuilding[],
  spendTracker?: SpendTracker
): TierGatingResult {
  if (!isWithinLocalComputeCoverage(scoutX, scoutY, infrastructure)) {
    return {
      available: false,
      reason: `Scout is outside local-compute infrastructure coverage. Tier 1 & 2 still available.`,
    };
  }

  // Check BYOK budget if spend tracker is provided
  if (spendTracker && !spendTracker.canAfford(0.005)) { // Minimum estimated cost for a call
    return {
      available: false,
      reason: `Daily LLM budget exhausted. Tier 1 still available.`,
    };
  }

  return {
    available: true,
    reason: 'Scout is within local-compute infrastructure coverage.',
  };
}

/**
 * LLM call failure tracking
 * Tracks how many consecutive failures have occurred for a given crisis
 * Used to determine which error message to show the player
 */
export interface CrisisLLMFailureState {
  crisisId: string;
  failureCount: number; // 0, 1, 2, or 3+
}

/**
 * Response from trying to resolve a crisis via Tier 2 or 3
 */
export interface TierResponseResult {
  success: boolean;
  commandLogEntry?: ValidatedCommandLogEntry; // Only if success
  failureType?: 'validation' | 'llm_call'; // Only if !success
  failureReason?: string; // Human-readable error message
  failureCount?: number; // Track failures for the 2-strike rule
}

/**
 * Parse the LLM response to extract an InterventionCommand
 *
 * The LLM should return JSON with the following structure:
 * {
 *   "command": {
 *     "parameter": "toxicity_reduction",
 *     "value": 5.0,
 *     "targetX": 25,
 *     "targetY": 30
 *   }
 * }
 *
 * @param llmResponse - The response from the LLM provider
 * @param tier - The tier (2 or 3) for the generated command
 * @param crisis - The crisis being responded to
 * @param scoutId - The scout ID issuing the command
 * @returns A parsed InterventionCommand, or null if parsing failed
 */
export function parseLLMResponse(
  llmResponse: LLMResponse,
  tier: 2 | 3,
  crisis: Crisis,
  scoutId: string,
  tick: number
): InterventionCommand | null {
  try {
    const content = llmResponse.choices[0]?.message?.content;
    if (!content) {
      return null;
    }

    // Try to parse as JSON
    const parsed = JSON.parse(content);
    const cmd = parsed.command;

    if (!cmd || typeof cmd !== 'object') {
      return null;
    }

    // Extract fields with fallback to crisis location if not specified
    const parameter = cmd.parameter || 'toxicity_reduction';
    const value = typeof cmd.value === 'number' ? cmd.value : 0;
    const targetX = typeof cmd.targetX === 'number' ? cmd.targetX : crisis.x;
    const targetY = typeof cmd.targetY === 'number' ? cmd.targetY : crisis.y;

    return {
      id: `llm_cmd_${crisis.id}_${tier}`,
      tick,
      tier,
      sourceScoutId: scoutId,
      targetX,
      targetY,
      parameter,
      value,
    };
  } catch (err) {
    // Parsing error: JSON invalid or structure unexpected
    return null;
  }
}

/**
 * Attempt to resolve a crisis via Tier 2 (cloud LLM)
 *
 * Flow:
 * 1. Check gating condition (burst window charged)
 * 2. If not available, return failure with gating message
 * 3. Generate LLM request with crisis context
 * 4. Call LLM provider
 * 5. Parse response and validate command
 * 6. Apply validated command to state and log
 * 7. On failure, handle per the failure-handling rules (validation vs. LLM call)
 *
 * @param crisis - The Crisis to respond to
 * @param world - World grid for applying interventions
 * @param ledger - Resource ledger for costs
 * @param burst - Burst window state (gating condition)
 * @param scoutId - Scout ID issuing the response
 * @param tick - Current simulation tick
 * @param llmSettings - LLM provider configuration
 * @param failureState - Track failure count for 2-strike rule (optional)
 * @param parameterConfig - Parameter bounds for validation (optional)
 * @param spendTracker - BYOK spend tracker for budget gating (optional)
 * @returns Result including validated command log entry or failure details
 */
export async function resolveTier2(
  crisis: Crisis,
  world: World,
  ledger: ResourceLedger,
  burst: BurstWindowState,
  scoutId: string,
  tick: number,
  llmSettings: LLMProviderSettings,
  failureState?: { count: number },
  parameterConfig?: Record<string, ParameterBounds>,
  spendTracker?: SpendTracker,
  commandLog?: ValidatedCommandLogEntry[]
): Promise<TierResponseResult> {
  // Step 1: Check gating condition
  const gating = checkTier2Gating(burst, spendTracker);
  if (!gating.available) {
    return {
      success: false,
      failureType: 'validation',
      failureReason: gating.reason,
    };
  }

  // Step 2: Generate LLM request
  const systemPrompt = `You are an AI system helping to manage a simulated ecosystem crisis.
A toxicity spike has been detected at grid position (${crisis.x}, ${crisis.y}).
Respond with a JSON object containing an intervention command to reduce the toxicity.
The command should have: parameter (string), value (number 0-15), targetX (number), targetY (number).
Return only valid JSON, no other text.`;

  const userMessage = `Crisis type: ${crisis.type}. Location: (${crisis.x}, ${crisis.y}). Tick: ${crisis.tick}.
Suggest an intervention to resolve this crisis. Return JSON with your command.`;

  // Step 3: Call LLM provider
  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  const llmRequest = {
    messages,
    temperature: 0.7,
    max_tokens: 200,
  };

  const llmResult = await callLLMProvider(llmSettings, llmRequest);

  // Step 4: Check for LLM call error
  if (isLLMError(llmResult)) {
    const callError = llmResult as LLMCallError;
    const errorMessage = formatLLMError(callError);

    if (!failureState) {
      failureState = { count: 0 };
    }
    failureState.count++;

    // Tier 2 failure handling: first 2 failures show in-fiction, 3rd+ show troubleshooting
    let failureMessage: string;
    if (failureState.count <= 2) {
      failureMessage =
        `The quantum link fluctuated. Signal degradation on channel. Tier 2 response failed. ` +
        `(Attempt ${failureState.count}/2 before fallback option.) ` +
        `Tier 1 still available.`;
    } else {
      failureMessage =
        `[SYSTEM] There is an issue with the LLM we are using for this game. ` +
        `Error: ${errorMessage}. ` +
        `Please check your API key, billing, and provider status. ` +
        `Retry or fall back to Tier 1 response.`;
    }

    return {
      success: false,
      failureType: 'llm_call',
      failureReason: failureMessage,
      failureCount: failureState.count,
    };
  }

  const llmResponse = llmResult as LLMResponse;

  // Step 5: Parse response
  const command = parseLLMResponse(llmResponse, 2, crisis, scoutId, tick);
  if (!command) {
    return {
      success: false,
      failureType: 'validation',
      failureReason:
        `The LLM response couldn't be translated into a valid action. ` +
        `The format was invalid or incomplete. Please try again with a rephrased request, ` +
        `or use Tier 1 for an immediate heuristic response.`,
    };
  }

  // Step 6: Validate command
  const validation = validateInterventionCommand(command, world.width, world.height, parameterConfig);
  if (!validation.valid) {
    return {
      success: false,
      failureType: 'validation',
      failureReason:
        `The LLM response couldn't be translated into a valid action. ` +
        `The command failed safety checks: ${validation.reason}. ` +
        `Please try again or use Tier 1 for an immediate response.`,
    };
  }

  // Step 7: Apply validated command
  if (!commandLog) {
    commandLog = [];
  }

  try {
    const entry = appendValidatedCommand(commandLog, command, validation, tick, parameterConfig);

    // Apply the command to world state
    const finalDelta = validation.clampedValue ?? command.value;
    const cell = world.getCell(command.targetX, command.targetY);
    const newToxicity = Math.max(0, cell.toxicity - finalDelta);
    world.setCell(command.targetX, command.targetY, { toxicity: newToxicity });

    // Discharge the burst window after successful use
    dischargeBurstWindow(burst);

    // Record spend to tracker if provided
    if (spendTracker && llmResponse) {
      // Estimate cost based on token usage from the response
      const usage = llmResponse.usage || { prompt_tokens: 0, completion_tokens: 0 };
      const estimatedCost = estimateCallCost(llmSettings.provider, usage.prompt_tokens, usage.completion_tokens);
      if (estimatedCost > 0) {
        spendTracker.recordSpend(estimatedCost);
      }
    }

    // Mark crisis resolved
    crisis.status = 'resolved';

    return {
      success: true,
      commandLogEntry: entry,
    };
  } catch (err) {
    return {
      success: false,
      failureType: 'validation',
      failureReason: `Command validation failed: ${(err as Error).message}`,
    };
  }
}

/**
 * Attempt to resolve a crisis via Tier 3 (local LLM)
 *
 * Same flow as Tier 2, but gated by local-compute infrastructure coverage instead of burst window.
 *
 * @param crisis - The Crisis to respond to
 * @param world - World grid for applying interventions
 * @param ledger - Resource ledger for costs
 * @param scoutX - Scout X position (for coverage check)
 * @param scoutY - Scout Y position (for coverage check)
 * @param infrastructure - Array of local-compute buildings
 * @param scoutId - Scout ID issuing the response
 * @param tick - Current simulation tick
 * @param llmSettings - LLM provider configuration
 * @param failureState - Track failure count for 2-strike rule (optional)
 * @param parameterConfig - Parameter bounds for validation (optional)
 * @param spendTracker - BYOK spend tracker for budget gating (optional)
 * @returns Result including validated command log entry or failure details
 */
export async function resolveTier3(
  crisis: Crisis,
  world: World,
  ledger: ResourceLedger,
  scoutX: number,
  scoutY: number,
  infrastructure: LocalComputeBuilding[],
  scoutId: string,
  tick: number,
  llmSettings: LLMProviderSettings,
  failureState?: { count: number },
  parameterConfig?: Record<string, ParameterBounds>,
  spendTracker?: SpendTracker,
  commandLog?: ValidatedCommandLogEntry[]
): Promise<TierResponseResult> {
  // Step 1: Check gating condition
  const gating = checkTier3Gating(scoutX, scoutY, infrastructure, spendTracker);
  if (!gating.available) {
    return {
      success: false,
      failureType: 'validation',
      failureReason: gating.reason,
    };
  }

  // Step 2: Generate LLM request (same as Tier 2 for now)
  const systemPrompt = `You are a local AI system managing an ecosystem crisis.
A toxicity spike has been detected at grid position (${crisis.x}, ${crisis.y}).
Respond with a JSON object containing an intervention command to reduce the toxicity.
The command should have: parameter (string), value (number 0-15), targetX (number), targetY (number).
Return only valid JSON, no other text.`;

  const userMessage = `Crisis type: ${crisis.type}. Location: (${crisis.x}, ${crisis.y}). Tick: ${crisis.tick}.
Suggest an intervention to resolve this crisis. Return JSON with your command.`;

  // Step 3: Call LLM provider
  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  const llmRequest = {
    messages,
    temperature: 0.7,
    max_tokens: 200,
  };

  const llmResult = await callLLMProvider(llmSettings, llmRequest);

  // Step 4: Check for LLM call error
  if (isLLMError(llmResult)) {
    const callError = llmResult as LLMCallError;
    const errorMessage = formatLLMError(callError);

    if (!failureState) {
      failureState = { count: 0 };
    }
    failureState.count++;

    // Tier 3 failure handling: identical to Tier 2
    let failureMessage: string;
    if (failureState.count <= 2) {
      failureMessage =
        `The local computation system is experiencing degradation. ` +
        `Tier 3 response failed. ` +
        `(Attempt ${failureState.count}/2 before fallback option.) ` +
        `Tier 1 & 2 still available.`;
    } else {
      failureMessage =
        `[SYSTEM] There is an issue with the LLM we are using for this game. ` +
        `Error: ${errorMessage}. ` +
        `Please check your API key, billing, and provider status. ` +
        `Retry or fall back to Tier 1 response.`;
    }

    return {
      success: false,
      failureType: 'llm_call',
      failureReason: failureMessage,
      failureCount: failureState.count,
    };
  }

  const llmResponse = llmResult as LLMResponse;

  // Step 5: Parse response
  const command = parseLLMResponse(llmResponse, 3, crisis, scoutId, tick);
  if (!command) {
    return {
      success: false,
      failureType: 'validation',
      failureReason:
        `The LLM response couldn't be translated into a valid action. ` +
        `The format was invalid or incomplete. Please try again with a rephrased request, ` +
        `or use Tier 1 for an immediate heuristic response.`,
    };
  }

  // Step 6: Validate command
  const validation = validateInterventionCommand(command, world.width, world.height, parameterConfig);
  if (!validation.valid) {
    return {
      success: false,
      failureType: 'validation',
      failureReason:
        `The LLM response couldn't be translated into a valid action. ` +
        `The command failed safety checks: ${validation.reason}. ` +
        `Please try again or use Tier 1 for an immediate response.`,
    };
  }

  // Step 7: Apply validated command
  if (!commandLog) {
    commandLog = [];
  }

  try {
    const entry = appendValidatedCommand(commandLog, command, validation, tick, parameterConfig);

    // Apply the command to world state
    const finalDelta = validation.clampedValue ?? command.value;
    const cell = world.getCell(command.targetX, command.targetY);
    const newToxicity = Math.max(0, cell.toxicity - finalDelta);
    world.setCell(command.targetX, command.targetY, { toxicity: newToxicity });

    // Record spend to tracker if provided
    if (spendTracker && llmResponse) {
      // Estimate cost based on token usage from the response
      const usage = llmResponse.usage || { prompt_tokens: 0, completion_tokens: 0 };
      const estimatedCost = estimateCallCost(llmSettings.provider, usage.prompt_tokens, usage.completion_tokens);
      if (estimatedCost > 0) {
        spendTracker.recordSpend(estimatedCost);
      }
    }

    // Mark crisis resolved
    crisis.status = 'resolved';

    return {
      success: true,
      commandLogEntry: entry,
    };
  } catch (err) {
    return {
      success: false,
      failureType: 'validation',
      failureReason: `Command validation failed: ${(err as Error).message}`,
    };
  }
}
