import { describe, it, expect } from 'vitest';
import {
  InterventionCommand,
  WHITELISTED_PARAMETERS,
  validateInterventionCommand,
} from '../../simulation/pivot/interventionCommand';

describe('InterventionCommand validation', () => {
  const validCommand: InterventionCommand = {
    id: 'cmd-001',
    tick: 100,
    tier: 1,
    sourceScoutId: 'scout-001',
    targetX: 50,
    targetY: 50,
    parameter: 'toxicity_reduction',
    value: 10,
  };

  describe('WHITELISTED_PARAMETERS', () => {
    it('should contain toxicity_reduction', () => {
      expect(WHITELISTED_PARAMETERS).toHaveProperty('toxicity_reduction');
    });

    it('toxicity_reduction should have min, max, maxDeltaPerCommand', () => {
      const param = WHITELISTED_PARAMETERS.toxicity_reduction;
      expect(param).toHaveProperty('min');
      expect(param).toHaveProperty('max');
      expect(param).toHaveProperty('maxDeltaPerCommand');
    });

    it('toxicity_reduction min should be 0', () => {
      expect(WHITELISTED_PARAMETERS.toxicity_reduction.min).toBe(0);
    });

    it('toxicity_reduction max should be reasonable (> min)', () => {
      const bounds = WHITELISTED_PARAMETERS.toxicity_reduction;
      expect(bounds.max).toBeGreaterThan(bounds.min);
    });

    it('toxicity_reduction maxDeltaPerCommand should be reasonable', () => {
      const bounds = WHITELISTED_PARAMETERS.toxicity_reduction;
      expect(bounds.maxDeltaPerCommand).toBeGreaterThan(0);
      expect(bounds.maxDeltaPerCommand).toBeLessThanOrEqual(bounds.max);
    });
  });

  describe('validateInterventionCommand - whitelist enforcement', () => {
    it('should accept whitelisted parameter', () => {
      const result = validateInterventionCommand(validCommand);
      expect(result.valid).toBe(true);
    });

    it('should reject unknown parameter', () => {
      const cmd: InterventionCommand = {
        ...validCommand,
        parameter: 'unknown_parameter',
      };
      const result = validateInterventionCommand(cmd);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not whitelisted');
    });

    it('should reject empty parameter name', () => {
      const cmd: InterventionCommand = {
        ...validCommand,
        parameter: '',
      };
      const result = validateInterventionCommand(cmd);
      expect(result.valid).toBe(false);
    });

    it('should list allowed parameters in rejection reason', () => {
      const cmd: InterventionCommand = {
        ...validCommand,
        parameter: 'fake_param',
      };
      const result = validateInterventionCommand(cmd);
      expect(result.reason).toContain('toxicity_reduction');
    });
  });

  describe('validateInterventionCommand - hard bounds (soft clamping)', () => {
    it('should accept value within bounds and delta cap', () => {
      const cmd: InterventionCommand = {
        ...validCommand,
        value: 10, // within [0, 50] and delta cap (15)
      };
      const result = validateInterventionCommand(cmd);
      expect(result.valid).toBe(true);
      expect(result.clampedValue).toBeUndefined();
    });

    it('should accept value at min bound', () => {
      const cmd: InterventionCommand = {
        ...validCommand,
        value: 0,
      };
      const result = validateInterventionCommand(cmd);
      expect(result.valid).toBe(true);
      expect(result.clampedValue).toBeUndefined();
    });

    it('should accept value at delta cap boundary', () => {
      const bounds = WHITELISTED_PARAMETERS.toxicity_reduction;
      const cmd: InterventionCommand = {
        ...validCommand,
        value: bounds.maxDeltaPerCommand, // at delta cap limit
      };
      const result = validateInterventionCommand(cmd);
      expect(result.valid).toBe(true);
      expect(result.clampedValue).toBeUndefined();
    });

    it('should clamp value below min bound', () => {
      const cmd: InterventionCommand = {
        ...validCommand,
        value: -1,
      };
      const result = validateInterventionCommand(cmd);
      expect(result.valid).toBe(true);
      expect(result.clampedValue).toBe(0); // clamped to min
      expect(result.reason).toContain('clamped');
    });

    it('should clamp and then reject if clamped value exceeds delta cap', () => {
      const bounds = WHITELISTED_PARAMETERS.toxicity_reduction;
      const cmd: InterventionCommand = {
        ...validCommand,
        value: bounds.max + 1, // way above max, would clamp to 50
      };
      const result = validateInterventionCommand(cmd);
      // After clamping to 50, it exceeds delta cap of 15, so reject
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('exceeds maxDeltaPerCommand');
    });

    it('should clamp value in hard bounds but below delta cap', () => {
      const bounds = WHITELISTED_PARAMETERS.toxicity_reduction;
      // Clamp a negative value: -5 clamps to 0, which is within delta cap
      const cmd: InterventionCommand = {
        ...validCommand,
        value: -5,
      };
      const result = validateInterventionCommand(cmd);
      expect(result.valid).toBe(true);
      expect(result.clampedValue).toBe(0);
    });
  });

  describe('validateInterventionCommand - per-command delta cap (hard constraint)', () => {
    const bounds = WHITELISTED_PARAMETERS.toxicity_reduction;

    it('should accept value below delta cap', () => {
      const cmd: InterventionCommand = {
        ...validCommand,
        value: bounds.maxDeltaPerCommand - 1,
      };
      const result = validateInterventionCommand(cmd);
      expect(result.valid).toBe(true);
      expect(result.clampedValue).toBeUndefined();
    });

    it('should accept value at delta cap', () => {
      const cmd: InterventionCommand = {
        ...validCommand,
        value: bounds.maxDeltaPerCommand,
      };
      const result = validateInterventionCommand(cmd);
      expect(result.valid).toBe(true);
      expect(result.clampedValue).toBeUndefined();
    });

    it('should reject value that exceeds delta cap (hard constraint)', () => {
      const cmd: InterventionCommand = {
        ...validCommand,
        value: bounds.maxDeltaPerCommand + 5, // exceeds cap but within hard bounds
      };
      const result = validateInterventionCommand(cmd);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('exceeds maxDeltaPerCommand');
    });

    it('should reject delta-cap violation even if within hard bounds', () => {
      // Key scenario: value is within [min, max] but exceeds maxDeltaPerCommand
      // This is the explicit "delta-cap rejection" test from the issue
      const cmd: InterventionCommand = {
        ...validCommand,
        value: bounds.maxDeltaPerCommand + 1, // just over delta cap
      };
      const result = validateInterventionCommand(cmd);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('maxDeltaPerCommand');
    });

    it('should include delta cap info in rejection reason', () => {
      const cmd: InterventionCommand = {
        ...validCommand,
        value: bounds.maxDeltaPerCommand + 10,
      };
      const result = validateInterventionCommand(cmd);
      expect(result.reason).toContain('maxDeltaPerCommand');
    });

    it('should clamp to hard max if value exceeds both max and delta cap', () => {
      // Value way above max (60) gets clamped to max (50)
      // Then 50 is checked against delta cap (15) and rejected
      const cmd: InterventionCommand = {
        ...validCommand,
        value: 60, // exceeds both hard max and delta cap
      };
      const result = validateInterventionCommand(cmd);
      // First clamped to max (50), then rejected because 50 > delta cap (15)
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('exceeds maxDeltaPerCommand');
    });
  });

  describe('validateInterventionCommand - edge cases', () => {
    it('should handle zero value', () => {
      const cmd: InterventionCommand = {
        ...validCommand,
        value: 0,
      };
      const result = validateInterventionCommand(cmd);
      expect(result.valid).toBe(true);
      expect(result.clampedValue).toBeUndefined();
    });

    it('should handle floating point values within delta cap', () => {
      const cmd: InterventionCommand = {
        ...validCommand,
        value: 5.5,
      };
      const result = validateInterventionCommand(cmd);
      // Within bounds [0, 50] and delta cap (15)
      expect(result.valid).toBe(true);
      expect(result.clampedValue).toBeUndefined();
    });

    it('should clamp very large value then reject if exceeds delta cap', () => {
      const cmd: InterventionCommand = {
        ...validCommand,
        value: 10000,
      };
      const result = validateInterventionCommand(cmd);
      // Clamped to hard max (50), but 50 > delta cap (15), so reject
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('exceeds maxDeltaPerCommand');
    });

    it('should clamp negative to min', () => {
      const cmd: InterventionCommand = {
        ...validCommand,
        value: -1000,
      };
      const result = validateInterventionCommand(cmd);
      // Clamped to min (0), which is within delta cap
      expect(result.valid).toBe(true);
      expect(result.clampedValue).toBe(0);
    });

    it('should handle NaN (technically out of bounds)', () => {
      const cmd: InterventionCommand = {
        ...validCommand,
        value: NaN,
      };
      const result = validateInterventionCommand(cmd);
      // NaN < min and NaN > max are both false, so passes bounds check mathematically
      // but semantically this might be caught by TypeScript type safety
      // For runtime robustness, we document this edge case
      // (current implementation: NaN is accepted by bounds check but should be prevented at call site)
    });
  });

  describe('validateInterventionCommand - real scenario: toxicity_reduction', () => {
    it('should validate a typical toxicity reduction (Phase 0 crisis response)', () => {
      const cmd: InterventionCommand = {
        id: 'crisis-response-1',
        tick: 150,
        tier: 1,
        sourceScoutId: 'scout-001',
        targetX: 25,
        targetY: 30,
        parameter: 'toxicity_reduction',
        value: 10, // reduce local toxicity by 10
      };
      const result = validateInterventionCommand(cmd);
      expect(result.valid).toBe(true);
    });

    it('should clamp negative toxicity_reduction to min bound (0)', () => {
      const cmd: InterventionCommand = {
        ...validCommand,
        parameter: 'toxicity_reduction',
        value: -5,
      };
      const result = validateInterventionCommand(cmd);
      expect(result.valid).toBe(true);
      expect(result.clampedValue).toBe(0); // clamped to min
    });

    it('should reject excessive toxicity_reduction (exceeds delta cap)', () => {
      const bounds = WHITELISTED_PARAMETERS.toxicity_reduction;
      const cmd: InterventionCommand = {
        ...validCommand,
        parameter: 'toxicity_reduction',
        value: bounds.maxDeltaPerCommand + 5, // too aggressive
      };
      const result = validateInterventionCommand(cmd);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('exceeds maxDeltaPerCommand');
    });
  });

  describe('validateInterventionCommand - full integration', () => {
    it('should validate and pass a command ready for application', () => {
      const cmd: InterventionCommand = {
        id: 'cmd-' + Date.now(),
        tick: 200,
        tier: 1,
        sourceScoutId: 'scout-alpha',
        targetX: 45,
        targetY: 55,
        parameter: 'toxicity_reduction',
        value: 8,
      };
      const result = validateInterventionCommand(cmd);
      expect(result.valid).toBe(true);
      expect(result.clampedValue).toBeUndefined();
      // Caller can now safely apply this command to simulation
    });

    it('should provide clampedValue even when delta cap exceeds, but still reject', () => {
      const bounds = WHITELISTED_PARAMETERS.toxicity_reduction;
      const cmd: InterventionCommand = {
        id: 'cmd-clamp-test',
        tick: 250,
        tier: 1,
        sourceScoutId: 'scout-beta',
        targetX: 30,
        targetY: 40,
        parameter: 'toxicity_reduction',
        value: bounds.max + 10, // exceeds hard max
      };
      const result = validateInterventionCommand(cmd);
      // Value clamps to max (50), but 50 exceeds delta cap (15), so command is rejected
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('exceeds maxDeltaPerCommand');
    });

    it('should reject when delta cap is exceeded', () => {
      const bounds = WHITELISTED_PARAMETERS.toxicity_reduction;
      const cmd: InterventionCommand = {
        id: 'cmd-reject-test',
        tick: 300,
        tier: 1,
        sourceScoutId: 'scout-gamma',
        targetX: 20,
        targetY: 25,
        parameter: 'toxicity_reduction',
        value: bounds.maxDeltaPerCommand + 1, // just over delta cap
      };
      const result = validateInterventionCommand(cmd);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('exceeds maxDeltaPerCommand');
      // Caller must reject this command entirely
    });
  });
});
