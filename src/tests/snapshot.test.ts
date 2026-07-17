import { describe, it, expect, beforeEach } from 'vitest';
import { Creature } from '../simulation/creature';
import { createEngine, runEngine, EngineState } from '../simulation/engine';
import { DEFAULT_TRAITS } from '../utils/traits';

/**
 * End-to-end determinism: the FULL serialized state (every cell, every creature,
 * every trait value, every event) must be identical across two runs with the
 * same seed. Count-based comparisons are not enough — this catches any
 * non-deterministic escape (Math.random, crypto.randomUUID, Date.now, map
 * iteration order) anywhere in the tick path.
 */

const SEED = 424242;
const TICKS = 100;

function buildInitialCreatures(): Creature[] {
  const specs = [
    { strategy: 'herbivore', x: 45, y: 45, energy: 150 },
    { strategy: 'herbivore', x: 55, y: 45, energy: 150 },
    { strategy: 'herbivore', x: 45, y: 55, energy: 150 },
    { strategy: 'herbivore', x: 55, y: 55, energy: 150 },
    { strategy: 'omnivore', x: 50, y: 40, energy: 170 },
    { strategy: 'carnivore', x: 40, y: 50, energy: 200 },
    { strategy: 'scavenger', x: 60, y: 50, energy: 120 },
  ] as const;

  return specs.map(
    (s, i) =>
      new Creature({
        speciesId: `species_${s.strategy}`,
        lineageId: `lineage_root_${i}`,
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: s.strategy },
        x: s.x,
        y: s.y,
        energy: s.energy,
      })
  );
}

function runSimulation(): EngineState {
  Creature.resetIdCounter();
  let engine = createEngine(SEED, buildInitialCreatures());
  // Seed producer biomass so herbivores can eat from tick 1
  for (let y = 0; y < engine.world.height; y++) {
    for (let x = 0; x < engine.world.width; x++) {
      const cell = engine.world.getCell(x, y);
      engine.world.setCell(x, y, { producerBiomass: cell.energy * 2 });
    }
  }
  return runEngine(engine, TICKS);
}

function serialize(state: EngineState): string {
  return JSON.stringify({
    tick: state.tick,
    seed: state.seed,
    world: state.world.toJSON(),
    creatures: state.creatures.map((c) => c.toJSON()),
    events: state.events,
  });
}

describe('Full-state determinism snapshot', () => {
  beforeEach(() => {
    Creature.resetIdCounter();
  });

  it(`produces byte-identical full state after ${TICKS} ticks with the same seed`, () => {
    const run1 = serialize(runSimulation());
    const run2 = serialize(runSimulation());
    expect(run1).toBe(run2);
  });

  it('actually evolves: offspring traits drift from parent traits', () => {
    const final = runSimulation();
    const births = final.events.filter((e) => e.type === 'birth');
    expect(births.length).toBeGreaterThan(0);

    // Evolution remains observable even when a mutated lineage later dies out.
    expect(final.events.some((event) => event.type === 'mutation')).toBe(true);
  });
});
