import type { Creature } from './creature';
import type { Cell, World } from './world';
import type { Traits } from '../utils/traits';

export interface EnvironmentalStress {
  temperatureCost: number;
  hydrationCost: number;
  totalCost: number;
  waterRelief: boolean;
  adaptationCost: number;
}

const expressed = (value: number) => Math.max(0, (value - 0.5) / 0.5);

function hasWaterRelief(world: World, x: number, y: number): boolean {
  for (let offsetY = -1; offsetY <= 1; offsetY++) {
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      const checkX = x + offsetX;
      const checkY = y + offsetY;
      if (checkX < 0 || checkY < 0 || checkX >= world.width || checkY >= world.height) continue;
      const biome = world.getCell(checkX, checkY).biome;
      if (biome === 'ocean' || biome === 'wetland') return true;
    }
  }
  return false;
}

/** Derive small cumulative survival costs from local seeded conditions. */
export function getCellEnvironmentalStress(
  traits: Traits,
  cell: Pick<Cell, 'temperature' | 'moisture'>,
  waterRelief: boolean
): EnvironmentalStress {
  const coldCost = Math.max(0, 0.28 - cell.temperature) * 0.4;
  const heatCost = Math.max(0, cell.temperature - 0.78) * 0.3;
  const thermalTolerance = expressed(traits.thermalTolerance);
  const waterRetention = expressed(traits.waterRetention);
  const aquaticAffinity = expressed(traits.aquaticAffinity);
  const terrainGrip = expressed(traits.terrainGrip);
  const thermalProtection = 1 - thermalTolerance * 0.75;
  const retentionProtection = 1 - waterRetention * 0.75;
  const hydrationCost = waterRelief
    ? 0
    : Math.max(0, 0.25 - cell.moisture) * 0.3 * retentionProtection;
  const sizeScale = Math.max(0.5, Math.min(2, traits.size));
  const temperatureCost = (coldCost + heatCost) * sizeScale * thermalProtection;
  const adaptationCost = (
    thermalTolerance + waterRetention + aquaticAffinity + terrainGrip
  ) * 0.01;
  return {
    temperatureCost,
    hydrationCost: hydrationCost * sizeScale,
    adaptationCost,
    totalCost: Math.min(0.2, temperatureCost + hydrationCost * sizeScale + adaptationCost),
    waterRelief,
  };
}

/** Derive small cumulative survival costs from local seeded conditions. */
export function getEnvironmentalStress(
  creature: Pick<Creature, 'x' | 'y' | 'traits'>,
  world: World
): EnvironmentalStress {
  return getCellEnvironmentalStress(
    creature.traits,
    world.getCell(creature.x, creature.y),
    hasWaterRelief(world, creature.x, creature.y)
  );
}

export function applyEnvironmentalStress(creature: Creature, world: World): EnvironmentalStress {
  const stress = getEnvironmentalStress(creature, world);
  creature.energy = Math.max(0, creature.energy - stress.totalCost);
  if (creature.energy === 0) creature.lifecycleState = 'dead';
  return stress;
}
