/**
 * Natural Disaster Command
 *
 * Typed command shape for triggering natural disasters.
 * Every command must pass validation before being applied to simulation state:
 * 1. Disaster kind must be valid and in ENABLED_DISASTERS
 * 2. Target coordinates must be within world bounds
 * 3. Radius must be within configured bounds
 *
 * All disasters are seeded through the RNG system for determinism and replay.
 */

import type { NaturalDisasterKind } from './disasters';

/**
 * DisasterCommand: the canonical shape for player-triggered disasters
 */
export interface DisasterCommand {
  id: string; // unique identifier for this command
  tick: number; // simulation tick when issued
  disasterKind: NaturalDisasterKind; // type of disaster
  centerX: number; // target cell X coordinate
  centerY: number; // target cell Y coordinate
  radius?: number; // optional radius override (uses default if not provided)
}

/**
 * Disaster configuration: which disasters are available to players
 */
export interface DisasterBounds {
  min: number; // minimum radius
  max: number; // maximum radius
  defaultRadius: number; // default radius
}

/**
 * ENABLED_DISASTERS: Set of disasters available to players
 * All 8 types are available: 3 beneficial, 5 harmful
 *
 * Each disaster has configurable radius bounds.
 */
export const ENABLED_DISASTERS: Record<NaturalDisasterKind, DisasterBounds> = {
  'nutrient-bloom': {
    min: 4,
    max: 15,
    defaultRadius: 8,
  },
  'mild-flood': {
    min: 4,
    max: 15,
    defaultRadius: 8,
  },
  'meteor-seeding': {
    min: 4,
    max: 12,
    defaultRadius: 8,
  },
  'drought': {
    min: 5,
    max: 20,
    defaultRadius: 10,
  },
  'cold-snap': {
    min: 5,
    max: 18,
    defaultRadius: 8,
  },
  'wildfire': {
    min: 3,
    max: 15,
    defaultRadius: 8,
  },
  'toxic-vent': {
    min: 3,
    max: 12,
    defaultRadius: 6,
  },
  'temperature-spike': {
    min: 5,
    max: 18,
    defaultRadius: 8,
  },
} as const;

/**
 * Validation result returned by validateDisasterCommand
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
  effectiveRadius?: number;
}

/**
 * Validate a DisasterCommand
 *
 * Returns:
 *   - { valid: true, effectiveRadius?: number } if command passes all checks
 *   - { valid: false, reason: string } if any check fails
 *
 * Checks (in order):
 * 1. Disaster kind must be enabled
 * 2. Target coordinates must be within world bounds [0, worldWidth) × [0, worldHeight)
 * 3. Radius (if provided) must be within configured bounds [min, max]
 * 4. If radius is out of bounds, it's clamped and effectiveRadius is returned
 *
 * @param cmd - The DisasterCommand to validate
 * @param worldWidth - World width (default 100)
 * @param worldHeight - World height (default 100)
 * @param disasterConfig - Disaster configuration (default ENABLED_DISASTERS)
 */
export function validateDisasterCommand(
  cmd: DisasterCommand,
  worldWidth: number = 100,
  worldHeight: number = 100,
  disasterConfig: Record<NaturalDisasterKind, DisasterBounds> = ENABLED_DISASTERS
): ValidationResult {
  // Check 0: disaster kind must be enabled
  if (!(cmd.disasterKind in disasterConfig)) {
    return {
      valid: false,
      reason: `Disaster '${cmd.disasterKind}' is not enabled. Allowed: ${Object.keys(disasterConfig).join(', ')}`,
    };
  }

  // Check 1: target coordinates must be within world bounds
  if (cmd.centerX < 0 || cmd.centerX >= worldWidth || cmd.centerY < 0 || cmd.centerY >= worldHeight) {
    return {
      valid: false,
      reason: `Target coordinates (${cmd.centerX}, ${cmd.centerY}) out of world bounds [0, ${worldWidth}) × [0, ${worldHeight})`,
    };
  }

  const bounds = disasterConfig[cmd.disasterKind];
  let effectiveRadius = cmd.radius ?? bounds.defaultRadius;

  // Check 2: radius must be within configured bounds [min, max]
  let radiusClamped = false;
  if (effectiveRadius < bounds.min) {
    effectiveRadius = bounds.min;
    radiusClamped = true;
  } else if (effectiveRadius > bounds.max) {
    effectiveRadius = bounds.max;
    radiusClamped = true;
  }

  return {
    valid: true,
    effectiveRadius,
    reason: radiusClamped
      ? `Radius ${cmd.radius} clamped to [${bounds.min}, ${bounds.max}] for '${cmd.disasterKind}'`
      : undefined,
  };
}

/**
 * Get default radius for a disaster kind
 */
export function getDefaultRadius(kind: NaturalDisasterKind): number {
  const config = ENABLED_DISASTERS[kind];
  return config?.defaultRadius ?? 8;
}

/**
 * Get available disaster kinds
 */
export function getAvailableDisasterKinds(): NaturalDisasterKind[] {
  return Object.keys(ENABLED_DISASTERS) as NaturalDisasterKind[];
}

/**
 * Get beneficial disasters only
 */
export function getBeneficialDisasters(): NaturalDisasterKind[] {
  return ['nutrient-bloom', 'mild-flood', 'meteor-seeding'];
}

/**
 * Get harmful disasters only
 */
export function getHarmfulDisasters(): NaturalDisasterKind[] {
  return ['drought', 'cold-snap', 'wildfire', 'toxic-vent', 'temperature-spike'];
}
