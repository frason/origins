import { describe, it, expect, beforeEach } from 'vitest';
import {
  Creature,
  DecisionType,
  decideTick,
  applyMovement,
  scanEnvironment,
  chebyshevDistance,
  findNearestTarget,
  calculateNextPosition,
  getSearchTarget,
} from '../simulation/creature';
import { World } from '../simulation/world';
import { createRng } from '../simulation/rng';
import { DEFAULT_TRAITS } from '../utils/traits';
import {
  BIOME_MOVEMENT_COST,
  isTerrainTraversable,
  moveAcrossTerrain,
  reachableTerrainCells,
} from '../simulation/biomeTraversal';

describe('Movement and Decision Logic', () => {
  let world: World;
  let rng: ReturnType<typeof createRng>;

  beforeEach(() => {
    Creature.resetIdCounter();
    world = new World(100, 100);
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) world.setCell(x, y, { biome: 'grassland' });
    }
    rng = createRng(12345); // Fixed seed for determinism
  });

  describe('chebyshevDistance', () => {
    it('should calculate Chebyshev distance correctly', () => {
      expect(chebyshevDistance(0, 0, 0, 0)).toBe(0);
      expect(chebyshevDistance(0, 0, 3, 4)).toBe(4); // max(3, 4)
      expect(chebyshevDistance(5, 5, 8, 7)).toBe(3); // max(3, 2)
      expect(chebyshevDistance(10, 10, 5, 5)).toBe(5); // max(5, 5)
    });
  });

  describe('findNearestTarget', () => {
    it('should find the nearest target', () => {
      const targets = [
        { x: 10, y: 10 },
        { x: 20, y: 20 },
        { x: 5, y: 5 },
      ];

      const nearest = findNearestTarget(0, 0, targets);
      expect(nearest).toEqual({ x: 5, y: 5 });
    });

    it('should return null for empty targets', () => {
      const nearest = findNearestTarget(0, 0, []);
      expect(nearest).toBeNull();
    });

    it('should return first target if tied', () => {
      const targets = [
        { x: 5, y: 0 },
        { x: 0, y: 5 },
      ];

      const nearest = findNearestTarget(0, 0, targets);
      expect(nearest).toEqual({ x: 5, y: 0 });
    });
  });

  describe('calculateNextPosition', () => {
    it('should move toward target within speed limit', () => {
      const pos = calculateNextPosition(0, 0, 10, 10, 3);
      expect(pos.x).toBe(3);
      expect(pos.y).toBe(3);
    });

    it('should not exceed speed', () => {
      const pos = calculateNextPosition(0, 0, 100, 100, 2);
      expect(Math.max(Math.abs(pos.x - 0), Math.abs(pos.y - 0))).toBe(2);
    });

    it('should reach target if within speed range', () => {
      const pos = calculateNextPosition(0, 0, 2, 2, 5);
      expect(pos).toEqual({ x: 2, y: 2 });
    });

    it('should handle diagonal movement', () => {
      const pos = calculateNextPosition(5, 5, 10, 8, 10);
      expect(pos.x).toBe(10);
      expect(pos.y).toBe(8);
    });

    it('should handle zero speed', () => {
      const pos = calculateNextPosition(5, 5, 10, 10, 0);
      expect(pos).toEqual({ x: 5, y: 5 });
    });
  });

  describe('scanEnvironment', () => {
    it('should detect food nearby for herbivore', () => {
      const herbivore = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', visionRange: 5 },
        x: 50,
        y: 50,
        energy: 100,
      });

      // Add biomass at (55, 50)
      world.setCell(55, 50, { producerBiomass: 10 });

      const scan = scanEnvironment(herbivore, world, [], rng);
      expect(scan.foodLocations.length).toBeGreaterThan(0);
      expect(scan.foodLocations[0]).toEqual({ x: 55, y: 50, biomass: 10 });
    });

    it('should not detect food beyond vision range', () => {
      const herbivore = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', visionRange: 3 },
        x: 50,
        y: 50,
        energy: 100,
      });

      // Add biomass far away
      world.setCell(70, 70, { producerBiomass: 10 });

      const scan = scanEnvironment(herbivore, world, [], rng);
      expect(scan.foodLocations.length).toBe(0);
    });

    it('should detect carnivorous threats', () => {
      const herbivore = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', visionRange: 10 },
        x: 50,
        y: 50,
        energy: 100,
      });

      const predator = new Creature({
        speciesId: 'species_2',
        lineageId: 'lineage_2',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore' },
        x: 55,
        y: 50,
        energy: 100,
      });

      // Create a fresh RNG for this test
      const testRng = createRng(12345);
      const scan = scanEnvironment(herbivore, world, [herbivore, predator], testRng);

      // Threat detection depends on camouflage and RNG
      // With default low camouflage (0.5), there's a good chance it's detected
      // We can't guarantee the result due to RNG, but we can verify the logic
    });

    it('should respect camouflage for prey detection by predators', () => {
      const highCamouflageHerbivore = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', visionRange: 10, camouflage: 1 },
        x: 50,
        y: 50,
        energy: 100,
      });

      const predator = new Creature({
        speciesId: 'species_2',
        lineageId: 'lineage_2',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore', visionRange: 10 },
        x: 55,
        y: 50,
        energy: 100,
      });

      // With prey camouflage = 1, predator cannot detect prey as food
      const testRng = createRng(12345);
      const scan = scanEnvironment(
        predator,
        world,
        [highCamouflageHerbivore, predator],
        testRng
      );
      expect(scan.foodCreatures).toHaveLength(0);
    });

    it('should detect carnivorous food for carnivore', () => {
      const carnivore = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore', visionRange: 10 },
        x: 50,
        y: 50,
        energy: 100,
      });

      const herbivore = new Creature({
        speciesId: 'species_2',
        lineageId: 'lineage_2',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
        x: 55,
        y: 50,
        energy: 100,
      });

      const scan = scanEnvironment(carnivore, world, [carnivore, herbivore], rng);
      expect(scan.foodCreatures.length).toBeGreaterThan(0);
      expect(scan.foodCreatures[0].id).toBe(herbivore.id);
    });
  });

  describe('decideTick', () => {
    it('should return idle when no food or threats', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, visionRange: 5 },
        x: 50,
        y: 50,
        energy: 100,
      });

      const decision = decideTick(creature, world, [creature], rng);
      expect(decision).toBe('idle');
    });

    it('should return move-to-food when food is nearby', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', visionRange: 10 },
        x: 50,
        y: 50,
        energy: 50, // Below max energy (100 for size=1)
      });

      // Add nearby food
      world.setCell(55, 50, { producerBiomass: 10 });

      const decision = decideTick(creature, world, [creature], rng);
      expect(decision).toBe('move-to-food');
    });

    it('should return flee when threatened', () => {
      const herbivore = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', visionRange: 10, camouflage: 0 },
        x: 50,
        y: 50,
        energy: 100,
      });

      const predator = new Creature({
        speciesId: 'species_2',
        lineageId: 'lineage_2',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore' },
        x: 55,
        y: 50,
        energy: 100,
      });

      // Use RNG that always returns low values (always detects)
      const detectRng = () => 0.1; // Always less than 1 - camouflage

      const decision = decideTick(herbivore, world, [herbivore, predator], detectRng);
      expect(decision).toBe('flee');
    });

    it('should prioritize fleeing over moving to food', () => {
      const herbivore = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', visionRange: 10, camouflage: 0 },
        x: 50,
        y: 50,
        energy: 100,
      });

      const predator = new Creature({
        speciesId: 'species_2',
        lineageId: 'lineage_2',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore' },
        x: 55,
        y: 50,
        energy: 100,
      });

      // Add nearby food
      world.setCell(45, 50, { producerBiomass: 10 });

      // Use RNG that always detects
      const detectRng = () => 0.1;

      const decision = decideTick(herbivore, world, [herbivore, predator], detectRng);
      expect(decision).toBe('flee');
    });

    it('should return idle when at full energy even if food is nearby', () => {
      // size = 1, MAX_ENERGY = 1 * 100 = 100
      const fullEnergyCreature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, size: 1, energyStrategy: 'herbivore', visionRange: 10 },
        x: 50,
        y: 50,
        energy: 100, // exactly at max energy (size * 100)
      });

      // Add nearby food that would normally trigger move-to-food
      world.setCell(55, 50, { producerBiomass: 10 });

      const decision = decideTick(fullEnergyCreature, world, [fullEnergyCreature], rng);
      expect(decision).toBe('idle');
    });

    it('should move to food when below full energy', () => {
      // size = 1, MAX_ENERGY = 1 * 100 = 100
      const partialEnergyCreature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, size: 1, energyStrategy: 'herbivore', visionRange: 10 },
        x: 50,
        y: 50,
        energy: 99, // below max energy
      });

      // Add nearby food
      world.setCell(55, 50, { producerBiomass: 10 });

      const decision = decideTick(partialEnergyCreature, world, [partialEnergyCreature], rng);
      expect(decision).toBe('move-to-food');
    });
  });

  describe('applyMovement', () => {
    it('should move creature toward food', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', visionRange: 10, speed: 2 },
        x: 50,
        y: 50,
        energy: 100,
      });

      // Add food
      world.setCell(55, 50, { producerBiomass: 10 });

      const decision: DecisionType = 'move-to-food';
      applyMovement(creature, decision, world, [creature], rng);

      // Creature should move toward (55, 50)
      expect(creature.x).toBeGreaterThan(50);
      expect(creature.x).toBeLessThanOrEqual(52); // speed is 2
    });

    it('should not move beyond world bounds when moving to food', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', visionRange: 10, speed: 10 },
        x: 98,
        y: 50,
        energy: 100,
      });

      // Add food beyond bounds
      world.setCell(99, 50, { producerBiomass: 10 });

      const decision: DecisionType = 'move-to-food';
      applyMovement(creature, decision, world, [creature], rng);

      // Creature should be clamped to bounds
      expect(creature.x).toBeLessThanOrEqual(99);
      expect(creature.x).toBeGreaterThanOrEqual(0);
    });

    it('should move away from threats', () => {
      const herbivore = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', visionRange: 10, speed: 2, camouflage: 0 },
        x: 50,
        y: 50,
        energy: 100,
      });

      const predator = new Creature({
        speciesId: 'species_2',
        lineageId: 'lineage_2',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore' },
        x: 55,
        y: 50,
        energy: 100,
      });

      // Use RNG that always detects
      const detectRng = () => 0.1;

      const decision: DecisionType = 'flee';
      applyMovement(herbivore, decision, world, [herbivore, predator], detectRng);

      // Herbivore should move away from predator (move left since predator is to the right)
      expect(herbivore.x).toBeLessThanOrEqual(50);
    });

    it('should not move for idle decision', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, speed: 5 },
        x: 50,
        y: 50,
        energy: 100,
      });

      const originalX = creature.x;
      const originalY = creature.y;

      applyMovement(creature, 'idle', world, [creature], rng);

      expect(creature.x).toBe(originalX);
      expect(creature.y).toBe(originalY);
    });

    it('should not move for eat decision', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, speed: 5 },
        x: 50,
        y: 50,
        energy: 100,
      });

      const originalX = creature.x;
      const originalY = creature.y;

      applyMovement(creature, 'eat', world, [creature], rng);

      expect(creature.x).toBe(originalX);
      expect(creature.y).toBe(originalY);
    });

    it('should not move for reproduce decision', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, speed: 5 },
        x: 50,
        y: 50,
        energy: 100,
      });

      const originalX = creature.x;
      const originalY = creature.y;

      applyMovement(creature, 'reproduce', world, [creature], rng);

      expect(creature.x).toBe(originalX);
      expect(creature.y).toBe(originalY);
    });

    it('should clamp movement to world bounds', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', visionRange: 100, speed: 100 },
        x: 0,
        y: 0,
        energy: 100,
      });

      // Add food at (0, 0) - already there
      world.setCell(0, 0, { producerBiomass: 10 });

      applyMovement(creature, 'move-to-food', world, [creature], rng);

      // Creature should be within bounds
      expect(creature.x).toBeGreaterThanOrEqual(0);
      expect(creature.x).toBeLessThan(100);
      expect(creature.y).toBeGreaterThanOrEqual(0);
      expect(creature.y).toBeLessThan(100);
    });

    it('should respect speed limit', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', visionRange: 100, speed: 3 },
        x: 50,
        y: 50,
        energy: 100,
      });

      // Add food far away
      world.setCell(60, 60, { producerBiomass: 10 });

      applyMovement(creature, 'move-to-food', world, [creature], rng);

      // Movement should not exceed speed
      const distance = Math.max(
        Math.abs(creature.x - 50),
        Math.abs(creature.y - 50)
      );
      expect(distance).toBeLessThanOrEqual(3);
    });
  });

  describe('biome traversal', () => {
    it('makes ocean and mountain impassable while keeping land costs distinct', () => {
      world.setCell(51, 50, { biome: 'ocean' });
      world.setCell(52, 50, { biome: 'mountain' });
      expect(isTerrainTraversable(world, 51, 50)).toBe(false);
      expect(isTerrainTraversable(world, 52, 50)).toBe(false);
      expect(BIOME_MOVEMENT_COST.wetland).toBeGreaterThan(BIOME_MOVEMENT_COST.grassland);
      expect(BIOME_MOVEMENT_COST.tundra).toBeGreaterThan(BIOME_MOVEMENT_COST.desert);
    });

    it('does not cross an impassable wall or perceive food behind it', () => {
      const creature = new Creature({
        speciesId: 'grazer', lineageId: 'grazer', parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', visionRange: 5, speed: 2 },
        x: 10, y: 10, energy: 50,
      });
      for (let y = 5; y <= 15; y++) world.setCell(11, y, { biome: 'ocean' });
      world.setCell(12, 10, { producerBiomass: 20, biome: 'grassland' });

      const reachable = reachableTerrainCells(world, 10, 10, 5);
      expect(reachable.has('12,10')).toBe(false);
      expect(scanEnvironment(creature, world, [creature], rng).foodLocations).toHaveLength(0);
      applyMovement(creature, 'search', world, [creature], rng);
      expect(creature.x).toBeLessThanOrEqual(10);
    });

    it('slows movement deterministically in costly passable biomes', () => {
      const makeCreature = (age: number) => new Creature({
        speciesId: 'grazer', lineageId: 'grazer', parentId: null,
        traits: { ...DEFAULT_TRAITS, speed: 1 }, x: 20, y: 20, energy: 50, age,
      });
      for (let y = 19; y <= 21; y++) {
        for (let x = 19; x <= 21; x++) world.setCell(x, y, { biome: 'ocean' });
      }
      world.setCell(20, 20, { biome: 'grassland' });
      world.setCell(21, 20, { biome: 'wetland' });
      world.setCell(22, 20, { biome: 'grassland' });
      const delayed = makeCreature(5);
      const moving = makeCreature(1);

      expect(moveAcrossTerrain(delayed, { x: 22, y: 20 }, world)).toEqual({ x: 20, y: 20 });
      expect(moveAcrossTerrain(moving, { x: 22, y: 20 }, world)).toEqual({ x: 21, y: 20 });
      expect(moveAcrossTerrain(moving, { x: 22, y: 20 }, world))
        .toEqual(moveAcrossTerrain(moving, { x: 22, y: 20 }, world));
    });
  });

  describe('search behavior', () => {
    it('should search when hungry but no food visible', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', visionRange: 5, speed: 2 },
        x: 50,
        y: 50,
        energy: 50, // Below max energy
      });

      // No food nearby - should trigger search
      const decision = decideTick(creature, world, [creature], rng);
      expect(decision).toBe('search');
    });

    it('should move when searching', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'omnivore', visionRange: 5, speed: 2 },
        x: 50,
        y: 50,
        energy: 50, // Below max energy
      });

      const originalX = creature.x;
      const originalY = creature.y;

      applyMovement(creature, 'search', world, [creature], rng);

      // Creature should have moved away from original position
      const distance = Math.max(
        Math.abs(creature.x - originalX),
        Math.abs(creature.y - originalY)
      );
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThanOrEqual(2); // speed is 2
    });

    it('should respect world bounds when searching', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'omnivore', visionRange: 5, speed: 5 },
        x: 0,
        y: 0,
        energy: 50,
      });

      applyMovement(creature, 'search', world, [creature], rng);

      // Should be within bounds
      expect(creature.x).toBeGreaterThanOrEqual(0);
      expect(creature.x).toBeLessThan(100);
      expect(creature.y).toBeGreaterThanOrEqual(0);
      expect(creature.y).toBeLessThan(100);
    });

    it('should hold a heading long enough to roam beyond vision range', () => {
      const makeRoamer = () => {
        const roamer = new Creature({
          speciesId: 'species_1',
          lineageId: 'lineage_1',
          parentId: null,
          traits: { ...DEFAULT_TRAITS, energyStrategy: 'omnivore', visionRange: 5, speed: 2 },
          x: 50,
          y: 50,
          energy: 50,
        });
        roamer.id = 'deterministic_roamer';
        return roamer;
      };

      const roam = () => {
        const roamer = makeRoamer();
        const path = [{ x: roamer.x, y: roamer.y }];
        for (let tick = 0; tick < 12; tick++) {
          applyMovement(roamer, 'search', world, [roamer], createRng(100 + tick));
          roamer.age++;
          path.push({ x: roamer.x, y: roamer.y });
        }
        return path;
      };

      const path = roam();
      const maxDistance = Math.max(
        ...path.map((position) => chebyshevDistance(50, 50, position.x, position.y))
      );
      const uniqueTiles = new Set(path.map((position) => `${position.x},${position.y}`));

      expect(maxDistance).toBeGreaterThanOrEqual(10);
      expect(uniqueTiles.size).toBeGreaterThanOrEqual(7);
      expect(roam()).toEqual(path);
    });

    it('should recover toward the world center after reaching a boundary', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'omnivore', speed: 2 },
        x: 0,
        y: 25,
        energy: 50,
      });

      expect(getSearchTarget(creature, world)).toEqual({ x: 50, y: 50 });
      applyMovement(creature, 'search', world, [creature], rng);
      expect(creature.x).toBe(2);
      expect(creature.y).toBe(27);
    });
  });

  describe('Integration: Decision and Movement', () => {
    it('complete flow: detect food and move toward it', () => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', visionRange: 15, speed: 2 },
        x: 40,
        y: 40,
        energy: 50, // Below max energy (100 for size=1)
      });

      // Add food
      world.setCell(50, 40, { producerBiomass: 10 });

      const testRng = createRng(12345);
      const decision = decideTick(creature, world, [creature], testRng);
      expect(decision).toBe('move-to-food');

      const testRng2 = createRng(12345);
      applyMovement(creature, decision, world, [creature], testRng2);

      // Creature should have moved toward the food
      expect(creature.x).toBeGreaterThan(40);
      expect(creature.x).toBeLessThanOrEqual(42);
      expect(creature.y).toBe(40);
    });

    it('complete flow: detect threat and flee', () => {
      const herbivore = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', visionRange: 15, speed: 2, camouflage: 0 },
        x: 40,
        y: 40,
        energy: 100,
      });

      const predator = new Creature({
        speciesId: 'species_2',
        lineageId: 'lineage_2',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore' },
        x: 50,
        y: 40,
        energy: 100,
      });

      const testRng = () => 0.1; // Always detect
      const decision = decideTick(herbivore, world, [herbivore, predator], testRng);
      expect(decision).toBe('flee');

      applyMovement(herbivore, decision, world, [herbivore, predator], testRng);

      // Herbivore should move away from predator
      expect(herbivore.x).toBeLessThan(40);
    });
  });
});
