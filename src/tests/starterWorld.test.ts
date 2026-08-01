import { beforeEach, describe, expect, it } from 'vitest';
import { Creature } from '../simulation/creature';
import { buildStarterCreatures } from '../simulation/starterWorld';
import { generateTerrain } from '../simulation/world';
import { FOUNDER_SPECIES } from '../simulation/founderSpecies';

function positions(seed: number) {
  Creature.resetIdCounter();
  return buildStarterCreatures(seed, 100, 100).map((creature) => ({
    x: creature.x,
    y: creature.y,
    strategy: creature.traits.energyStrategy,
  }));
}

describe('starter world placement', () => {
  beforeEach(() => Creature.resetIdCounter());

  it('replays identical placement for the same seed', () => {
    expect(positions(12345)).toEqual(positions(12345));
  });

  it('varies placement for different seeds', () => {
    expect(positions(12345)).not.toEqual(positions(12346));
  });

  it('uses unique habitable land tiles spread across the world', () => {
    const seed = 12345;
    const creatures = buildStarterCreatures(seed, 100, 100);
    const living = creatures.filter((creature) => creature.lifecycleState === 'alive');
    const terrain = generateTerrain(100, 100, seed);
    const uniqueTiles = new Set(living.map((creature) => `${creature.x},${creature.y}`));
    const herbivores = living.filter((creature) => creature.traits.energyStrategy === 'herbivore');
    const xValues = herbivores.map((creature) => creature.x);
    const yValues = herbivores.map((creature) => creature.y);

    expect(uniqueTiles.size).toBe(living.length);
    expect(Math.max(...xValues) - Math.min(...xValues)).toBeGreaterThan(50);
    expect(Math.max(...yValues) - Math.min(...yValues)).toBeGreaterThan(50);
    for (const creature of living) {
      const definition = FOUNDER_SPECIES.find((founder) => founder.id === creature.speciesId)!;
      expect(definition.viableBiomes).toContain(terrain[creature.y][creature.x].biome);
    }
  });

  it('starts exactly eight named founders with two overlapping viable biomes each', () => {
    const living = buildStarterCreatures(12345, 100, 100)
      .filter((creature) => creature.lifecycleState === 'alive');
    expect(new Set(living.map((creature) => creature.speciesId))).toEqual(
      new Set(FOUNDER_SPECIES.map((species) => species.id))
    );
    expect(FOUNDER_SPECIES).toHaveLength(8);
    expect(FOUNDER_SPECIES.every((species) => species.viableBiomes[0] !== species.viableBiomes[1])).toBe(true);
  });

  it('starts scavengers with deterministic carrion within foraging range', () => {
    const creatures = buildStarterCreatures(12345, 100, 100, 40);
    const scavenger = creatures.find(
      (creature) => creature.lifecycleState === 'alive'
        && creature.traits.energyStrategy === 'scavenger'
    );
    const carrion = creatures.filter(
      (creature) => creature.lifecycleState === 'dead'
    );
    expect(carrion).toHaveLength(3);
    expect(carrion.every((corpse) => corpse.corpseDecayTicks === 40)).toBe(true);
    expect(carrion.every((corpse) => Math.max(
      Math.abs(corpse.x - (scavenger?.x ?? 0)),
      Math.abs(corpse.y - (scavenger?.y ?? 0))
    ) <= 6)).toBe(true);
  });

  it('gives founders habitat-specific traits without eliminating feeding-strategy coverage', () => {
    const living = buildStarterCreatures(12345, 100, 100)
      .filter((creature) => creature.lifecycleState === 'alive');
    expect(new Set(living.map((creature) => creature.traits.energyStrategy))).toEqual(
      new Set(['herbivore', 'omnivore', 'carnivore', 'scavenger'])
    );
    expect(living.find((creature) => creature.speciesId === 'dune_browser')?.traits.waterRetention).toBe(1);
    expect(living.find((creature) => creature.speciesId === 'frost_brower')?.traits.thermalTolerance).toBe(1);
    expect(living.find((creature) => creature.speciesId === 'ridge_forager')?.traits.terrainGrip).toBe(1);
    expect(living.find((creature) => creature.speciesId === 'shore_scavenger')?.traits.aquaticAffinity).toBe(1);
    expect(living.find((creature) => creature.speciesId === 'shore_scavenger')?.traits.terrainGrip).toBe(1);
  });

  it('keeps carnivores close to prey and scavengers within carrion range', () => {
    const creatures = buildStarterCreatures(12345, 100, 100);
    const herbivores = creatures.filter(
      (creature) => creature.lifecycleState === 'alive'
        && creature.traits.energyStrategy === 'herbivore'
    );
    const carnivores = creatures.filter(
      (creature) => creature.lifecycleState === 'alive'
        && creature.traits.energyStrategy === 'carnivore'
    );

    for (const consumer of carnivores) {
      const nearest = Math.min(
        ...herbivores.map((herbivore) =>
          Math.max(
            Math.abs(consumer.x - herbivore.x),
            Math.abs(consumer.y - herbivore.y)
          )
        )
      );
      expect(nearest).toBeLessThanOrEqual(4);
    }
    const scavenger = creatures.find((creature) => creature.speciesId === 'shore_scavenger')!;
    const carrion = creatures.filter((creature) => creature.lifecycleState === 'dead');
    expect(Math.min(...carrion.map((corpse) => Math.max(
      Math.abs(corpse.x - scavenger.x), Math.abs(corpse.y - scavenger.y)
    )))).toBeLessThanOrEqual(6);
  });
});
