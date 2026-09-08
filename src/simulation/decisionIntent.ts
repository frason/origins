/**
 * DecisionIntent: Single perception pass output
 *
 * Captures the result of one deterministic neighborhood scan per creature decision.
 * This structure bundles perception data with the resulting decision and movement target,
 * enabling movement execution without rescanning the world.
 *
 * This optimization eliminates repeated perception calls per tick and establishes
 * a deterministic decision-to-execution pipeline.
 */

import { Creature, DecisionType, VisionScan, computeMovementTarget } from './creature';
import { World } from './world';

/**
 * A single creature's intent for one tick, generated from one perception pass.
 * Bundles perception data with the resulting action and movement target.
 */
export interface DecisionIntent {
  creatureId: string;
  decision: DecisionType;
  /** Perception data from the single environment scan */
  scan: VisionScan;
  /** Target location for movement actions (null if no movement) */
  movementTarget: { x: number; y: number } | null;
}

/**
 * Metrics for tracking perception efficiency across decision/execution phases.
 */
export interface DecisionMetrics {
  totalCreatures: number;
  perceptionScans: number;
  intentGenerationTime: number;
  executionTime: number;
}

/**
 * Generate a DecisionIntent from a creature's decision and perception scan.
 * Computes the movement target based on the decision and pre-scanned perception data.
 *
 * @param creature - the creature
 * @param decision - the decision type from decideTick
 * @param scan - the pre-computed perception scan
 * @param world - the world grid
 * @param allCreatures - all creatures in the simulation
 * @returns a DecisionIntent ready for execution
 */
export function createDecisionIntent(
  creature: Creature,
  decision: DecisionType,
  scan: VisionScan,
  world: World,
  allCreatures: Creature[]
): DecisionIntent {
  const movementTarget = computeMovementTarget(creature, decision, scan, world, allCreatures);
  return {
    creatureId: creature.id,
    decision,
    scan,
    movementTarget,
  };
}

/**
 * Tie-breaking comparator for deterministic execution order.
 * Ensures creatures with the same decision type execute in a stable order.
 * Uses: speciesId (alphabetic) → x coordinate → y coordinate → creatureId (alphabetic)
 *
 * @param a - first creature
 * @param b - second creature
 * @returns negative if a < b, positive if a > b, 0 if equal
 */
export function tieBreakCreatureOrder(a: Creature, b: Creature): number {
  if (a.speciesId !== b.speciesId) {
    return a.speciesId.localeCompare(b.speciesId);
  }
  if (a.x !== b.x) {
    return a.x - b.x;
  }
  if (a.y !== b.y) {
    return a.y - b.y;
  }
  return a.id.localeCompare(b.id);
}
