import type { Creature } from './creature';
import { getProducerTraits } from './producerTypes';
import type { World } from './world';
import type { ProducerArchetype } from './producerTypes';

export const DEFAULT_DEPLETED_BIOMASS_SHARE = 0.25;

export interface BiomassMetrics {
  totalBiomass: number;
  occupiedTileBiomass: number;
  occupiedTileCount: number;
  averageOccupiedTileBiomass: number;
  depletedOccupiedTileCount: number;
  depletedOccupiedTileShare: number;
}

interface BiomassCellView {
  producerBiomass: number;
  producerArchetype: ProducerArchetype;
}

/** Measure a serialized snapshot without rebuilding a World instance. */
export function measureBiomassCells(
  cells: readonly BiomassCellView[],
  width: number,
  height: number,
  creatures: Pick<Creature, 'x' | 'y' | 'lifecycleState'>[],
  depletedShare: number = DEFAULT_DEPLETED_BIOMASS_SHARE
): BiomassMetrics {
  const totalBiomass = cells.reduce((sum, cell) => sum + cell.producerBiomass, 0);
  const occupied = new Set<number>();
  for (const creature of creatures) {
    if (
      creature.lifecycleState === 'alive' &&
      creature.x >= 0 && creature.y >= 0 &&
      creature.x < width && creature.y < height
    ) occupied.add(creature.y * width + creature.x);
  }
  const boundedDepletedShare = Math.max(0, Math.min(1, depletedShare));
  let occupiedTileBiomass = 0;
  let depletedOccupiedTileCount = 0;
  for (const index of occupied) {
    const cell = cells[index];
    if (!cell) continue;
    occupiedTileBiomass += cell.producerBiomass;
    const capacity = getProducerTraits(cell.producerArchetype).carryingCapacity;
    if (cell.producerBiomass <= capacity * boundedDepletedShare) depletedOccupiedTileCount++;
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

/**
 * Contrast whole-world abundance with food availability where living animals
 * actually are. Occupied cells are counted once regardless of local density.
 */
export function measureBiomass(
  world: World,
  creatures: Pick<Creature, 'x' | 'y' | 'lifecycleState'>[],
  depletedShare: number = DEFAULT_DEPLETED_BIOMASS_SHARE
): BiomassMetrics {
  const cells = [];
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      cells.push(world.getCell(x, y));
    }
  }
  return measureBiomassCells(cells, world.width, world.height, creatures, depletedShare);
}
