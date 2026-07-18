import { beforeEach, describe, expect, it } from 'vitest';
import { getEnvironmentalStress } from '../simulation/biomeStress';
import { isTerrainTraversable, terrainMovementCost } from '../simulation/biomeTraversal';
import { Creature } from '../simulation/creature';
import { mutateTraits } from '../simulation/species';
import { World } from '../simulation/world';
import { DEFAULT_TRAITS } from '../utils/traits';

function animal(traits = {}) {
  return new Creature({
    speciesId: 'grazer', lineageId: 'grazer', parentId: null,
    traits: { ...DEFAULT_TRAITS, ...traits }, x: 2, y: 2, energy: 20,
  });
}

function landWorld() {
  const world = new World(5, 5);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
    world.setCell(x, y, { biome: 'grassland', temperature: 0.5, moisture: 0.5 });
  }
  return world;
}

describe('heritable habitat adaptations', () => {
  beforeEach(() => Creature.resetIdCounter());

  it('trades maintenance energy for lower temperature pressure', () => {
    const world = landWorld();
    world.setCell(2, 2, { biome: 'tundra', temperature: 0, moisture: 0.5 });
    const generalist = getEnvironmentalStress(animal(), world);
    const specialist = getEnvironmentalStress(animal({ thermalTolerance: 1 }), world);

    expect(specialist.temperatureCost).toBeLessThan(generalist.temperatureCost);
    expect(specialist.adaptationCost).toBeGreaterThan(0);
  });

  it('reduces dry-cell pressure through water retention', () => {
    const world = landWorld();
    world.setCell(2, 2, { biome: 'desert', temperature: 0.5, moisture: 0 });
    expect(getEnvironmentalStress(animal({ waterRetention: 1 }), world).hydrationCost)
      .toBeLessThan(getEnvironmentalStress(animal(), world).hydrationCost);
  });

  it('opens ocean and mountain terrain only after substantial specialization', () => {
    const world = landWorld();
    world.setCell(3, 2, { biome: 'ocean' });
    world.setCell(1, 2, { biome: 'mountain' });
    expect(isTerrainTraversable(world, 3, 2, DEFAULT_TRAITS)).toBe(false);
    expect(isTerrainTraversable(world, 3, 2, { ...DEFAULT_TRAITS, aquaticAffinity: 1 })).toBe(true);
    expect(isTerrainTraversable(world, 1, 2, { ...DEFAULT_TRAITS, terrainGrip: 1 })).toBe(true);
  });

  it('makes specialized movement cheaper in matching rough terrain', () => {
    expect(terrainMovementCost('wetland', { aquaticAffinity: 1, terrainGrip: 0 }))
      .toBeLessThan(terrainMovementCost('wetland', DEFAULT_TRAITS));
    expect(terrainMovementCost('tundra', { aquaticAffinity: 0, terrainGrip: 1 }))
      .toBeLessThan(terrainMovementCost('tundra', DEFAULT_TRAITS));
  });

  it('includes habitat traits in deterministic mutation targets', () => {
    // Target speed, whose linked adaptation is aquatic affinity.
    const draws = [0, 0.1, 0.9];
    let index = 0;
    const mutated = mutateTraits(DEFAULT_TRAITS, () => draws[index++] ?? 0.9, 0.2, 1);
    expect(mutated.aquaticAffinity).toBeGreaterThan(DEFAULT_TRAITS.aquaticAffinity);
    expect(mutateTraits(DEFAULT_TRAITS, () => 0.99, 0.2, 0)).toEqual(DEFAULT_TRAITS);
  });
});
