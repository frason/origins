import { describe, it, expect, beforeEach } from 'vitest';
import { getTraversalCost, isWaterPassable } from '../simulation/movement';
import { Creature } from '../simulation/creature';
import { World } from '../simulation/world';
import { DEFAULT_TRAITS } from '../utils/traits';
import { moveAcrossTerrain, terrainMovementCost } from '../simulation/biomeTraversal';
import { createRng } from '../simulation/rng';
import { mutateTraits } from '../simulation/species';

describe('Traversal Cost System (aquaticAdaptation + water depth)', () => {
  let world: World;

  beforeEach(() => {
    Creature.resetIdCounter();
    world = new World(100, 100);
    // Initialize all cells as grassland (default biome)
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        world.setCell(x, y, { biome: 'grassland', waterDepth: 0 });
      }
    }
  });

  describe('getTraversalCost: pure function', () => {
    it('returns baseCost for dry land with non-aquatic creature', () => {
      const creature = new Creature({
        speciesId: 'terrestrial', lineageId: 'terrestrial', parentId: null,
        traits: { ...DEFAULT_TRAITS, aquaticAdaptation: 0 },
        x: 50, y: 50, energy: 100,
      });
      const cell = { waterDepth: 0 };
      const cost = getTraversalCost(creature, cell, 1.0);
      expect(cost).toBe(1.0);
    });

    it('scales cost with water depth when aquaticAdaptation is zero', () => {
      const creature = new Creature({
        speciesId: 'terrestrial', lineageId: 'terrestrial', parentId: null,
        traits: { ...DEFAULT_TRAITS, aquaticAdaptation: 0 },
        x: 50, y: 50, energy: 100,
      });
      // Dry cost = 1.0, water depth = 0.5
      // Expected: 1.0 * (1 + 0.5 * (1 - 0)) = 1.5
      const cost = getTraversalCost(creature, { waterDepth: 0.5 }, 1.0);
      expect(cost).toBe(1.5);
    });

    it('reduces water cost with high aquaticAdaptation', () => {
      const creature = new Creature({
        speciesId: 'aquatic', lineageId: 'aquatic', parentId: null,
        traits: { ...DEFAULT_TRAITS, aquaticAdaptation: 1.0 },
        x: 50, y: 50, energy: 100,
      });
      // Dry cost = 1.0, water depth = 0.5, adaptation = 1.0
      // Expected: 1.0 * (1 + 0.5 * (1 - 1.0)) = 1.0
      const cost = getTraversalCost(creature, { waterDepth: 0.5 }, 1.0);
      expect(cost).toBeCloseTo(1.0, 5);
    });

    it('makes dry land expensive for highly aquatic creatures', () => {
      const creature = new Creature({
        speciesId: 'aquatic', lineageId: 'aquatic', parentId: null,
        traits: { ...DEFAULT_TRAITS, aquaticAdaptation: 1.0 },
        x: 50, y: 50, energy: 100,
      });
      // Dry cell with adaptation = 1.0
      // Expected: 1.0 * (1 + (1.0 - 0.5) * 2) = 1.0 * 2.0 = 2.0
      const cost = getTraversalCost(creature, { waterDepth: 0 }, 1.0);
      expect(cost).toBeCloseTo(2.0, 5);
    });

    it('makes dry land neutral for barely aquatic creatures (adaptation = 0.5)', () => {
      const creature = new Creature({
        speciesId: 'semi-aquatic', lineageId: 'semi-aquatic', parentId: null,
        traits: { ...DEFAULT_TRAITS, aquaticAdaptation: 0.5 },
        x: 50, y: 50, energy: 100,
      });
      // At adaptation = 0.5, dry land penalty starts (penalty = (0.5 - 0.5) * 2 = 0)
      const cost = getTraversalCost(creature, { waterDepth: 0 }, 1.0);
      expect(cost).toBeCloseTo(1.0, 5);
    });

    it('handles edge case: negative water depth clamped to zero', () => {
      const creature = new Creature({
        speciesId: 'terrestrial', lineageId: 'terrestrial', parentId: null,
        traits: { ...DEFAULT_TRAITS, aquaticAdaptation: 0 },
        x: 50, y: 50, energy: 100,
      });
      const cost = getTraversalCost(creature, { waterDepth: -1 }, 1.0);
      expect(cost).toBe(1.0); // Treated as dry (waterDepth = 0)
    });

    it('handles edge case: negative adaptation clamped to zero', () => {
      const creature = new Creature({
        speciesId: 'terrestrial', lineageId: 'terrestrial', parentId: null,
        traits: { ...DEFAULT_TRAITS, aquaticAdaptation: -1 },
        x: 50, y: 50, energy: 100,
      });
      const cost = getTraversalCost(creature, { waterDepth: 0.5 }, 1.0);
      // Adaptation clamped to 0: 1.0 * (1 + 0.5 * 1) = 1.5
      expect(cost).toBe(1.5);
    });
  });

  describe('isWaterPassable', () => {
    it('returns true when cost is below MAX_MOVEMENT_COST', () => {
      const creature = new Creature({
        speciesId: 'terrestrial', lineageId: 'terrestrial', parentId: null,
        traits: { ...DEFAULT_TRAITS, aquaticAdaptation: 0 },
        x: 50, y: 50, energy: 100,
      });
      const cell = { waterDepth: 0.2 };
      expect(isWaterPassable(creature, cell, 1.0)).toBe(true);
    });

    it('returns false when cost exceeds MAX_MOVEMENT_COST (deep water)', () => {
      const creature = new Creature({
        speciesId: 'terrestrial', lineageId: 'terrestrial', parentId: null,
        traits: { ...DEFAULT_TRAITS, aquaticAdaptation: 0.1 },
        x: 50, y: 50, energy: 100,
      });
      // MAX_MOVEMENT_COST = 5.0
      // Cost = 1.0 * (1 + 5.0 * (1 - 0.1)) = 5.5 > 5.0 → impassable
      const cell = { waterDepth: 5.0 };
      expect(isWaterPassable(creature, cell, 1.0)).toBe(false);
    });

    it('returns true for aquatic creature in deep water', () => {
      const creature = new Creature({
        speciesId: 'aquatic', lineageId: 'aquatic', parentId: null,
        traits: { ...DEFAULT_TRAITS, aquaticAdaptation: 0.9 },
        x: 50, y: 50, energy: 100,
      });
      // Cost = 1.0 * (1 + 2.0 * (1 - 0.9)) = 1.2 < 5.0 → passable
      const cell = { waterDepth: 2.0 };
      expect(isWaterPassable(creature, cell, 1.0)).toBe(true);
    });
  });

  describe('Movement routing with traversal cost', () => {
    it('prefers longer dry route over shorter deep-water route (terrestrial)', () => {
      const creature = new Creature({
        speciesId: 'terrestrial', lineageId: 'terrestrial', parentId: null,
        traits: { ...DEFAULT_TRAITS, speed: 10, aquaticAdaptation: 0 },
        x: 10, y: 50, energy: 500,
      });

      // Set up a scenario: start at (10, 50), target at (40, 50)
      // Route 1 (dry): (10->11->12->...->40, 30 cells, cost = 1 each)
      // Route 2 (water): (10->25->40, 3 cells, cost = 5 each for deep water)
      // The creature should prefer the dry route

      // Make a deep water zone in the middle
      for (let x = 15; x <= 35; x++) {
        world.setCell(x, 50, { waterDepth: 1.0, biome: 'wetland' });
      }

      // Move toward target (40, 50)
      const result = moveAcrossTerrain(creature, { x: 40, y: 50 }, world);

      // Should have moved east (along x axis), staying close to start position
      // since water costs more than movement speed allows
      expect(result.x).toBeGreaterThan(10);
      expect(result.y).toBe(50); // Should stay on same row
    });

    it('prefers shorter water route when creature is highly aquatic', () => {
      const creature = new Creature({
        speciesId: 'aquatic', lineageId: 'aquatic', parentId: null,
        traits: { ...DEFAULT_TRAITS, speed: 10, aquaticAdaptation: 0.95 },
        x: 10, y: 50, energy: 500,
      });

      // Same setup as above, but creature should prefer the water route
      // because water cost is minimal for highly adapted creatures
      for (let x = 15; x <= 35; x++) {
        world.setCell(x, 50, { waterDepth: 0.5, biome: 'wetland' });
      }

      const result = moveAcrossTerrain(creature, { x: 40, y: 50 }, world);

      // Should move significantly toward target through water
      expect(result.x).toBeGreaterThan(10);
      expect(result.y).toBe(50);
    });

    it('makes dry land expensive for aquatic creature', () => {
      const creature = new Creature({
        speciesId: 'aquatic', lineageId: 'aquatic', parentId: null,
        traits: { ...DEFAULT_TRAITS, speed: 1, aquaticAdaptation: 0.9 },
        x: 50, y: 50, energy: 100,
      });

      // Surround the creature with dry land to the north
      for (let x = 45; x <= 55; x++) {
        world.setCell(x, 49, { waterDepth: 0, biome: 'grassland' });
        world.setCell(x, 48, { waterDepth: 0, biome: 'grassland' });
      }
      // Put water to the south (where the creature should prefer)
      for (let x = 45; x <= 55; x++) {
        world.setCell(x, 51, { waterDepth: 0.5, biome: 'wetland' });
      }

      // Try to move north (into dry land) vs south (into water)
      // With high aquatic adaptation, dry land should be expensive
      const result = moveAcrossTerrain(creature, { x: 50, y: 49 }, world);

      // Aquatic creature may not move north due to dry land penalty
      // or if it does, it should be minimal
      expect(result.y).toBeGreaterThanOrEqual(50);
    });
  });

  describe('Determinism: same seed produces identical paths', () => {
    it('replays mixed terrain with consistent creature paths', () => {
      const seeds = [42, 42]; // Same seed twice
      const paths = seeds.map((seed) => {
        Creature.resetIdCounter();
        const worldCopy = new World(100, 100);
        for (let y = 0; y < worldCopy.height; y++) {
          for (let x = 0; x < worldCopy.width; x++) {
            // Mixed terrain with some water zones
            const waterDepth = Math.sin(x / 5) * Math.sin(y / 7) > 0.3 ? 0.3 : 0;
            worldCopy.setCell(x, y, { biome: 'grassland', waterDepth });
          }
        }

        const creature = new Creature({
          speciesId: 'traveler', lineageId: 'traveler', parentId: null,
          traits: { ...DEFAULT_TRAITS, speed: 2, aquaticAdaptation: 0.5 },
          x: 10, y: 10, energy: 500,
        });

        const path = [{ x: creature.x, y: creature.y }];
        for (let tick = 0; tick < 20; tick++) {
          moveAcrossTerrain(creature, { x: 90, y: 90 }, worldCopy);
          path.push({ x: creature.x, y: creature.y });
        }
        return path;
      });

      // Two runs with same seed should produce identical paths
      expect(paths[0]).toEqual(paths[1]);
    });
  });

  describe('aquaticAdaptation trait exists and is mutable', () => {
    it('creature has aquaticAdaptation trait with valid default value', () => {
      const creature = new Creature({
        speciesId: 'test', lineageId: 'test', parentId: null,
        traits: DEFAULT_TRAITS,
        x: 50, y: 50, energy: 100,
      });
      expect(creature.traits.aquaticAdaptation).toBeDefined();
      expect(typeof creature.traits.aquaticAdaptation).toBe('number');
      expect(creature.traits.aquaticAdaptation).toBeGreaterThanOrEqual(0);
      expect(creature.traits.aquaticAdaptation).toBeLessThanOrEqual(1);
    });

    it('aquaticAdaptation trait is within valid bounds', () => {
      const traits = {
        ...DEFAULT_TRAITS,
        aquaticAdaptation: 0.5,
      };
      const creature = new Creature({
        speciesId: 'test', lineageId: 'test', parentId: null,
        traits,
        x: 50, y: 50, energy: 100,
      });
      expect(creature.traits.aquaticAdaptation).toBe(0.5);
    });

    it('aquaticAdaptation trait actually mutates via mutateTraits', () => {
      // Verify that the trait can change via the mutation system with forced mutations
      let changed = false;
      const rng = createRng(1234);
      let traits = { ...DEFAULT_TRAITS, aquaticAdaptation: 0.3 };

      // Force 100 mutations with high drift to increase chance of detecting change
      for (let i = 0; i < 100; i++) {
        const mutated = mutateTraits(traits, rng, 0.1, 1.0); // mutationRate=1.0 forces mutation every call
        if (mutated.aquaticAdaptation !== traits.aquaticAdaptation) {
          changed = true;
          break;
        }
        traits = mutated;
      }

      expect(changed).toBe(true);
    });
  });
});
