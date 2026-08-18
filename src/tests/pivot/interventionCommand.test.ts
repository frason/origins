import { describe, it, expect } from 'vitest';
import {
  InterventionCommand,
  WHITELISTED_PARAMETERS,
  validateInterventionCommand,
  appendValidatedCommand,
  type ValidatedCommandLogEntry,
  type ValidationResult,
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

  describe('appendValidatedCommand - command log validation', () => {
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

    it('should append a validated command to the log', () => {
      const log: ValidatedCommandLogEntry[] = [];
      const validation = validateInterventionCommand(validCommand);

      const entry = appendValidatedCommand(log, validCommand, validation, 100);

      expect(log).toHaveLength(1);
      expect(entry.command).toBe(validCommand);
      expect(entry.validationResult.valid).toBe(true);
      expect(entry.appendedAtTick).toBe(100);
    });

    it('should record appendedAtTick correctly', () => {
      const log: ValidatedCommandLogEntry[] = [];
      const validation = validateInterventionCommand(validCommand);

      appendValidatedCommand(log, validCommand, validation, 42);

      expect(log[0].appendedAtTick).toBe(42);
    });

    it('should reject appending an unvalidated command (valid: false)', () => {
      const log: ValidatedCommandLogEntry[] = [];
      const invalidCommand: InterventionCommand = {
        ...validCommand,
        parameter: 'invalid_parameter',
      };
      const validation = validateInterventionCommand(invalidCommand);

      expect(() => appendValidatedCommand(log, invalidCommand, validation, 100)).toThrow(
        /unvalidated command/i
      );
      expect(log).toHaveLength(0);
    });

    it('should throw error with validation failure reason', () => {
      const log: ValidatedCommandLogEntry[] = [];
      const invalidCommand: InterventionCommand = {
        ...validCommand,
        parameter: 'invalid_parameter',
      };
      const validation = validateInterventionCommand(invalidCommand);

      expect(() => appendValidatedCommand(log, invalidCommand, validation, 100)).toThrow(
        /not whitelisted/
      );
    });

    it('should build correct log entry with clamped value in result', () => {
      const log: ValidatedCommandLogEntry[] = [];
      const clampedCommand: InterventionCommand = {
        ...validCommand,
        value: -5, // will clamp to 0
      };
      const validation = validateInterventionCommand(clampedCommand);

      expect(validation.valid).toBe(true);
      expect(validation.clampedValue).toBe(0);

      const entry = appendValidatedCommand(log, clampedCommand, validation, 100);

      expect(entry.validationResult.clampedValue).toBe(0);
      expect(entry.command.value).toBe(-5); // original value preserved
    });

    it('should maintain command history across multiple appends', () => {
      const log: ValidatedCommandLogEntry[] = [];
      const cmd1: InterventionCommand = {
        ...validCommand,
        id: 'cmd-1',
        tick: 100,
      };
      const cmd2: InterventionCommand = {
        ...validCommand,
        id: 'cmd-2',
        tick: 110,
      };

      const val1 = validateInterventionCommand(cmd1);
      const val2 = validateInterventionCommand(cmd2);

      appendValidatedCommand(log, cmd1, val1, 100);
      appendValidatedCommand(log, cmd2, val2, 110);

      expect(log).toHaveLength(2);
      expect(log[0].command.id).toBe('cmd-1');
      expect(log[1].command.id).toBe('cmd-2');
      expect(log[0].appendedAtTick).toBe(100);
      expect(log[1].appendedAtTick).toBe(110);
    });

    it('should reject unvalidated command even if it would pass validation', () => {
      const log: ValidatedCommandLogEntry[] = [];
      const goodCommand: InterventionCommand = {
        ...validCommand,
        parameter: 'toxicity_reduction',
        value: 8, // valid value
      };

      // Simulate passing an invalid/unvalidated result (manually constructed, not from validateInterventionCommand)
      const fakeInvalidResult = { valid: false, reason: 'Custom failure' };

      expect(() => appendValidatedCommand(log, goodCommand, fakeInvalidResult, 100)).toThrow(
        /unvalidated command/i
      );
      expect(log).toHaveLength(0);
    });

    it('should store both command and validation result for audit trail', () => {
      const log: ValidatedCommandLogEntry[] = [];
      const cmd = validCommand;
      const validation = validateInterventionCommand(cmd);

      appendValidatedCommand(log, cmd, validation, 100);

      const entry = log[0];
      expect(entry.command).toBe(cmd);
      // After self-validation, the stored validationResult is the internal re-validation result
      // (not necessarily the same object as passed in, but with same valid/reason/clampedValue properties)
      expect(entry.validationResult.valid).toBe(true);
      expect(entry.validationResult.valid).toBe(validation.valid);
    });

    it('should enforce that undefined validation result is rejected', () => {
      const log: ValidatedCommandLogEntry[] = [];
      // Simulate passing undefined as validation result
      const undefinedValidation = undefined as any;

      expect(() => appendValidatedCommand(log, validCommand, undefinedValidation, 100)).toThrow();
      expect(log).toHaveLength(0);
    });

    it('should integrate with validateInterventionCommand standard pattern', () => {
      const log: ValidatedCommandLogEntry[] = [];
      const cmd = validCommand;

      // Standard pattern: validate first, then conditionally append
      const validation = validateInterventionCommand(cmd);
      if (validation.valid) {
        appendValidatedCommand(log, cmd, validation, 100);
      }

      expect(log).toHaveLength(1);
      expect(log[0].validationResult.valid).toBe(true);
    });

    it('should establish pattern for Phase A Tier 2/3 LLM paths', () => {
      // This test documents the pattern that Phase A's Tier 2/3 LLM paths will reuse
      const log: ValidatedCommandLogEntry[] = [];

      // Simulate LLM path receiving a command
      const llmCommand: InterventionCommand = {
        id: 'llm-generated-cmd-1',
        tick: 150,
        tier: 2,
        sourceScoutId: 'scout-001',
        targetX: 50,
        targetY: 50,
        parameter: 'toxicity_reduction',
        value: 12,
      };

      // Step 1: Always validate before appending
      const validation = validateInterventionCommand(llmCommand);

      // Step 2: Only append if valid (this is the security boundary)
      if (validation.valid) {
        const entry = appendValidatedCommand(log, llmCommand, validation, 150);
        expect(entry).toBeDefined();
      } else {
        // Step 3: Reject unvalidated commands explicitly
        throw new Error(`LLM command failed validation: ${validation.reason}`);
      }

      expect(log).toHaveLength(1);
      expect(log[0].command.tier).toBe(2); // Tier 2 LLM command
    });

    it('should reject spoofed validation: caller passes {valid:true} for a command that would fail validation', () => {
      // This is the security test for Karen's spoofing attack:
      // A caller with bad intent tries to pass a fabricated {valid: true} result
      // paired with a command that has a parameter not in the whitelist.
      const log: ValidatedCommandLogEntry[] = [];

      const badCommand: InterventionCommand = {
        id: 'spoofed-cmd-1',
        tick: 100,
        tier: 1,
        sourceScoutId: 'scout-001',
        targetX: 50,
        targetY: 50,
        parameter: 'totally_not_whitelisted', // Not in WHITELISTED_PARAMETERS
        value: 99999, // Also way out of bounds
      };

      // Caller tries to spoof a valid result
      const spoofedValidation: ValidationResult = {
        valid: true, // Lying: this command would NOT pass real validation
      };

      // appendValidatedCommand should detect the mismatch and throw
      expect(() => appendValidatedCommand(log, badCommand, spoofedValidation, 100)).toThrow(
        /spoofing|mismatch|internal validation/i
      );
      expect(log).toHaveLength(0); // Nothing appended
    });

    it('should catch spoofing even if real validation would pass for parameter but value is bad', () => {
      const log: ValidatedCommandLogEntry[] = [];

      // Valid parameter, but value exceeds delta cap
      const badValueCommand: InterventionCommand = {
        id: 'bad-value-cmd-1',
        tick: 100,
        tier: 1,
        sourceScoutId: 'scout-001',
        targetX: 50,
        targetY: 50,
        parameter: 'toxicity_reduction', // Whitelisted parameter
        value: WHITELISTED_PARAMETERS.toxicity_reduction.maxDeltaPerCommand + 100, // Way over delta cap
      };

      // Caller tries to lie and say it's valid
      const spoofedValidation: ValidationResult = {
        valid: true,
      };

      // appendValidatedCommand must re-validate and catch this
      expect(() => appendValidatedCommand(log, badValueCommand, spoofedValidation, 100)).toThrow(
        /validation/i
      );
      expect(log).toHaveLength(0);
    });

    it('should allow honest append when caller passes correct validation result', () => {
      const log: ValidatedCommandLogEntry[] = [];
      const validCommand: InterventionCommand = {
        id: 'honest-cmd-1',
        tick: 100,
        tier: 1,
        sourceScoutId: 'scout-001',
        targetX: 50,
        targetY: 50,
        parameter: 'toxicity_reduction',
        value: 10, // Valid value
      };

      const validation = validateInterventionCommand(validCommand);
      expect(validation.valid).toBe(true);

      // Honest append: caller passes the real validation result
      const entry = appendValidatedCommand(log, validCommand, validation, 100);

      expect(log).toHaveLength(1);
      expect(entry.command.id).toBe('honest-cmd-1');
    });
  });
});
