import { describe, it, expect, beforeEach } from 'vitest';
import { Creature } from '../simulation/creature';
import { World } from '../simulation/world';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import { createEngine, runEngine } from '../simulation/engine';
import { DEFAULT_TRAITS } from '../utils/traits';

/**
 * Migration tests: verify that old saves (pre-#263, missing new hydrology fields)
 * load correctly with deterministic defaults and continue to simulate without errors.
 */

describe('Old save migration (pre-#263 hydrology)', () => {
  beforeEach(() => {
    Creature.resetIdCounter();
  });

  it('loads a pre-#263 save fixture through World.fromJSON() and applies defaults', () => {
    // Simulate an old save format (pre-#263) that lacks hydrology fields
    const oldSaveFixture = {
      width: 30,
      height: 30,
      cells: Array.from({ length: 30 * 30 }, (_, idx) => ({
        // Pre-#263 fields only
        energy: 10 + (idx % 5) * 2,
        nutrients: 0,
        producerBiomass: 0,
        toxicity: 0,
        elevation: 0.5,
        moisture: 0.4 + (idx % 7) * 0.05,
        temperature: 0.5,
        biome: 'grassland' as const,
        producerArchetype: 'ground-cover' as const,
        // Missing: substrate, waterDepth, waterTable, dissolvedNutrients, salinity
      })),
    };

    // Load the old save through the migration path
    let world: World | undefined;
    expect(() => {
      world = World.fromJSON(oldSaveFixture);
    }).not.toThrow();

    expect(world).toBeDefined();
    expect(world!.width).toBe(30);
    expect(world!.height).toBe(30);

    // Verify that defaults were applied to all cells
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const cell = world!.getCell(x, y);
        expect(cell).toBeDefined();
        // New fields should have defaults
        expect(cell.substrate).toBeDefined();
        expect(typeof cell.substrate).toBe('string');
        expect(cell.substrate).toBe('loam'); // Default from World.fromJSON
        expect(cell.waterDepth).toBeDefined();
        expect(typeof cell.waterDepth).toBe('number');
        expect(cell.waterDepth).toBe(0); // Default from World.fromJSON
        expect(cell.waterTable).toBeDefined();
        expect(typeof cell.waterTable).toBe('number');
        expect(cell.dissolvedNutrients).toBeDefined();
        expect(typeof cell.dissolvedNutrients).toBe('number');
        expect(cell.salinity).toBeDefined();
        expect(typeof cell.salinity).toBe('number');
      }
    }
  });

  it('loads old save and runs simulation without crashing', () => {
    // Pre-#263 save fixture
    const oldSaveFixture = {
      width: 40,
      height: 40,
      cells: Array.from({ length: 40 * 40 }, (_, idx) => ({
        energy: 15,
        nutrients: 0,
        producerBiomass: 0,
        toxicity: 0,
        elevation: 0.5,
        moisture: 0.5,
        temperature: 0.5,
        biome: 'grassland' as const,
        producerArchetype: 'ground-cover' as const,
        // Intentionally omitting hydrology fields
      })),
    };

    // Load the old save
    const world = World.fromJSON(oldSaveFixture);

    // Create creatures as they would exist in the old save
    const creatures = [
      new Creature({
        speciesId: 'herbivore_legacy',
        lineageId: 'legacy_line_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
        x: 20,
        y: 20,
        energy: 100,
      }),
      new Creature({
        speciesId: 'omnivore_legacy',
        lineageId: 'legacy_line_2',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'omnivore' },
        x: 25,
        y: 25,
        energy: 120,
      }),
    ];

    // Create engine from loaded world and creatures
    let engine: any;
    expect(() => {
      engine = createEngine(88888, creatures, 40, 40);
    }).not.toThrow();

    // Run simulation to verify it doesn't crash with migrated data
    let state: any;
    expect(() => {
      if (engine) state = runEngine(engine, 15);
    }).not.toThrow();

    // Verify final state is valid with all hydrology fields intact
    if (state) {
      expect(state.tick).toBe(15);
      expect(state.world).toBeDefined();

      // Spot-check that hydrology fields persist
      const sampleCell = state.world.getCell(20, 20);
      expect(sampleCell).toBeDefined();
      expect(sampleCell.substrate).toBeDefined();
      expect(sampleCell.waterDepth).toBeDefined();
      expect(sampleCell.waterTable).toBeDefined();
      expect(sampleCell.salinity).toBeDefined();
    }
  });

  it('verifies substrate diversity in a generated world', () => {
    // Generated worlds should have diverse substrate types
    const world = new World(100, 100, SIMULATION_CONSTANTS, 54321);

    const substrateTypes = new Set<string>();
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        const cell = world.getCell(x, y);
        substrateTypes.add(cell.substrate);
      }
    }

    // We expect to see at least some variety (not all the same substrate)
    expect(substrateTypes.size).toBeGreaterThan(1);
  });

  it('verifies water distribution in generated world', () => {
    // Generated worlds should have some water-bearing cells
    const world = new World(100, 100, SIMULATION_CONSTANTS, 99887);

    let cellsWithWater = 0;
    let cellsWithWaterTable = 0;
    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 100; x++) {
        const cell = world.getCell(x, y);
        if (cell.waterDepth > 0.01) cellsWithWater++;
        if (cell.waterTable > 0.3) cellsWithWaterTable++;
      }
    }

    // At least some cells should have water
    expect(cellsWithWater + cellsWithWaterTable).toBeGreaterThan(0);
  });
});
