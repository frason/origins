/**
 * Phase 0 Crisis Detection & Response System
 *
 * Implements:
 * 1. Crisis detection: identifies when toxicity crosses thresholds
 * 2. Templated alerts: canned text responses (no LLM, per spec)
 * 3. Tier 1 heuristic response: fixed-delta toxicity reduction via InterventionCommand
 *
 * (see SPEC.md "Phase 0 crisis type", lines 94-100)
 */

import type { World } from '../world';
import type { ResourceLedger } from './economy';
import {
  validateInterventionCommand,
  type InterventionCommand,
} from './interventionCommand';

/**
 * Toxicity threshold for triggering a crisis (in world toxicity units).
 * Phase 0 uses a fixed threshold; tunable via playtesting.
 *
 * Rationale: SEVERE_TOXICITY_THRESHOLD from toxicity.ts is 2.0, so 1.0 is
 * a sensible midpoint between "elevated hazard" (TRACE=0.25 to SEVERE=2.0)
 * and full severity, ensuring meaningful but not-constant crises.
 */
export const TOXICITY_CRISIS_THRESHOLD = 1.0;

/**
 * Tier 1 heuristic response: fixed reduction amount (in toxicity units).
 * Applied when resolving a toxicity spike crisis.
 * Within bounds: min=0, max=50, maxDeltaPerCommand=15 (per interventionCommand.ts)
 */
const TIER1_TOXICITY_REDUCTION_DELTA = 1.0;

/**
 * Crisis record: identifies a detected crisis event with type, location, and lifecycle
 */
export interface Crisis {
  id: string; // unique crisis identifier
  type: 'toxicity_spike'; // Phase 0 only supports this type
  x: number; // grid X coordinate of the crisis location
  y: number; // grid Y coordinate of the crisis location
  tick: number; // tick at which crisis was detected
  status: 'active' | 'resolved'; // current lifecycle state
}

/**
 * CRISIS_ALERT_TEXT: Canned alert message for toxicity spike crises
 * No LLM call, ever (per spec). Template string suitable for UI display.
 */
export const CRISIS_ALERT_TEXT =
  'TOXICITY SPIKE DETECTED: Grid tile ({x}, {y}) has crossed critical contamination threshold. ' +
  'Local ecosystem function degrading. Tier 1 response: reduce contamination via bioremediation vector. ' +
  'Cost: 20 Energy. Status: {status}';

/**
 * detectCrises: Scan world for newly-triggered crises
 *
 * Returns a list of newly-detected crises. Prevents duplicate detection
 * on the same tile by tracking which tiles are already in a crisis state
 * (passed in activeCrises). Only detects a tile's crisis once per crossing
 * (not every tick while still above threshold).
 *
 * Algorithm:
 * 1. For each tile in the world, check if toxicity > threshold
 * 2. If toxicity is high AND tile is not already in an active crisis:
 *    - Emit a new crisis record with unique ID (tick + x + y)
 * 3. Return the list of newly-triggered crises
 *
 * @param world - the simulation world grid to scan
 * @param tick - current simulation tick (for unique crisis IDs and timestamps)
 * @param activeCrises - optional list of already-active crises to prevent re-triggering
 * @returns array of newly-detected Crisis records (empty if none triggered)
 */
export function detectCrises(
  world: World,
  tick: number,
  activeCrises: Crisis[] = []
): Crisis[] {
  const newCrises: Crisis[] = [];

  // Build a set of (x, y) pairs already in an active crisis to avoid re-triggering
  const activeTiles = new Set<string>();
  for (const crisis of activeCrises) {
    if (crisis.status === 'active') {
      activeTiles.add(`${crisis.x},${crisis.y}`);
    }
  }

  // Scan the world grid for toxicity spikes
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const cell = world.getCell(x, y);

      // Check if toxicity exceeds threshold and tile is not already in crisis
      if (cell.toxicity > TOXICITY_CRISIS_THRESHOLD && !activeTiles.has(`${x},${y}`)) {
        const crisisId = `crisis_${tick}_${x}_${y}`;
        newCrises.push({
          id: crisisId,
          type: 'toxicity_spike',
          x,
          y,
          tick,
          status: 'active',
        });
      }
    }
  }

  return newCrises;
}

/**
 * resolveTier1: Execute Tier 1 heuristic response to a toxicity spike crisis
 *
 * Implements the fixed-cost, fixed-delta toxicity reduction response:
 * 1. Build an InterventionCommand targeting toxicity_reduction
 * 2. Validate the command against security constraints
 * 3. Check if ledger has sufficient Energy (20 cost)
 * 4. If funds insufficient: leave crisis active, mutate nothing, return false
 * 5. If valid and funded: spend 20 Energy, apply reduction to tile, update crisis, return true
 *
 * @param crisis - the Crisis record to resolve
 * @param world - world grid (to apply toxicity reduction)
 * @param ledger - resource ledger (to deduct 20 Energy cost)
 * @param scoutId - scout ID for the intervention command (defaults to 'scout_0')
 * @returns true if response succeeded, false if rejected (insufficient funds or validation failed)
 */
export function resolveTier1(
  crisis: Crisis,
  world: World,
  ledger: ResourceLedger,
  scoutId: string = 'scout_0'
): boolean {
  // Cost of Tier 1 response (per SPEC.md "Core Economy")
  const TIER1_ENERGY_COST = 20;

  // Check if ledger has sufficient funds before proceeding
  if (!ledger.canAfford('energy', TIER1_ENERGY_COST)) {
    // Insufficient funds: reject the action, leave crisis active, mutate nothing
    return false;
  }

  // Build the InterventionCommand targeting toxicity_reduction
  const command: InterventionCommand = {
    id: `cmd_${crisis.id}`,
    tick: crisis.tick,
    tier: 1,
    sourceScoutId: scoutId,
    targetX: crisis.x,
    targetY: crisis.y,
    parameter: 'toxicity_reduction',
    value: TIER1_TOXICITY_REDUCTION_DELTA,
  };

  // Validate the command against security constraints
  const validation = validateInterventionCommand(command);
  if (!validation.valid) {
    // Command failed validation: reject the action, leave crisis active, mutate nothing
    return false;
  }

  // Use clamped value if validation provided one (though our delta is well within bounds)
  const finalDelta = validation.clampedValue ?? command.value;

  // Spend the Energy cost (will throw if insufficient, but we checked above)
  try {
    ledger.spend('energy', TIER1_ENERGY_COST);
  } catch {
    // This should not happen given the canAfford check, but defensive programming
    return false;
  }

  // Apply the toxicity reduction to the target tile
  const cell = world.getCell(crisis.x, crisis.y);
  const newToxicity = Math.max(0, cell.toxicity - finalDelta);
  world.setCell(crisis.x, crisis.y, { toxicity: newToxicity });

  // Mark crisis as resolved
  crisis.status = 'resolved';

  return true;
}
