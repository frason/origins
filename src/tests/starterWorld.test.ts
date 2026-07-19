import { beforeEach, describe, expect, it } from 'vitest';
import { Creature } from '../simulation/creature';
import { buildStarterCreatures } from '../simulation/starterWorld';
import { generateTerrain } from '../simulation/world';

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
    const herbivores = living.filter(
      (creature) => creature.traits.energyStrategy === 'herbivore'
    );
    const xValues = herbivores.map((creature) => creature.x);
    const yValues = herbivores.map((creature) => creature.y);

    expect(uniqueTiles.size).toBe(living.length);
    expect(Math.max(...xValues) - Math.min(...xValues)).toBeGreaterThan(50);
    expect(Math.max(...yValues) - Math.min(...yValues)).toBeGreaterThan(50);
    for (const creature of creatures) {
      expect(['ocean', 'mountain']).not.toContain(terrain[creature.y][creature.x].biome);
    }
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
    expect(carrion).toHaveLength(2);
    expect(carrion.every((corpse) => corpse.corpseDecayTicks === 40)).toBe(true);
    expect(carrion.every((corpse) => Math.max(
      Math.abs(corpse.x - (scavenger?.x ?? 0)),
      Math.abs(corpse.y - (scavenger?.y ?? 0))
    ) <= 6)).toBe(true);
  });

  it('gives support strategies differentiated starter energy budgets', () => {
    const living = buildStarterCreatures(12345, 100, 100)
      .filter((creature) => creature.lifecycleState === 'alive');
    const metabolism = (strategy: string) => living.find(
      (creature) => creature.traits.energyStrategy === strategy
    )?.traits.metabolism;
    expect(metabolism('herbivore')).toBe(1);
    expect(metabolism('omnivore')).toBe(0.75);
    expect(metabolism('carnivore')).toBe(0.75);
    expect(metabolism('scavenger')).toBe(0.5);
  });

  it('keeps consumers close enough to at least one starter herbivore', () => {
    const creatures = buildStarterCreatures(12345, 100, 100);
    const herbivores = creatures.filter(
      (creature) => creature.lifecycleState === 'alive'
        && creature.traits.energyStrategy === 'herbivore'
    );
    const consumers = creatures.filter(
      (creature) => creature.lifecycleState === 'alive'
        && creature.traits.energyStrategy !== 'herbivore'
    );

    for (const consumer of consumers) {
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
  });
});
