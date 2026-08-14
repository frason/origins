import { describe, it, expect } from 'vitest';
import { EquilibriumTracker } from '../../simulation/pivot/equilibrium';

describe('EquilibriumTracker', () => {
  describe('initialization', () => {
    it('should start with streak length 0', () => {
      const tracker = new EquilibriumTracker();
      const progress = tracker.getProgress();
      expect(progress.streakLength).toBe(0);
    });

    it('should start with all conditions not met', () => {
      const tracker = new EquilibriumTracker();
      const progress = tracker.getProgress();
      expect(progress.allConditionsMet).toBe(false);
    });

    it('should start with readyForCompletion false', () => {
      const tracker = new EquilibriumTracker();
      const progress = tracker.getProgress();
      expect(progress.readyForCompletion).toBe(false);
    });
  });

  describe('streak accumulation', () => {
    it('should increment streak when all conditions are met', () => {
      const tracker = new EquilibriumTracker();
      // All conditions met: order=60, chaos=50, exploration=50, replacement=1.0 (ideal)
      tracker.recordTick(60, 50, 50, 1.0, false, false);
      let progress = tracker.getProgress();
      expect(progress.streakLength).toBe(1);

      tracker.recordTick(60, 50, 50, 1.0, false, false);
      progress = tracker.getProgress();
      expect(progress.streakLength).toBe(2);
    });

    it('should not increment streak when order < 50', () => {
      const tracker = new EquilibriumTracker();
      tracker.recordTick(49, 50, 50, 1.0, false, false);
      const progress = tracker.getProgress();
      expect(progress.streakLength).toBe(0);
      expect(progress.allConditionsMet).toBe(false);
    });

    it('should not increment streak when chaos < 40', () => {
      const tracker = new EquilibriumTracker();
      tracker.recordTick(60, 39, 50, 1.0, false, false);
      const progress = tracker.getProgress();
      expect(progress.streakLength).toBe(0);
      expect(progress.allConditionsMet).toBe(false);
    });

    it('should not increment streak when exploration < 40', () => {
      const tracker = new EquilibriumTracker();
      tracker.recordTick(60, 50, 39, 1.0, false, false);
      const progress = tracker.getProgress();
      expect(progress.streakLength).toBe(0);
      expect(progress.allConditionsMet).toBe(false);
    });

    it('should reset streak to 0 when a condition becomes unmet', () => {
      const tracker = new EquilibriumTracker();
      // Build up streak
      tracker.recordTick(60, 50, 50, 1.0, false, false);
      tracker.recordTick(60, 50, 50, 1.0, false, false);
      tracker.recordTick(60, 50, 50, 1.0, false, false);
      let progress = tracker.getProgress();
      expect(progress.streakLength).toBe(3);

      // Break condition
      tracker.recordTick(49, 50, 50, 1.0, false, false);
      progress = tracker.getProgress();
      expect(progress.streakLength).toBe(0);
    });
  });

  describe('intervention handling', () => {
    it('should reset streak to 0 on intervention', () => {
      const tracker = new EquilibriumTracker();
      // Build up streak
      for (let i = 0; i < 10; i++) {
        tracker.recordTick(60, 50, 50, 1.0, false, false);
      }
      let progress = tracker.getProgress();
      expect(progress.streakLength).toBe(10);

      // Apply intervention
      tracker.recordTick(60, 50, 50, 1.0, true, false);
      progress = tracker.getProgress();
      expect(progress.streakLength).toBe(0);
    });

    it('should clear replacement window on intervention', () => {
      const tracker = new EquilibriumTracker();
      // Build replacement window
      for (let i = 0; i < 100; i++) {
        tracker.recordTick(60, 50, 50, 1.0, false, false);
      }

      // Apply intervention
      tracker.recordTick(60, 50, 50, 1.0, true, false);

      // After intervention, conditions should not be met until window rebuilds
      const progress = tracker.getProgress();
      expect(progress.streakLength).toBe(0);
      expect(progress.allConditionsMet).toBe(false);
    });

    it('should fully reset all state on intervention', () => {
      const tracker = new EquilibriumTracker();
      // Build state
      for (let i = 0; i < 50; i++) {
        tracker.recordTick(60, 50, 50, 1.0, false, false);
      }

      // Intervention resets everything
      tracker.recordTick(60, 50, 50, 1.0, true, false);
      const progress = tracker.getProgress();
      expect(progress.streakLength).toBe(0);
      expect(progress.allConditionsMet).toBe(false);
      expect(progress.readyForCompletion).toBe(false);
    });
  });

  describe('pause handling', () => {
    it('should freeze streak while paused (no advance)', () => {
      const tracker = new EquilibriumTracker();
      // Build streak
      for (let i = 0; i < 5; i++) {
        tracker.recordTick(60, 50, 50, 1.0, false, false);
      }
      let progress = tracker.getProgress();
      expect(progress.streakLength).toBe(5);

      // Pause
      tracker.recordTick(60, 50, 50, 1.0, false, true);
      progress = tracker.getProgress();
      // Streak should not advance
      expect(progress.streakLength).toBe(5);
    });

    it('should not reset streak while paused', () => {
      const tracker = new EquilibriumTracker();
      // Build streak
      for (let i = 0; i < 5; i++) {
        tracker.recordTick(60, 50, 50, 1.0, false, false);
      }
      let progress = tracker.getProgress();
      expect(progress.streakLength).toBe(5);

      // Pause with failing condition (should not reset since paused)
      tracker.recordTick(49, 50, 50, 1.0, false, true);
      progress = tracker.getProgress();
      // Streak should still be 5 (frozen, not reset)
      expect(progress.streakLength).toBe(5);
    });

    it('should resume streak accumulation after pause', () => {
      const tracker = new EquilibriumTracker();
      // Build streak
      for (let i = 0; i < 5; i++) {
        tracker.recordTick(60, 50, 50, 1.0, false, false);
      }

      // Pause
      tracker.recordTick(60, 50, 50, 1.0, false, true);
      let progress = tracker.getProgress();
      expect(progress.streakLength).toBe(5);

      // Resume (good conditions again)
      tracker.recordTick(60, 50, 50, 1.0, false, false);
      progress = tracker.getProgress();
      // Streak should now be 6
      expect(progress.streakLength).toBe(6);
    });
  });

  describe('replacement condition (mean and CV)', () => {
    it('should require at least one replacement value', () => {
      const tracker = new EquilibriumTracker();
      // Don't record any values (NaN handling or empty window)
      tracker.recordTick(60, 50, 50, NaN, false, false);
      const progress = tracker.getProgress();
      expect(progress.allConditionsMet).toBe(false);
    });

    it('should accept replacement ratio of 1.0 (perfect mean)', () => {
      const tracker = new EquilibriumTracker();
      tracker.recordTick(60, 50, 50, 1.0, false, false);
      const progress = tracker.getProgress();
      expect(progress.allConditionsMet).toBe(true);
    });

    it('should accept mean at lower bound 0.95', () => {
      const tracker = new EquilibriumTracker();
      tracker.recordTick(60, 50, 50, 0.95, false, false);
      const progress = tracker.getProgress();
      expect(progress.allConditionsMet).toBe(true);
    });

    it('should accept mean at upper bound 1.05', () => {
      const tracker = new EquilibriumTracker();
      tracker.recordTick(60, 50, 50, 1.05, false, false);
      const progress = tracker.getProgress();
      expect(progress.allConditionsMet).toBe(true);
    });

    it('should reject mean below 0.95', () => {
      const tracker = new EquilibriumTracker();
      tracker.recordTick(60, 50, 50, 0.94, false, false);
      const progress = tracker.getProgress();
      expect(progress.allConditionsMet).toBe(false);
    });

    it('should reject mean above 1.05', () => {
      const tracker = new EquilibriumTracker();
      tracker.recordTick(60, 50, 50, 1.06, false, false);
      const progress = tracker.getProgress();
      expect(progress.allConditionsMet).toBe(false);
    });

    it('should calculate correct mean over multiple ticks', () => {
      const tracker = new EquilibriumTracker();
      // Mean of [0.95, 1.0, 1.05] = 1.0
      tracker.recordTick(60, 50, 50, 0.95, false, false);
      tracker.recordTick(60, 50, 50, 1.0, false, false);
      tracker.recordTick(60, 50, 50, 1.05, false, false);
      const progress = tracker.getProgress();
      expect(progress.allConditionsMet).toBe(true);
      expect(progress.streakLength).toBe(3);
    });

    it('should reject when CV exceeds 0.10', () => {
      const tracker = new EquilibriumTracker();
      // Create high-CV data: [0.5, 1.5]
      // mean = 1.0
      // variance = ((0.5-1)^2 + (1.5-1)^2) / 2 = (0.25 + 0.25) / 2 = 0.25
      // stdDev = 0.5
      // CV = 0.5 / 1.0 = 0.5 (exceeds 0.10)
      tracker.recordTick(60, 50, 50, 0.5, false, false);
      const progress1 = tracker.getProgress();
      expect(progress1.allConditionsMet).toBe(false); // Only one point, high variance

      tracker.recordTick(60, 50, 50, 1.5, false, false);
      const progress2 = tracker.getProgress();
      expect(progress2.allConditionsMet).toBe(false); // Mean is 1.0 but CV is 0.5
    });

    it('should accept low-CV data within bounds', () => {
      const tracker = new EquilibriumTracker();
      // Low-CV data clustered around 1.0
      const values = [0.98, 0.99, 1.0, 1.01, 1.02];
      for (const val of values) {
        tracker.recordTick(60, 50, 50, val, false, false);
      }
      const progress = tracker.getProgress();
      // Mean should be around 1.0, CV should be very low
      expect(progress.allConditionsMet).toBe(true);
      expect(progress.streakLength).toBe(5);
    });

    it('should calculate CV correctly over synthetic 100-sample window', () => {
      const tracker = new EquilibriumTracker();
      // Generate 100 values with mean ~1.0 and low variance
      const values: number[] = [];
      for (let i = 0; i < 100; i++) {
        // Add small random perturbation around 1.0 (±2%)
        values.push(1.0 + (Math.random() - 0.5) * 0.04);
      }

      for (const val of values) {
        tracker.recordTick(60, 50, 50, val, false, false);
      }

      const progress = tracker.getProgress();
      // With ±2% perturbation, CV should be well under 0.10
      expect(progress.allConditionsMet).toBe(true);
      expect(progress.streakLength).toBe(100);
    });
  });

  describe('readyForCompletion', () => {
    it('should be false when streak < 2000', () => {
      const tracker = new EquilibriumTracker();
      for (let i = 0; i < 1999; i++) {
        tracker.recordTick(60, 50, 50, 1.0, false, false);
      }
      const progress = tracker.getProgress();
      expect(progress.streakLength).toBe(1999);
      expect(progress.readyForCompletion).toBe(false);
    });

    it('should become true when streak reaches 2000 with all conditions met', () => {
      const tracker = new EquilibriumTracker();
      for (let i = 0; i < 2000; i++) {
        tracker.recordTick(60, 50, 50, 1.0, false, false);
      }
      const progress = tracker.getProgress();
      expect(progress.streakLength).toBe(2000);
      expect(progress.allConditionsMet).toBe(true);
      expect(progress.readyForCompletion).toBe(true);
    });

    it('should stay true after 2000 as long as conditions hold', () => {
      const tracker = new EquilibriumTracker();
      for (let i = 0; i < 2100; i++) {
        tracker.recordTick(60, 50, 50, 1.0, false, false);
      }
      const progress = tracker.getProgress();
      expect(progress.readyForCompletion).toBe(true);
      expect(progress.streakLength).toBe(2100);
    });

    it('should reset readyForCompletion when streak resets', () => {
      const tracker = new EquilibriumTracker();
      for (let i = 0; i < 2000; i++) {
        tracker.recordTick(60, 50, 50, 1.0, false, false);
      }
      let progress = tracker.getProgress();
      expect(progress.readyForCompletion).toBe(true);

      // Break condition
      tracker.recordTick(49, 50, 50, 1.0, false, false);
      progress = tracker.getProgress();
      expect(progress.streakLength).toBe(0);
      expect(progress.readyForCompletion).toBe(false);
    });

    it('should reset readyForCompletion on intervention', () => {
      const tracker = new EquilibriumTracker();
      for (let i = 0; i < 2000; i++) {
        tracker.recordTick(60, 50, 50, 1.0, false, false);
      }
      let progress = tracker.getProgress();
      expect(progress.readyForCompletion).toBe(true);

      // Intervention
      tracker.recordTick(60, 50, 50, 1.0, true, false);
      progress = tracker.getProgress();
      expect(progress.readyForCompletion).toBe(false);
      expect(progress.streakLength).toBe(0);
    });

    it('should not reset readyForCompletion due to pause', () => {
      const tracker = new EquilibriumTracker();
      for (let i = 0; i < 2000; i++) {
        tracker.recordTick(60, 50, 50, 1.0, false, false);
      }
      let progress = tracker.getProgress();
      expect(progress.readyForCompletion).toBe(true);

      // Pause (should not affect readyForCompletion)
      tracker.recordTick(60, 50, 50, 1.0, false, true);
      progress = tracker.getProgress();
      expect(progress.readyForCompletion).toBe(true);
    });
  });

  describe('trailing 2000-tick window', () => {
    it('should maintain only last 2000 replacement values', () => {
      const tracker = new EquilibriumTracker();
      // Record 2100 ticks with varying replacement values
      for (let i = 0; i < 2100; i++) {
        // First 100 values: high (2.0)
        // Next 2000 values: ideal (1.0)
        const val = i < 100 ? 2.0 : 1.0;
        tracker.recordTick(60, 50, 50, val, false, false);
      }

      const progress = tracker.getProgress();
      // After 2100 ticks, window only contains the last 2000 (all with value 1.0)
      // So all conditions should be met
      expect(progress.allConditionsMet).toBe(true);
      expect(progress.streakLength).toBeGreaterThan(0);
    });

    it('should properly handle window boundaries', () => {
      const tracker = new EquilibriumTracker();
      // Record exactly 2000 ticks with perfect values
      for (let i = 0; i < 2000; i++) {
        tracker.recordTick(60, 50, 50, 1.0, false, false);
      }
      let progress = tracker.getProgress();
      expect(progress.streakLength).toBe(2000);
      expect(progress.readyForCompletion).toBe(true);

      // One more tick with same good value
      tracker.recordTick(60, 50, 50, 1.0, false, false);
      progress = tracker.getProgress();
      expect(progress.streakLength).toBe(2001);
      expect(progress.readyForCompletion).toBe(true);
    });
  });

  describe('edge cases and integration', () => {
    it('should handle NaN replacement values (no window entry)', () => {
      const tracker = new EquilibriumTracker();
      tracker.recordTick(60, 50, 50, NaN, false, false);
      const progress = tracker.getProgress();
      expect(progress.allConditionsMet).toBe(false); // No valid data
    });

    it('should handle intervention immediately after pause', () => {
      const tracker = new EquilibriumTracker();
      for (let i = 0; i < 10; i++) {
        tracker.recordTick(60, 50, 50, 1.0, false, false);
      }

      // Pause then intervene
      tracker.recordTick(60, 50, 50, 1.0, false, true);
      tracker.recordTick(60, 50, 50, 1.0, true, false);

      const progress = tracker.getProgress();
      expect(progress.streakLength).toBe(0);
      expect(progress.readyForCompletion).toBe(false);
    });

    it('should rebuild streak after intervention', () => {
      const tracker = new EquilibriumTracker();
      // Build streak
      for (let i = 0; i < 10; i++) {
        tracker.recordTick(60, 50, 50, 1.0, false, false);
      }
      let progress = tracker.getProgress();
      expect(progress.streakLength).toBe(10);

      // Intervene (reset)
      tracker.recordTick(60, 50, 50, 1.0, true, false);
      progress = tracker.getProgress();
      expect(progress.streakLength).toBe(0);

      // Rebuild
      for (let i = 0; i < 5; i++) {
        tracker.recordTick(60, 50, 50, 1.0, false, false);
      }
      progress = tracker.getProgress();
      expect(progress.streakLength).toBe(5);
    });

    it('should correctly implement all four conditions simultaneously', () => {
      const tracker = new EquilibriumTracker();
      // Test each condition separately failing
      const failCases = [
        { order: 49, chaos: 50, exploration: 50, repl: 1.0 }, // order fails
        { order: 60, chaos: 39, exploration: 50, repl: 1.0 }, // chaos fails
        { order: 60, chaos: 50, exploration: 39, repl: 1.0 }, // exploration fails
        { order: 60, chaos: 50, exploration: 50, repl: 0.9 }, // replacement fails
      ];

      for (const failCase of failCases) {
        const t = new EquilibriumTracker();
        t.recordTick(failCase.order, failCase.chaos, failCase.exploration, failCase.repl, false, false);
        const p = t.getProgress();
        expect(p.allConditionsMet).toBe(false);
      }

      // All conditions pass
      const tracker2 = new EquilibriumTracker();
      tracker2.recordTick(60, 50, 50, 1.0, false, false);
      const progress = tracker2.getProgress();
      expect(progress.allConditionsMet).toBe(true);
    });
  });
});
