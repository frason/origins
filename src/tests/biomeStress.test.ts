import { beforeEach, describe, expect, it } from 'vitest';
import { applyEnvironmentalStress, getEnvironmentalStress } from '../simulation/biomeStress';
import { Creature } from '../simulation/creature';
import { createEngine, tickEngine } from '../simulation/engine';
import { World } from '../simulation/world';
import { DEFAULT_TRAITS } from '../utils/traits';

function creature(energy = 10) {
  return new Creature({
    speciesId: 'grazer', lineageId: 'grazer', parentId: null,
    traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore', speed: 0 },
    x: 2, y: 2, energy,
  });
}

function dryWorld() {
  const world = new World(5, 5);
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      world.setCell(x, y, { biome: 'grassland', temperature: 0.5, moisture: 0.5 });
    }
  }
  return world;
}

describe('deterministic biome survival pressure', () => {
  beforeEach(() => Creature.resetIdCounter());

  it('makes cold and dry cells costlier than temperate grassland', () => {
    const world = dryWorld();
    const animal = creature();
    world.setCell(2, 2, { biome: 'grassland', temperature: 0.5, moisture: 0.5 });
    expect(getEnvironmentalStress(animal, world).totalCost).toBe(0);

    world.setCell(2, 2, { biome: 'tundra', temperature: 0.1, moisture: 0.1 });
    const harsh = getEnvironmentalStress(animal, world);
    expect(harsh.temperatureCost).toBeGreaterThan(0);
    expect(harsh.hydrationCost).toBeGreaterThan(0);
  });

  it('uses adjacent ocean or wetland as deterministic hydration relief', () => {
    const world = dryWorld();
    const animal = creature();
    world.setCell(2, 2, { biome: 'desert', temperature: 0.5, moisture: 0.05 });
    const dry = getEnvironmentalStress(animal, world);
    world.setCell(3, 2, { biome: 'wetland' });
    const relieved = getEnvironmentalStress(animal, world);

    expect(dry.hydrationCost).toBeGreaterThan(0);
    expect(relieved.waterRelief).toBe(true);
    expect(relieved.hydrationCost).toBe(0);
  });

  it('applies bounded cumulative energy cost without instant arbitrary death', () => {
    const world = dryWorld();
    const animal = creature(10);
    world.setCell(2, 2, { biome: 'tundra', temperature: 0, moisture: 0 });
    const stress = applyEnvironmentalStress(animal, world);

    expect(stress.totalCost).toBeGreaterThan(0);
    expect(stress.totalCost).toBeLessThanOrEqual(0.4);
    expect(animal.energy).toBeCloseTo(10 - stress.totalCost);
    expect(animal.lifecycleState).toBe('alive');
  });

  it('records environmental stress when it depletes the final energy', () => {
    const animal = creature(0.05);
    const state = createEngine(5, [animal], 5, 5, {
      baseMetabolism: 0,
      monocultureMortalityPenalty: 0,
    });
    state.world.setCell(2, 2, { biome: 'tundra', temperature: 0, moisture: 0 });
    const next = tickEngine(state, { ...state.constants, baseMetabolism: 0 });
    expect(next.events).toContainEqual(expect.objectContaining({
      type: 'death', speciesId: 'grazer', deathCause: 'environmental-stress',
    }));
  });

  it('returns identical pressure for identical state', () => {
    const world = new World(5, 5);
    const animal = creature();
    world.setCell(2, 2, { biome: 'desert', temperature: 0.9, moisture: 0 });
    expect(getEnvironmentalStress(animal, world)).toEqual(getEnvironmentalStress(animal, world));
  });
});
