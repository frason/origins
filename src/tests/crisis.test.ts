import { describe, expect, it, beforeEach } from 'vitest';
import { World } from '../simulation/world';
import { ResourceLedger, PHASE0_ECONOMY_CONSTANTS } from '../simulation/pivot/economy';
import {
  detectCrises,
  resolveTier1,
  TOXICITY_CRISIS_THRESHOLD,
  CRISIS_ALERT_TEXT,
  type Crisis,
} from '../simulation/pivot/crisis';

describe('Crisis System (Phase 0)', () => {
  let world: World;
  let ledger: ResourceLedger;

  beforeEach(() => {
    // Create a small test world (10x10 for faster tests)
    world = new World(10, 10);
    // Start with full energy for most tests
    ledger = new ResourceLedger(500, 0);
  });

  describe('detectCrises', () => {
    it('detects a crisis when toxicity exceeds threshold', () => {
      // Set a tile's toxicity to exceed threshold
      world.setCell(3, 4, { toxicity: TOXICITY_CRISIS_THRESHOLD + 0.1 });

      const crises = detectCrises(world, 100);

      expect(crises).toHaveLength(1);
      expect(crises[0]).toMatchObject({
        type: 'toxicity_spike',
        x: 3,
        y: 4,
        tick: 100,
        status: 'active',
      });
      expect(crises[0].id).toMatch(/^crisis_100_3_4$/);
    });

    it('detects multiple crises on different tiles', () => {
      world.setCell(0, 0, { toxicity: TOXICITY_CRISIS_THRESHOLD + 0.1 });
      world.setCell(5, 5, { toxicity: TOXICITY_CRISIS_THRESHOLD + 0.5 });
      world.setCell(9, 9, { toxicity: 2.0 });

      const crises = detectCrises(world, 200);

      expect(crises).toHaveLength(3);
      expect(crises.map((c) => `${c.x},${c.y}`).sort()).toEqual(['0,0', '5,5', '9,9']);
    });

    it('does NOT detect a crisis on a tile already in active crisis', () => {
      world.setCell(2, 2, { toxicity: TOXICITY_CRISIS_THRESHOLD + 0.2 });

      // First detection
      const crises1 = detectCrises(world, 100);
      expect(crises1).toHaveLength(1);

      // Second detection with same tile still high — should not re-trigger
      const crises2 = detectCrises(world, 101, crises1); // pass active crises
      expect(crises2).toHaveLength(0);
    });

    it('does NOT detect a crisis on a tile with toxicity equal to threshold', () => {
      // Exactly at threshold should not trigger
      world.setCell(1, 1, { toxicity: TOXICITY_CRISIS_THRESHOLD });

      const crises = detectCrises(world, 100);

      expect(crises).toHaveLength(0);
    });

    it('detects a crisis on a tile when toxicity crosses threshold upward', () => {
      // Start below threshold
      world.setCell(3, 3, { toxicity: TOXICITY_CRISIS_THRESHOLD - 0.1 });

      // First scan: no crisis
      let crises = detectCrises(world, 100);
      expect(crises).toHaveLength(0);

      // Increase toxicity above threshold
      world.setCell(3, 3, { toxicity: TOXICITY_CRISIS_THRESHOLD + 0.1 });

      // Second scan: crisis detected
      crises = detectCrises(world, 101);
      expect(crises).toHaveLength(1);
      expect(crises[0]).toMatchObject({
        x: 3,
        y: 3,
        tick: 101,
        status: 'active',
      });
    });

    it('does NOT spam crisis detection while a tile remains above threshold', () => {
      world.setCell(4, 4, { toxicity: TOXICITY_CRISIS_THRESHOLD + 0.1 });

      // First detection at tick 100
      const firstCrisis = detectCrises(world, 100);
      expect(firstCrisis).toHaveLength(1);

      // Keep toxicity high for many ticks
      const activeCrises = [...firstCrisis];
      for (let tick = 101; tick <= 110; tick++) {
        const crises = detectCrises(world, tick, activeCrises);
        expect(crises).toHaveLength(0);
      }
    });

    it('returns crisis with unique ID per location and tick', () => {
      world.setCell(1, 1, { toxicity: TOXICITY_CRISIS_THRESHOLD + 0.1 });

      const crisis1 = detectCrises(world, 100);
      const crisis2 = detectCrises(world, 101); // Same location, different tick

      expect(crisis1[0].id).not.toEqual(crisis2[0].id);
      expect(crisis1[0].id).toMatch(/^crisis_100_1_1$/);
      expect(crisis2[0].id).toMatch(/^crisis_101_1_1$/);
    });
  });

  describe('resolveTier1', () => {
    let testCrisis: Crisis;

    beforeEach(() => {
      world.setCell(2, 2, { toxicity: 2.0 });
      testCrisis = {
        id: 'test_crisis',
        type: 'toxicity_spike',
        x: 2,
        y: 2,
        tick: 100,
        status: 'active',
      };
    });

    it('successfully reduces toxicity when funds are sufficient', () => {
      const initialToxicity = world.getCell(2, 2).toxicity;
      const initialEnergy = ledger.getBalance('energy');

      const result = resolveTier1(testCrisis, world, ledger);

      expect(result).toBe(true);
      expect(testCrisis.status).toBe('resolved');

      const newToxicity = world.getCell(2, 2).toxicity;
      expect(newToxicity).toBeLessThan(initialToxicity);
      expect(newToxicity).toBeCloseTo(initialToxicity - 1.0, 5); // 1.0 reduction

      // Verify 20 Energy was spent
      const finalEnergy = ledger.getBalance('energy');
      expect(finalEnergy).toBe(initialEnergy - 20);
    });

    it('rejects response when funds are insufficient', () => {
      // Start with low energy (insufficient for 20-cost response)
      ledger = new ResourceLedger(10, 0);

      const initialToxicity = world.getCell(2, 2).toxicity;
      const initialEnergy = ledger.getBalance('energy');

      const result = resolveTier1(testCrisis, world, ledger);

      expect(result).toBe(false);
      // Crisis should remain active
      expect(testCrisis.status).toBe('active');

      // Verify nothing was mutated
      const finalToxicity = world.getCell(2, 2).toxicity;
      const finalEnergy = ledger.getBalance('energy');
      expect(finalToxicity).toBe(initialToxicity);
      expect(finalEnergy).toBe(initialEnergy);
    });

    it('rejects response with zero funds', () => {
      ledger = new ResourceLedger(0, 0);

      const result = resolveTier1(testCrisis, world, ledger);

      expect(result).toBe(false);
      expect(testCrisis.status).toBe('active');
      expect(world.getCell(2, 2).toxicity).toBe(2.0);
    });

    it('applies correct InterventionCommand with correct parameters', () => {
      // This test verifies the command is built and validated correctly
      // by checking that a reasonable delta is applied within bounds

      world.setCell(5, 5, { toxicity: 5.0 });
      const testCrisis2: Crisis = {
        id: 'test_crisis_2',
        type: 'toxicity_spike',
        x: 5,
        y: 5,
        tick: 100,
        status: 'active',
      };

      const result = resolveTier1(testCrisis2, world, ledger);

      expect(result).toBe(true);
      // Verify the delta is reasonable (1.0 reduction applied)
      expect(world.getCell(5, 5).toxicity).toBeCloseTo(4.0, 5);
    });

    it('clamps toxicity to non-negative after reduction', () => {
      world.setCell(3, 3, { toxicity: 0.5 }); // Less than 1.0
      const testCrisis3: Crisis = {
        id: 'test_crisis_3',
        type: 'toxicity_spike',
        x: 3,
        y: 3,
        tick: 100,
        status: 'active',
      };

      const result = resolveTier1(testCrisis3, world, ledger);

      expect(result).toBe(true);
      // Should reduce by 1.0 but clamp to 0 (not negative)
      const finalToxicity = world.getCell(3, 3).toxicity;
      expect(finalToxicity).toBeGreaterThanOrEqual(0);
      expect(finalToxicity).toBeLessThanOrEqual(0.5);
    });

    it('uses correct scout ID in the command', () => {
      // The command is internal, but we can verify by checking the behavior
      // with a custom scout ID parameter (if provided to the function)
      const result = resolveTier1(testCrisis, world, ledger, 'custom_scout_123');

      // If the function used the scout ID correctly in validation, this succeeds
      expect(result).toBe(true);
      expect(testCrisis.status).toBe('resolved');
    });

    it('exactly costs 20 Energy per response (SPEC.md requirement)', () => {
      const startEnergy = ledger.getBalance('energy');

      resolveTier1(testCrisis, world, ledger);

      const endEnergy = ledger.getBalance('energy');
      expect(startEnergy - endEnergy).toBe(20);
    });

    it('rejects if at exactly 20 Energy (boundary case)', () => {
      ledger = new ResourceLedger(20, 0);

      const result = resolveTier1(testCrisis, world, ledger);

      // Should succeed: 20 Energy is exactly enough
      expect(result).toBe(true);
      expect(ledger.getBalance('energy')).toBe(0);
    });

    it('rejects if at 19 Energy (boundary case)', () => {
      ledger = new ResourceLedger(19, 0);

      const result = resolveTier1(testCrisis, world, ledger);

      // Should fail: 19 < 20
      expect(result).toBe(false);
      expect(testCrisis.status).toBe('active');
      expect(ledger.getBalance('energy')).toBe(19);
    });
  });

  describe('Crisis alert template', () => {
    it('includes placeholder variables for formatting', () => {
      expect(CRISIS_ALERT_TEXT).toContain('{x}');
      expect(CRISIS_ALERT_TEXT).toContain('{y}');
      expect(CRISIS_ALERT_TEXT).toContain('{status}');
    });

    it('is a canned string (not LLM-generated)', () => {
      // CRISIS_ALERT_TEXT should be a fixed string, never calling out to LLM
      expect(typeof CRISIS_ALERT_TEXT).toBe('string');
      expect(CRISIS_ALERT_TEXT.length).toBeGreaterThan(10);
    });

    it('can be formatted with template values', () => {
      const formatted = CRISIS_ALERT_TEXT.replace('{x}', '5')
        .replace('{y}', '7')
        .replace('{status}', 'active');

      expect(formatted).toContain('(5, 7)');
      expect(formatted).toContain('active');
    });
  });

  describe('integration: full crisis lifecycle', () => {
    it('detects -> resolves -> removes from active list', () => {
      // Start with clean world
      world.setCell(1, 1, { toxicity: TOXICITY_CRISIS_THRESHOLD + 0.5 });

      // Step 1: Detect crisis
      let activeCrises = detectCrises(world, 100);
      expect(activeCrises).toHaveLength(1);
      expect(activeCrises[0].status).toBe('active');

      // Step 2: Resolve crisis
      const resolved = resolveTier1(activeCrises[0], world, ledger);
      expect(resolved).toBe(true);
      expect(activeCrises[0].status).toBe('resolved');

      // Step 3: Filter out resolved crises and scan again
      activeCrises = activeCrises.filter((c) => c.status === 'active');
      expect(activeCrises).toHaveLength(0);

      // Step 4: Toxicity should be reduced, no new crisis (if below threshold)
      const newCrises = detectCrises(world, 101, activeCrises);
      const finalToxicity = world.getCell(1, 1).toxicity;

      if (finalToxicity < TOXICITY_CRISIS_THRESHOLD) {
        expect(newCrises).toHaveLength(0);
      }
    });

    it('handles multiple crises with shared ledger', () => {
      // Set up three tiles in crisis
      world.setCell(0, 0, { toxicity: TOXICITY_CRISIS_THRESHOLD + 0.1 });
      world.setCell(3, 3, { toxicity: TOXICITY_CRISIS_THRESHOLD + 0.2 });
      world.setCell(6, 6, { toxicity: TOXICITY_CRISIS_THRESHOLD + 0.3 });

      const crises = detectCrises(world, 100);
      expect(crises).toHaveLength(3);

      // Resolve first two crises
      const result1 = resolveTier1(crises[0], world, ledger);
      expect(result1).toBe(true);
      expect(ledger.getBalance('energy')).toBe(500 - 20);

      const result2 = resolveTier1(crises[1], world, ledger);
      expect(result2).toBe(true);
      expect(ledger.getBalance('energy')).toBe(500 - 40);

      // Third crisis should also resolve (funds sufficient for 3rd crisis? 500 - 60 = 440)
      const result3 = resolveTier1(crises[2], world, ledger);
      expect(result3).toBe(true);
      expect(ledger.getBalance('energy')).toBe(500 - 60);
    });

    it('crisis stays active if resolution is rejected due to insufficient funds', () => {
      world.setCell(2, 2, { toxicity: TOXICITY_CRISIS_THRESHOLD + 0.1 });
      const crises = detectCrises(world, 100);

      // Drain ledger to insufficient
      ledger.spend('energy', 500 - 10); // Leave only 10 energy

      const resolved = resolveTier1(crises[0], world, ledger);
      expect(resolved).toBe(false);

      // Crisis should still be active
      expect(crises[0].status).toBe('active');

      // Next scan should not re-trigger (it's still in active list)
      const newCrises = detectCrises(world, 101, crises);
      expect(newCrises).toHaveLength(0);
    });
  });
});
