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
    const terrain = generateTerrain(100, 100, seed);
    const uniqueTiles = new Set(creatures.map((creature) => `${creature.x},${creature.y}`));
    const herbivores = creatures.filter(
      (creature) => creature.traits.energyStrategy === 'herbivore'
    );
    const xValues = herbivores.map((creature) => creature.x);
    const yValues = herbivores.map((creature) => creature.y);

    expect(uniqueTiles.size).toBe(creatures.length);
    expect(Math.max(...xValues) - Math.min(...xValues)).toBeGreaterThan(50);
    expect(Math.max(...yValues) - Math.min(...yValues)).toBeGreaterThan(50);
    for (const creature of creatures) {
      expect(['ocean', 'mountain']).not.toContain(terrain[creature.y][creature.x].biome);
    }
  });

  it('keeps consumers close enough to at least one starter herbivore', () => {
    const creatures = buildStarterCreatures(12345, 100, 100);
    const herbivores = creatures.filter(
      (creature) => creature.traits.energyStrategy === 'herbivore'
    );
    const consumers = creatures.filter(
      (creature) => creature.traits.energyStrategy !== 'herbivore'
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
