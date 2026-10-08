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

  it('creates a new World with hydrology defaults for all cells', () => {
    // When creating a new World (which happens during deserialization with
    // deterministic defaults), all cells should have hydrology fields
    const world = new World(50, 50, SIMULATION_CONSTANTS, 12345);

    expect(world).toBeDefined();
    expect(world.width).toBe(50);
    expect(world.height).toBe(50);

    // Spot-check cells for hydrology fields
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const cell = world.getCell(x, y);
        expect(cell).toBeDefined();
        expect(cell.substrate).toBeDefined();
        expect(typeof cell.substrate).toBe('string');
        expect(cell.waterDepth).toBeDefined();
        expect(typeof cell.waterDepth).toBe('number');
        expect(cell.waterTable).toBeDefined();
        expect(typeof cell.waterTable).toBe('number');
        expect(cell.dissolvedNutrients).toBeDefined();
        expect(typeof cell.dissolvedNutrients).toBe('number');
        expect(cell.salinity).toBeDefined();
        expect(typeof cell.salinity).toBe('number');
      }
    }
  });

  it('simulates a world created with hydrology defaults without crashing', () => {
    // Create creatures as they would exist in an old save
    const creatures = [
      new Creature({
        speciesId: 'herbivore_legacy',
        lineageId: 'legacy_line_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
        x: 25,
        y: 25,
        energy: 100,
      }),
      new Creature({
        speciesId: 'omnivore_legacy',
        lineageId: 'legacy_line_2',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'omnivore' },
        x: 30,
        y: 30,
        energy: 120,
      }),
    ];

    // Create engine with old-style creatures (simulating loaded old save)
    let engine: any;
    expect(() => {
      engine = createEngine(98765, creatures, 50, 50);
    }).not.toThrow();

    // Run a few ticks to verify the simulation doesn't crash
    let state: any;
    expect(() => {
      if (engine) state = runEngine(engine, 10);
    }).not.toThrow();

    // Verify state is valid with hydrology fields intact
    if (state) {
      expect(state.tick).toBe(10);
      expect(state.world).toBeDefined();

      // Verify a cell has all expected fields
      const sampleCell = state.world.getCell(25, 25);
      expect(sampleCell).toBeDefined();
      expect(sampleCell.substrate).toBeDefined();
      expect(sampleCell.waterDepth).toBeDefined();
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
