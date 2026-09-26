import { Creature } from './creature';
import { Cell } from './world';
import { Traits } from '../utils/traits';
import { MAX_MOVEMENT_COST } from '../utils/constants';

/**
 * Calculate the traversal cost for a creature to move through a cell.
 * Pure function: same inputs always produce same output.
 *
 * Base movement cost is multiplied by water depth, reduced by aquaticAdaptation.
 * Aquatic creatures find dry cells (negative water depth effect) expensive.
 *
 * Cost formula:
 * - If waterDepth > 0 (wet cell):
 *   cost = baseCost * (1 + waterDepth * (1 - aquaticAdaptation))
 * - If waterDepth == 0 (dry cell) and aquaticAdaptation > 0.5 (aquatic):
 *   cost = baseCost * (1 + (aquaticAdaptation - 0.5) * 2)  [scales 0 to 1 as adaptation goes 0.5 to 1.0]
 * - Otherwise (dry cell, non-aquatic):
 *   cost = baseCost
 *
 * @param creature - the creature attempting to move (provides traits.aquaticAdaptation)
 * @param cell - the cell being traversed (provides waterDepth)
 * @param baseCost - base traversal cost from biome (default: 1)
 * @returns traversal cost for the movement
 */
export function getTraversalCost(
  creature: { traits: Traits },
  cell: { waterDepth: number },
  baseCost: number = 1
): number {
  const aquaticAdaptation = Math.max(0, Math.min(1, creature.traits.aquaticAdaptation));
  const waterDepth = Math.max(0, cell.waterDepth);

  if (waterDepth > 0) {
    // Wet cell: cost increases with depth, reduced by aquatic adaptation
    // At adaptation=0: cost = baseCost * (1 + depth)
    // At adaptation=1: cost = baseCost (ignores depth)
    return baseCost * (1 + waterDepth * (1 - aquaticAdaptation));
  } else if (aquaticAdaptation > 0.5) {
    // Dry cell and creature is aquatic: find this expensive
    // Scales from 0 cost (adaptation=0.5) to +baseCost (adaptation=1.0)
    const aquaticPenalty = (aquaticAdaptation - 0.5) * 2;
    return baseCost * (1 + aquaticPenalty);
  } else {
    // Dry cell and creature is non-aquatic or barely aquatic: normal cost
    return baseCost;
  }
}

/**
 * Check if a cell is passable given a creature's aquatic adaptation and water depth.
 * A cell is impassable if its traversal cost exceeds MAX_MOVEMENT_COST.
 *
 * @param creature - the creature attempting to traverse
 * @param cell - the cell to check
 * @param baseCost - base biome cost (default: 1)
 * @returns true if the cell is passable, false if cost exceeds max
 */
export function isWaterPassable(
  creature: { traits: Traits },
  cell: { waterDepth: number },
  baseCost: number = 1
): boolean {
  const cost = getTraversalCost(creature, cell, baseCost);
  return cost <= MAX_MOVEMENT_COST;
}
