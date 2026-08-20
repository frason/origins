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
 * 1. Target coordinates must be within world bounds [0, 100)
 * 2. Parameter must be whitelisted in the provided parameterConfig
 * 3. Value outside [min, max] is clamped to the nearest bound (hard limits are soft)
 * 4. Value (absolute) must not exceed maxDeltaPerCommand (delta cap is hard)
 *
 * If value is outside [min, max], it's clamped to the nearest bound and clampedValue
 * is returned (valid: true, caller should use clampedValue).
 * If value exceeds maxDeltaPerCommand (even if within [min, max]), validation fails (valid: false).
 * If targetX or targetY are out of bounds, validation fails (rejected, not clamped).
 *
 * @param cmd - The InterventionCommand to validate
 * @param worldWidth - World width (default 100)
 * @param worldHeight - World height (default 100)
 * @param parameterConfig - Parameter configuration table mapping paramName to {min, max, maxDeltaPerCommand} (default WHITELISTED_PARAMETERS)
 */
export function validateInterventionCommand(
  cmd: InterventionCommand,
  worldWidth: number = 100,
  worldHeight: number = 100,
  parameterConfig: Record<string, ParameterBounds> = WHITELISTED_PARAMETERS
): ValidationResult {
  // Check 0: target coordinates must be within world bounds
  if (cmd.targetX < 0 || cmd.targetX >= worldWidth || cmd.targetY < 0 || cmd.targetY >= worldHeight) {
    return {
      valid: false,
      reason: `Target coordinates (${cmd.targetX}, ${cmd.targetY}) out of world bounds [0, ${worldWidth}) × [0, ${worldHeight})`,
    };
  }

  // Check 1: parameter must be whitelisted
  if (!(cmd.parameter in parameterConfig)) {
    return {
      valid: false,
      reason: `Parameter '${cmd.parameter}' is not whitelisted. Allowed: ${Object.keys(parameterConfig).join(', ')}`,
    };
  }

  const bounds = parameterConfig[cmd.parameter];

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

/**
 * Validated command log entry: a command that has already passed validateInterventionCommand.
 * This type exists to make it explicit in code that the command is validated (for type safety).
 * The `validationResult` field stores the validation result for reference.
 */
export interface ValidatedCommandLogEntry {
  command: InterventionCommand;
  validationResult: ValidationResult;
  appendedAtTick: number; // tick when command was appended to log
}

/**
 * Append a validated command to the command log.
 *
 * This function enforces that only commands that have actually passed validateInterventionCommand
 * are appended. It performs self-validation by re-running validateInterventionCommand internally
 * and comparing the result with the caller-supplied result. This prevents callers from spoofing
 * a fake validation result for an invalid command.
 *
 * Security enforcement:
 *   - Always calls validateInterventionCommand(command) internally (re-validation)
 *   - Compares internal result with caller-supplied result
 *   - If they differ, throws an error (caller is spoofing validation)
 *   - Never appends unvalidated commands, even if caller passes {valid: true}
 *
 * Usage pattern:
 *   1. Call validateInterventionCommand(cmd, worldWidth, worldHeight, parameterConfig)
 *   2. Check if result.valid === true
 *   3. If true, call appendValidatedCommand(log, cmd, validationResult, currentTick, parameterConfig)
 *   4. If false, reject/handle the error
 *
 * @param log - The command log array to append to (mutated in-place)
 * @param command - The InterventionCommand to append (will be re-validated internally)
 * @param validationResult - The result from validateInterventionCommand; must match internal validation
 * @param currentTick - Current simulation tick (recorded in appendedAtTick)
 * @param parameterConfig - Parameter configuration table (default WHITELISTED_PARAMETERS); must match the config used for initial validation
 * @throws Error if caller-supplied validation does not match internal validation (spoofing attempt)
 * @throws Error if internal validation fails
 * @returns The appended entry for confirmation
 */
export function appendValidatedCommand(
  log: ValidatedCommandLogEntry[],
  command: InterventionCommand,
  validationResult: ValidationResult,
  currentTick: number,
  parameterConfig: Record<string, ParameterBounds> = WHITELISTED_PARAMETERS
): ValidatedCommandLogEntry {
  // Self-validation: re-run validateInterventionCommand internally with same parameterConfig
  // This prevents callers from spoofing a fake {valid: true} result for an invalid command
  const internalValidation = validateInterventionCommand(command, 100, 100, parameterConfig);

  // Enforce: internal validation must pass
  if (!internalValidation.valid) {
    throw new Error(
      `Cannot append unvalidated command to log. Internal validation failed: ${internalValidation.reason}`
    );
  }

  // Enforce: caller-supplied result must match internal result
  // This catches attempts to spoof a valid result for a command that would fail validation
  if (!validationResult.valid) {
    throw new Error(
      `Cannot append unvalidated command to log. Validation failed: ${validationResult.reason}`
    );
  }

  // Verify both results agree on the outcome
  // If internal says valid but caller says invalid (or vice versa), it's a spoofing attempt
  if (internalValidation.valid !== validationResult.valid) {
    throw new Error(
      `Cannot append unvalidated command to log. Validation result mismatch: ` +
        `internal validation ${internalValidation.valid !== validationResult.valid ? 'differs from' : 'matches'} caller supplied. ` +
        `This indicates a spoofing or calling error.`
    );
  }

  const entry: ValidatedCommandLogEntry = {
    command,
    validationResult: internalValidation, // Use internal validation result for authoritative record
    appendedAtTick: currentTick,
  };

  log.push(entry);
  return entry;
}
