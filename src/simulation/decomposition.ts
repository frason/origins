import { Creature } from './creature';
import { World } from './world';
import {
  MAX_CREATURE_AGE_TICKS,
  CORPSE_DECAY_RATE,
  CORPSE_DECAY_DURATION_TICKS,
} from '../utils/constants';

/**
 * Check if a creature should die from age or starvation.
 * If creature age >= MAX_CREATURE_AGE_TICKS or energy <= 0:
 * - Set lifecycleState to 'dead'
 * - Start the corpse persistence timer
 *
 * @param creature - the creature to check
 */
export function checkAgeAndStarvation(
  creature: Creature,
  maxAge: number = MAX_CREATURE_AGE_TICKS,
  corpseDuration: number = CORPSE_DECAY_DURATION_TICKS
): void {
  if (creature.age >= maxAge || creature.energy <= 0) {
    creature.lifecycleState = 'dead';
    creature.corpseDecayTicks = corpseDuration;
  }
}

/**
 * Decay a dead creature's corpse over multiple ticks.
 * Each tick:
 * - Decrement corpseDecayTicks
 * - Add creature.energy × CORPSE_DECAY_RATE nutrients to the cell
 *
 * When corpseDecayTicks reaches 0 or below, the corpse has fully decomposed
 * and the creature can be removed from the simulation.
 *
 * @param creature - the dead creature whose corpse is decaying
 * @param world - the world to add nutrients to
 */
export function decayCorpse(
  creature: Creature,
  world: World,
  decayRate: number = CORPSE_DECAY_RATE
): void {
  // Decrement decay ticks
  creature.corpseDecayTicks--;

  // Add nutrients to the cell based on remaining energy
  const nutrientsToAdd = creature.energy * decayRate;
  const cell = world.getCell(creature.x, creature.y);
  world.setCell(creature.x, creature.y, {
    nutrients: cell.nutrients + nutrientsToAdd,
  });
}

/**
 * Recycle nutrients back into cell energy across the entire world.
 * For each cell:
 * - Convert nutrients to energy at a 0.5 ratio (nutrients × 0.5 → energy)
 * - Remove the converted nutrients from the cell
 *
 * This closes the energy loop: corpses → nutrients → energy for producers
 *
 * @param world - the world to process nutrient recycling for
 */
export function recycleNutrients(world: World): void {
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const cell = world.getCell(x, y);

      if (cell.nutrients > 0) {
        // Convert nutrients to energy at 0.5 ratio
        const energyFromNutrients = cell.nutrients * 0.5;

        // Update cell: add energy, remove converted nutrients
        world.setCell(x, y, {
          energy: cell.energy + energyFromNutrients,
          nutrients: cell.nutrients - cell.nutrients * 0.5,
        });
      }
    }
  }
}
