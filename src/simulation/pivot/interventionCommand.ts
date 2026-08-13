/**
 * Phase 0 InterventionCommand
 *
 * Typed command shape for intervention actions (Tier 1, 2, 3 responses)
 * Every command must pass validation before being applied to simulation state:
 * 1. Whitelist (parameter must be in WHITELISTED_PARAMETERS)
 * 2. Hard bounds (value must be within [min, max])
 * 3. Per-command delta cap (value cannot exceed maxDeltaPerCommand in a single command)
 *
 * This implementation is reused by Phase A's Tier 2/3 LLM paths.
 * (see SPEC.md "InterventionCommand", lines 102-109)
 */

/**
 * InterventionCommand: the canonical shape for all interventions
 */
export interface InterventionCommand {
  id: string; // unique identifier for this command
  tick: number; // simulation tick when issued
  tier: 1 | 2 | 3; // intervention tier (Phase 0 only uses Tier 1)
  sourceScoutId: string; // which scout issued this command
  targetX: number; // target cell X coordinate
  targetY: number; // target cell Y coordinate
  parameter: string; // name of the parameter being modified (must be whitelisted)
  value: number; // the new value or delta to apply
}

/**
 * Parameter bounds: whitelist of allowed interventions
 * Each parameter has:
 *   - min: hard minimum value allowed
 *   - max: hard maximum value allowed
 *   - maxDeltaPerCommand: largest single-command delta allowed (prevents one-shot exploits)
 */
export interface ParameterBounds {
  min: number;
  max: number;
  maxDeltaPerCommand: number;
}

/**
 * WHITELISTED_PARAMETERS: Phase 0 only supports toxicity_reduction
 * Seeded with reasonable bounds based on typical toxicity simulation ranges
 *
 * toxicity_reduction: a delta reduction applied to a cell's toxicity field
 *   - min: 0 (cannot increase toxicity)
 *   - max: 50 (hard cap on single reduction, prevents over-remediation)
 *   - maxDeltaPerCommand: 15 (per-command delta cap, prevents abuse)
 */
export const WHITELISTED_PARAMETERS: Record<string, ParameterBounds> = {
  toxicity_reduction: {
    min: 0,
    max: 50,
    maxDeltaPerCommand: 15,
  },
} as const;

/**
 * Validation result returned by validateInterventionCommand
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
  clampedValue?: number;
}

/**
 * Validate an InterventionCommand
 *
 * Returns:
 *   - { valid: true, clampedValue?: number } if command passes all checks
 *   - { valid: false, reason: string } if any check fails
 *
 * Checks (in order):
 * 1. Parameter must be whitelisted
 * 2. Value outside [min, max] is clamped to the nearest bound (hard limits are soft)
 * 3. Value (absolute) must not exceed maxDeltaPerCommand (delta cap is hard)
 *
 * If value is outside [min, max], it's clamped to the nearest bound and clampedValue
 * is returned (valid: true, caller should use clampedValue).
 * If value exceeds maxDeltaPerCommand (even if within [min, max]), validation fails (valid: false).
 */
export function validateInterventionCommand(cmd: InterventionCommand): ValidationResult {
  // Check 1: parameter must be whitelisted
  if (!(cmd.parameter in WHITELISTED_PARAMETERS)) {
    return {
      valid: false,
      reason: `Parameter '${cmd.parameter}' is not whitelisted. Allowed: ${Object.keys(WHITELISTED_PARAMETERS).join(', ')}`,
    };
  }

  const bounds = WHITELISTED_PARAMETERS[cmd.parameter];

  // Check 2: clamp value to hard bounds [min, max]
  let effectiveValue = cmd.value;
  let clampedValue: number | undefined;

  if (cmd.value < bounds.min) {
    effectiveValue = bounds.min;
    clampedValue = bounds.min;
  } else if (cmd.value > bounds.max) {
    effectiveValue = bounds.max;
    clampedValue = bounds.max;
  }

  // Check 3: per-command delta cap (hard constraint, cannot be exceeded)
  const absDelta = Math.abs(effectiveValue);
  if (absDelta > bounds.maxDeltaPerCommand) {
    return {
      valid: false,
      reason: `Value ${effectiveValue} exceeds maxDeltaPerCommand ${bounds.maxDeltaPerCommand} for '${cmd.parameter}'`,
    };
  }

  // If we clamped due to bounds, return the clamped value
  if (clampedValue !== undefined) {
    return {
      valid: true,
      clampedValue,
      reason: `Value ${cmd.value} clamped to [${bounds.min}, ${bounds.max}] for '${cmd.parameter}'`,
    };
  }

  return {
    valid: true,
  };
}
