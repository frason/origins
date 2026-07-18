import type { Creature } from './creature';
import type { World } from './world';

export interface EnvironmentalStress {
  temperatureCost: number;
  hydrationCost: number;
  totalCost: number;
  waterRelief: boolean;
}

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
export function getEnvironmentalStress(
  creature: Pick<Creature, 'x' | 'y' | 'traits'>,
  world: World
): EnvironmentalStress {
  const cell = world.getCell(creature.x, creature.y);
  const coldCost = Math.max(0, 0.28 - cell.temperature) * 0.4;
  const heatCost = Math.max(0, cell.temperature - 0.78) * 0.3;
  const waterRelief = hasWaterRelief(world, creature.x, creature.y);
  const hydrationCost = waterRelief ? 0 : Math.max(0, 0.25 - cell.moisture) * 0.3;
  const sizeScale = Math.max(0.5, Math.min(2, creature.traits.size));
  const temperatureCost = (coldCost + heatCost) * sizeScale;
  return {
    temperatureCost,
    hydrationCost: hydrationCost * sizeScale,
    totalCost: Math.min(0.2, temperatureCost + hydrationCost * sizeScale),
    waterRelief,
  };
}

export function applyEnvironmentalStress(creature: Creature, world: World): EnvironmentalStress {
  const stress = getEnvironmentalStress(creature, world);
  creature.energy = Math.max(0, creature.energy - stress.totalCost);
  if (creature.energy === 0) creature.lifecycleState = 'dead';
  return stress;
}
