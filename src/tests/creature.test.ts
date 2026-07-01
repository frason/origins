import { describe, it, expect, beforeEach } from 'vitest';
import { Creature, LifecycleState } from '../simulation/creature';
import { DEFAULT_TRAITS } from '../utils/traits';

describe('Creature', () => {
  beforeEach(() => {
    // Reset id counter before each test to ensure deterministic ids
    Creature.resetIdCounter();
  });

  it('should construct a creature with all fields set correctly', () => {
    const traits = { ...DEFAULT_TRAITS };
    const creature = new Creature({
      speciesId: 'species_1',
      lineageId: 'lineage_1',
      parentId: null,
      traits,
      x: 50,
      y: 60,
      energy: 150,
      age: 0,
      lifecycleState: 'alive',
      corpseDecayTicks: 0,
    });

    expect(creature.id).toBe('creature_0');
    expect(creature.speciesId).toBe('species_1');
    expect(creature.lineageId).toBe('lineage_1');
    expect(creature.parentId).toBeNull();
    expect(creature.traits).toEqual(traits);
    expect(creature.x).toBe(50);
    expect(creature.y).toBe(60);
    expect(creature.energy).toBe(150);
    expect(creature.age).toBe(0);
    expect(creature.lifecycleState).toBe('alive');
    expect(creature.corpseDecayTicks).toBe(0);
  });

  it('should use default values for optional parameters', () => {
    const creature = new Creature({
      speciesId: 'species_1',
      lineageId: 'lineage_1',
      parentId: null,
      traits: { ...DEFAULT_TRAITS },
      x: 10,
      y: 20,
      energy: 100,
    });

    expect(creature.age).toBe(0);
    expect(creature.lifecycleState).toBe('alive');
    expect(creature.corpseDecayTicks).toBe(0);
  });

  it('should generate unique ids across multiple creatures', () => {
    const creature1 = new Creature({
      speciesId: 'species_1',
      lineageId: 'lineage_1',
      parentId: null,
      traits: { ...DEFAULT_TRAITS },
      x: 0,
      y: 0,
      energy: 100,
    });

    const creature2 = new Creature({
      speciesId: 'species_1',
      lineageId: 'lineage_1',
      parentId: null,
      traits: { ...DEFAULT_TRAITS },
      x: 1,
      y: 1,
      energy: 100,
    });

    expect(creature1.id).toBe('creature_0');
    expect(creature2.id).toBe('creature_1');
    expect(creature1.id).not.toBe(creature2.id);
  });

  it('should serialize to JSON correctly', () => {
    const traits = { ...DEFAULT_TRAITS };
    const creature = new Creature({
      speciesId: 'species_1',
      lineageId: 'lineage_1',
      parentId: 'creature_0',
      traits,
      x: 25,
      y: 35,
      energy: 200,
      age: 10,
      lifecycleState: 'alive',
      corpseDecayTicks: 0,
    });

    const json = creature.toJSON() as any;

    expect(json.id).toBe('creature_0');
    expect(json.speciesId).toBe('species_1');
    expect(json.lineageId).toBe('lineage_1');
    expect(json.parentId).toBe('creature_0');
    expect(json.traits).toEqual(traits);
    expect(json.x).toBe(25);
    expect(json.y).toBe(35);
    expect(json.energy).toBe(200);
    expect(json.age).toBe(10);
    expect(json.lifecycleState).toBe('alive');
    expect(json.corpseDecayTicks).toBe(0);
  });

  it('should deserialize from JSON and restore all fields', () => {
    const traits = { ...DEFAULT_TRAITS };
    const jsonData = {
      id: 'creature_99',
      speciesId: 'species_2',
      lineageId: 'lineage_2',
      parentId: 'creature_98',
      traits,
      x: 45,
      y: 55,
      energy: 250,
      age: 25,
      lifecycleState: 'alive' as LifecycleState,
      corpseDecayTicks: 0,
    };

    const creature = Creature.fromJSON(jsonData);

    expect(creature.id).toBe('creature_99');
    expect(creature.speciesId).toBe('species_2');
    expect(creature.lineageId).toBe('lineage_2');
    expect(creature.parentId).toBe('creature_98');
    expect(creature.traits).toEqual(traits);
    expect(creature.x).toBe(45);
    expect(creature.y).toBe(55);
    expect(creature.energy).toBe(250);
    expect(creature.age).toBe(25);
    expect(creature.lifecycleState).toBe('alive');
    expect(creature.corpseDecayTicks).toBe(0);
  });

  it('should perform round-trip serialization without data loss', () => {
    Creature.resetIdCounter();

    const traits = { ...DEFAULT_TRAITS };
    const original = new Creature({
      speciesId: 'species_1',
      lineageId: 'lineage_1',
      parentId: null,
      traits,
      x: 10,
      y: 20,
      energy: 150,
      age: 5,
      lifecycleState: 'dead',
      corpseDecayTicks: 3,
    });

    const json = original.toJSON();
    const restored = Creature.fromJSON(json);

    expect(restored.id).toBe(original.id);
    expect(restored.speciesId).toBe(original.speciesId);
    expect(restored.lineageId).toBe(original.lineageId);
    expect(restored.parentId).toBe(original.parentId);
    expect(restored.traits).toEqual(original.traits);
    expect(restored.x).toBe(original.x);
    expect(restored.y).toBe(original.y);
    expect(restored.energy).toBe(original.energy);
    expect(restored.age).toBe(original.age);
    expect(restored.lifecycleState).toBe(original.lifecycleState);
    expect(restored.corpseDecayTicks).toBe(original.corpseDecayTicks);
  });

  it('should handle different lifecycle states', () => {
    Creature.resetIdCounter();

    const states: LifecycleState[] = ['alive', 'dead', 'corpse'];

    states.forEach((state) => {
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 0,
        y: 0,
        energy: 100,
        lifecycleState: state,
      });

      expect(creature.lifecycleState).toBe(state);
    });
  });

  it('should handle null parentId correctly', () => {
    const creature = new Creature({
      speciesId: 'species_1',
      lineageId: 'lineage_1',
      parentId: null,
      traits: { ...DEFAULT_TRAITS },
      x: 0,
      y: 0,
      energy: 100,
    });

    expect(creature.parentId).toBeNull();

    const json = creature.toJSON() as any;
    expect(json.parentId).toBeNull();

    const restored = Creature.fromJSON(json);
    expect(restored.parentId).toBeNull();
  });

  it('should handle valid parentId correctly', () => {
    const creature = new Creature({
      speciesId: 'species_1',
      lineageId: 'lineage_1',
      parentId: 'creature_parent',
      traits: { ...DEFAULT_TRAITS },
      x: 0,
      y: 0,
      energy: 100,
    });

    expect(creature.parentId).toBe('creature_parent');

    const json = creature.toJSON() as any;
    expect(json.parentId).toBe('creature_parent');

    const restored = Creature.fromJSON(json);
    expect(restored.parentId).toBe('creature_parent');
  });

  it('should throw error on invalid JSON data', () => {
    expect(() => Creature.fromJSON(null)).toThrow(
      'Invalid creature JSON: expected object'
    );

    expect(() => Creature.fromJSON({})).toThrow(
      'Invalid creature JSON: missing or invalid required fields'
    );

    expect(() =>
      Creature.fromJSON({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 'not a number',
        y: 0,
        energy: 100,
      })
    ).toThrow('Invalid creature JSON: missing or invalid required fields');
  });

  it('should correctly reset and track id counter', () => {
    Creature.resetIdCounter();
    expect(Creature.getIdCounter()).toBe(0);

    new Creature({
      speciesId: 'species_1',
      lineageId: 'lineage_1',
      parentId: null,
      traits: { ...DEFAULT_TRAITS },
      x: 0,
      y: 0,
      energy: 100,
    });

    expect(Creature.getIdCounter()).toBe(1);

    new Creature({
      speciesId: 'species_1',
      lineageId: 'lineage_1',
      parentId: null,
      traits: { ...DEFAULT_TRAITS },
      x: 0,
      y: 0,
      energy: 100,
    });

    expect(Creature.getIdCounter()).toBe(2);

    Creature.resetIdCounter();
    expect(Creature.getIdCounter()).toBe(0);
  });
});
