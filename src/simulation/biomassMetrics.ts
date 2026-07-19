import type { Creature } from './creature';
import { getProducerTraits } from './producerTypes';
import type { World } from './world';

export const DEFAULT_DEPLETED_BIOMASS_SHARE = 0.25;

export interface BiomassMetrics {
  totalBiomass: number;
  occupiedTileBiomass: number;
  occupiedTileCount: number;
  averageOccupiedTileBiomass: number;
  depletedOccupiedTileCount: number;
  depletedOccupiedTileShare: number;
}

/**
 * Contrast whole-world abundance with food availability where living animals
 * actually are. Occupied cells are counted once regardless of local density.
 */
export function measureBiomass(
  world: World,
  creatures: Pick<Creature, 'x' | 'y' | 'lifecycleState'>[],
  depletedShare: number = DEFAULT_DEPLETED_BIOMASS_SHARE
): BiomassMetrics {
  let totalBiomass = 0;
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      totalBiomass += world.getCell(x, y).producerBiomass;
    }
  }

  const occupied = new Set<string>();
  for (const creature of creatures) {
    if (
      creature.lifecycleState === 'alive' &&
      creature.x >= 0 && creature.y >= 0 &&
      creature.x < world.width && creature.y < world.height
    ) {
      occupied.add(`${creature.x},${creature.y}`);
    }
  }

  const boundedDepletedShare = Math.max(0, Math.min(1, depletedShare));
  let occupiedTileBiomass = 0;
  let depletedOccupiedTileCount = 0;
  for (const coordinate of occupied) {
    const [x, y] = coordinate.split(',').map(Number);
    const cell = world.getCell(x, y);
    occupiedTileBiomass += cell.producerBiomass;
    const carryingCapacity = getProducerTraits(cell.producerArchetype).carryingCapacity;
    if (cell.producerBiomass <= carryingCapacity * boundedDepletedShare) {
      depletedOccupiedTileCount++;
    }
  }

  const occupiedTileCount = occupied.size;
  return {
    totalBiomass,
    occupiedTileBiomass,
    occupiedTileCount,
    averageOccupiedTileBiomass: occupiedTileCount > 0
      ? occupiedTileBiomass / occupiedTileCount
      : 0,
    depletedOccupiedTileCount,
    depletedOccupiedTileShare: occupiedTileCount > 0
      ? depletedOccupiedTileCount / occupiedTileCount
      : 0,
  };
}
