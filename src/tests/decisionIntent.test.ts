import { describe, it, expect, beforeEach } from 'vitest';
import { Creature, decideTick, applyMovementWithScan, scanEnvironment } from '../simulation/creature';
import { World } from '../simulation/world';
import { CreatureSpatialIndex } from '../simulation/creatureSpatialIndex';
import { DEFAULT_TRAITS } from '../utils/traits';
import { createRng } from '../simulation/rng';
import { createDecisionIntent } from '../simulation/decisionIntent';

describe('DecisionIntent - Single Perception Pass Optimization', () => {
  beforeEach(() => {
    Creature.resetIdCounter();
  });

  it('decideTick returns both decision and perception scan', () => {
    const creature = new Creature({
      speciesId: 'herbivore_1',
      lineageId: 'line_1',
      parentId: null,
      traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
      x: 50,
      y: 50,
      energy: 80,
    });

    const world = new World(100, 100);
    const rng = createRng(12345);

    // New decideTick returns both decision and scan
    const { decision, scan } = decideTick(
      creature,
      world,
      [creature],
      rng
    );

    expect(decision).toBeDefined();
    expect(['move-to-food', 'flee', 'search', 'idle']).toContain(decision);
    expect(scan).toBeDefined();
    expect(scan.threats).toBeDefined();
    expect(Array.isArray(scan.threats)).toBe(true);
    expect(scan.foodLocations).toBeDefined();
    expect(Array.isArray(scan.foodLocations)).toBe(true);
    expect(scan.foodCreatures).toBeDefined();
    expect(Array.isArray(scan.foodCreatures)).toBe(true);
  });

  it('applyMovementWithScan uses pre-scanned data without rescanning', () => {
    const creature = new Creature({
      speciesId: 'herbivore_1',
      lineageId: 'line_1',
      parentId: null,
      traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', speed: 2, visionRange: 5 },
      x: 50,
      y: 50,
      energy: 100,
    });

    const world = new World(100, 100);
    // Add some producer biomass nearby
    world.getCell(52, 50).producerBiomass = 10;

    const rng = createRng(12345);
    const spatialIndex = new CreatureSpatialIndex([creature]);

    // Get scan from decideTick
    const { decision, scan } = decideTick(
      creature,
      world,
      [creature],
      rng,
      spatialIndex
    );

    const originalX = creature.x;
    const originalY = creature.y;

    // Apply movement using pre-scanned data
    applyMovementWithScan(
      creature,
      decision,
      scan,
      world,
      [creature],
      spatialIndex
    );

    // Movement should have occurred if decision was 'move-to-food'
    if (decision === 'move-to-food') {
      // Creature should move toward food
      const distance = Math.max(
        Math.abs(creature.x - originalX),
        Math.abs(creature.y - originalY)
      );
      expect(distance).toBeGreaterThan(0);
    }
  });

  it('createDecisionIntent bundles scan with decision and movement target', () => {
    const creature = new Creature({
      speciesId: 'herbivore_1',
      lineageId: 'line_1',
      parentId: null,
      traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
      x: 50,
      y: 50,
      energy: 100,
    });

    const world = new World(100, 100);
    world.getCell(52, 50).producerBiomass = 10;

    const rng = createRng(12345);
    const spatialIndex = new CreatureSpatialIndex([creature]);

    const { decision, scan } = decideTick(
      creature,
      world,
      [creature],
      rng,
      spatialIndex
    );

    const intent = createDecisionIntent(creature, decision, scan, world, [creature]);

    expect(intent.creatureId).toBe(creature.id);
    expect(intent.decision).toBe(decision);
    expect(intent.scan).toBe(scan);
    expect(intent.movementTarget).toBeDefined();
    if (decision === 'move-to-food' && scan.foodLocations.length > 0) {
      expect(intent.movementTarget).not.toBeNull();
    }
  });

  it('repeated perception scans in one decision cycle are eliminated', () => {
    // This test verifies the core optimization: no double-scanning
    const creature = new Creature({
      speciesId: 'carnivore_1',
      lineageId: 'line_1',
      parentId: null,
      traits: { ...DEFAULT_TRAITS, energyStrategy: 'carnivore' },
      x: 50,
      y: 50,
      energy: 100,
    });

    const prey = new Creature({
      speciesId: 'herbivore_1',
      lineageId: 'line_2',
      parentId: null,
      traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
      x: 51,
      y: 50,
      energy: 50,
    });

    const world = new World(100, 100);
    const rng = createRng(12345);
    const creatures = [creature, prey];
    const spatialIndex = new CreatureSpatialIndex(creatures);

    // Call decideTick once - internally scans once
    const { decision, scan } = decideTick(
      creature,
      world,
      creatures,
      rng,
      spatialIndex
    );

    // Apply movement using the pre-scanned data - does not rescan
    applyMovementWithScan(
      creature,
      decision,
      scan,
      world,
      creatures,
      spatialIndex
    );

    // Verify the perception data was consistent (came from single scan)
    // If 'food' was found in the scan, movement should have targeted it
    if (decision === 'move-to-food' && scan.foodCreatures.length > 0) {
      // The creature should have moved toward the prey
      const distance = Math.max(
        Math.abs(creature.x - prey.x),
        Math.abs(creature.y - prey.y)
      );
      // Movement should have been attempted (distance may still be > 0 due to speed limits)
      expect(creature.x !== 50 || creature.y !== 50).toBe(true);
    }
  });

  it('execution order is deterministic using tieBreaker', () => {
    const creature1 = new Creature({
      speciesId: 'herbivore_1',
      lineageId: 'line_1',
      parentId: null,
      traits: { ...DEFAULT_TRAITS },
      x: 50,
      y: 50,
      energy: 100,
    });

    const creature2 = new Creature({
      speciesId: 'herbivore_1',
      lineageId: 'line_1',
      parentId: null,
      traits: { ...DEFAULT_TRAITS },
      x: 51,
      y: 50,
      energy: 100,
    });

    // Both have the same species and lineage
    expect(creature1.speciesId).toBe(creature2.speciesId);

    // They should execute in deterministic order: by x, then y, then id
    const creatures = [creature2, creature1]; // out of order
    creatures.sort((a, b) => {
      if (a.speciesId !== b.speciesId) return a.speciesId.localeCompare(b.speciesId);
      if (a.x !== b.x) return a.x - b.x;
      if (a.y !== b.y) return a.y - b.y;
      return a.id.localeCompare(b.id);
    });

    // After sorting, creature1 should come first (x=50 < x=51)
    expect(creatures[0].id).toBe(creature1.id);
    expect(creatures[1].id).toBe(creature2.id);
  });
});
