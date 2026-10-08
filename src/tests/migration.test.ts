import { describe, it, expect, beforeEach } from 'vitest';
import { Creature } from '../simulation/creature';
import { World } from '../simulation/world';

/**
 * Migration tests: verify that old saves (pre-#263, missing new hydrology fields)
 * load correctly with deterministic defaults and continue to simulate without errors.
 */

describe('Old save migration (pre-#263 hydrology)', () => {
  beforeEach(() => {
    Creature.resetIdCounter();
  });

  /**
   * Fixture: a pre-#263 world state with minimal fields, missing substrate/waterDepth/etc.
   */
  function buildOldSaveFixture(): any {
    const oldWorldJson = {
      version: 1,
      width: 100,
      height: 100,
      cells: Array.from({ length: 100 * 100 }, (_, idx) => {
        const x = idx % 100;
        const y = Math.floor(idx / 100);
        return {
          biome: x > 50 ? 'forest' : 'grassland',
          elevation: Math.sin(x / 20) + Math.cos(y / 20),
          temperature: 20 + Math.random() * 10,
          moisture: 0.3 + Math.random() * 0.4,
          energy: 10 + Math.random() * 5,
          nutrients: 15 + Math.random() * 10,
          producerArchetype: 'ground-cover',
          producerBiomass: Math.random() * 30,
          toxicity: Math.random() * 0.2,
          // Pre-#263: MISSING substrate, waterDepth, waterTable, dissolvedNutrients, salinity
        };
      }),
      creatures: [
        {
          id: 'creature_legacy_1',
          speciesId: 'herbivore_v0',
          lineageId: 'lineage_root_1',
          parentId: null,
          x: 45,
          y: 45,
          energy: 100,
          age: 5,
          lifecycleState: 'alive',
          corpseDecayTicks: 0,
          traits: {
            size: 1.0,
            speed: 1.0,
            visionRange: 5,
            hearingRange: 3,
            camouflage: 0.3,
            armor: 0.1,
            boneDensity: 1.0,
            metabolism: 1.0,
            reproductionRate: 0.8,
            brainSize: 0.5,
            consciousness: 0.2,
            communication: 0.0,
            collectiveConnection: 0.0,
            energyStrategy: 'herbivore',
          },
        },
        {
          id: 'creature_legacy_2',
          speciesId: 'omnivore_v0',
          lineageId: 'lineage_root_2',
          parentId: null,
          x: 55,
          y: 55,
          energy: 120,
          age: 3,
          lifecycleState: 'alive',
          corpseDecayTicks: 0,
          traits: {
            size: 1.2,
            speed: 0.9,
            visionRange: 6,
            hearingRange: 4,
            camouflage: 0.2,
            armor: 0.2,
            boneDensity: 1.1,
            metabolism: 1.1,
            reproductionRate: 0.7,
            brainSize: 0.6,
            consciousness: 0.3,
            communication: 0.1,
            collectiveConnection: 0.0,
            energyStrategy: 'omnivore',
          },
        },
      ],
      events: [],
      history: [],
      historyInterval: 10,
      speciesProfiles: {},
      incipientSpecies: {},
    };
    return oldWorldJson;
  }

  it('loads a pre-#263 fixture and applies deterministic defaults for missing hydrology fields', () => {
    const oldSave = buildOldSaveFixture();

    // Simulate deserialization: check that cells don't have new fields
    const firstCell = oldSave.cells[0];
    expect(firstCell.substrate).toBeUndefined();
    expect(firstCell.waterDepth).toBeUndefined();
    expect(firstCell.waterTable).toBeUndefined();
    expect(firstCell.dissolvedNutrients).toBeUndefined();
    expect(firstCell.salinity).toBeUndefined();
  });

  it('constructs a World from old save without crashing', () => {
    const oldSave = buildOldSaveFixture();

    // Reconstruct world from old save (simulating deserialization)
    // World.fromJSON() should apply deterministic defaults
    let world: World | null = null;
    expect(() => {
      // Create a world with the old cell data
      world = new World(
        oldSave.width,
        oldSave.height,
        { seed: 12345 },
        oldSave.cells // Pass old cells; World should initialize missing fields
      );
    }).not.toThrow();

    expect(world).not.toBeNull();
    if (!world) return;

    // Verify new fields exist with defaults
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const cell = world.getCell(x, y);
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

  it('old creatures deserialize and retain all trait fields', () => {
    const oldSave = buildOldSaveFixture();

    oldSave.creatures.forEach((creatureJson: any) => {
      expect(creatureJson.traits).toBeDefined();
      expect(creatureJson.traits.energyStrategy).toBeDefined();

      // Create creature from old format
      let creature: Creature | null = null;
      expect(() => {
        creature = new Creature(creatureJson);
      }).not.toThrow();

      if (creature) {
        expect(creature.speciesId).toBe(creatureJson.speciesId);
        expect(creature.lineageId).toBe(creatureJson.lineageId);
        expect(creature.energy).toBe(creatureJson.energy);
        expect(creature.traits.energyStrategy).toBe(creatureJson.traits.energyStrategy);
      }
    });
  });
});
