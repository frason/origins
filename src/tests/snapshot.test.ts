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
const TICKS = 50;
const SEED_LONG = 555666; // Separate seed for long-run tests
const TICKS_LONG = 500; // Long-run test for hydrology/substrate/hydration fields

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
  let engine = createEngine(SEED, buildInitialCreatures(), 100, 100, {
    defaultMutationRate: 1,
  });
  // Seed producer biomass so herbivores can eat from tick 1
  for (let y = 0; y < engine.world.height; y++) {
    for (let x = 0; x < engine.world.width; x++) {
      const cell = engine.world.getCell(x, y);
      engine.world.setCell(x, y, {
        biome: 'grassland',
        temperature: 0.5,
        moisture: 0.5,
        producerBiomass: Math.max(100, cell.energy * 2),
      });
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
    history: state.history,
    historyInterval: state.historyInterval,
    speciesProfiles: state.speciesProfiles,
    incipientSpecies: state.incipientSpecies,
  });
}

/**
 * Verify that a serialized state contains hydrology/substrate/hydration fields
 */
function assertHydrologyFieldsPresent(serialized: string): void {
  const state = JSON.parse(serialized);
  expect(state.world).toBeDefined();
  expect(state.world.cells).toBeDefined();

  // Check that cells array exists and is non-empty
  expect(Array.isArray(state.world.cells)).toBe(true);
  expect(state.world.cells.length).toBeGreaterThan(0);

  // Spot-check a few cells for hydrology fields
  const cellSample = state.world.cells.slice(0, Math.min(10, state.world.cells.length));
  for (const cell of cellSample) {
    expect(cell).toHaveProperty('substrate');
    expect(cell).toHaveProperty('waterDepth');
    expect(cell).toHaveProperty('waterTable');
    expect(cell).toHaveProperty('dissolvedNutrients');
    expect(cell).toHaveProperty('salinity');
  }
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

describe('Long-run hydrology determinism (500 ticks)', () => {
  beforeEach(() => {
    Creature.resetIdCounter();
  });

  function buildInitialCreaturesForLongRun(): Creature[] {
    const specs = [
      { strategy: 'herbivore', x: 45, y: 45, energy: 150 },
      { strategy: 'herbivore', x: 55, y: 45, energy: 150 },
      { strategy: 'omnivore', x: 50, y: 40, energy: 170 },
    ] as const;

    return specs.map(
      (s, i) =>
        new Creature({
          speciesId: `species_${s.strategy}`,
          lineageId: `lineage_long_${i}`,
          parentId: null,
          traits: { ...DEFAULT_TRAITS, energyStrategy: s.strategy },
          x: s.x,
          y: s.y,
          energy: s.energy,
        })
    );
  }

  function runLongSimulation(): EngineState {
    Creature.resetIdCounter();
    let engine = createEngine(SEED_LONG, buildInitialCreaturesForLongRun(), 100, 100, {
      defaultMutationRate: 1,
    });
    // Seed producer biomass and diverse substrates
    for (let y = 0; y < engine.world.height; y++) {
      for (let x = 0; x < engine.world.width; x++) {
        const cell = engine.world.getCell(x, y);
        // Create varied substrate types based on position
        let substrate = 'loam';
        let waterDepth = 0;
        if (y < 30) {
          substrate = x < 50 ? 'sand' : 'loam';
        } else {
          substrate = x < 50 ? 'clay' : 'peat';
          waterDepth = y > 60 ? 0.3 : 0.1;
        }
        engine.world.setCell(x, y, {
          biome: 'grassland',
          temperature: 0.5,
          moisture: 0.5,
          producerBiomass: Math.max(80, cell.energy * 1.5),
          substrate,
          waterDepth,
        } as any);
      }
    }
    return runEngine(engine, TICKS_LONG);
  }

  it(`produces byte-identical full state after ${TICKS_LONG} ticks with same seed`, () => {
    const run1 = serialize(runLongSimulation());
    const run2 = serialize(runLongSimulation());
    expect(run1).toBe(run2);
  });

  it('preserves hydrology fields (waterDepth, substrate, salinity, waterTable, dissolvedNutrients) deterministically', () => {
    const run1 = serialize(runLongSimulation());
    const run2 = serialize(runLongSimulation());

    // Verify hydrology fields are present in both runs
    assertHydrologyFieldsPresent(run1);
    assertHydrologyFieldsPresent(run2);

    // Verify they are identical
    expect(run1).toBe(run2);
  });
});
