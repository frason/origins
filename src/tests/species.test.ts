import { describe, it, expect, beforeEach } from 'vitest';
import {
  mutateTraits,
  reproduceCreature,
  LineageTree,
  Species,
} from '../simulation/species';
import { Creature } from '../simulation/creature';
import { DEFAULT_TRAITS, TRAIT_MIN, TRAIT_MAX, Traits } from '../utils/traits';
import { createRng } from '../simulation/rng';

describe('Species - Mutations and Lineage Tracking', () => {
  beforeEach(() => {
    Creature.resetIdCounter();
  });

  describe('mutateTraits', () => {
    it('should produce a valid Traits object with same structure as input', () => {
      const rng = createRng(42);
      const mutated = mutateTraits(DEFAULT_TRAITS, rng);

      // Check all fields exist and have expected types
      expect(typeof mutated.size).toBe('number');
      expect(typeof mutated.speed).toBe('number');
      expect(typeof mutated.visionRange).toBe('number');
      expect(typeof mutated.hearingRange).toBe('number');
      expect(typeof mutated.camouflage).toBe('number');
      expect(typeof mutated.armor).toBe('number');
      expect(typeof mutated.boneDensity).toBe('number');
      expect(typeof mutated.metabolism).toBe('number');
      expect(typeof mutated.reproductionRate).toBe('number');
      expect(typeof mutated.brainSize).toBe('number');
      expect(typeof mutated.consciousnessLevel).toBe('number');
      expect(typeof mutated.communication).toBe('number');
      expect(typeof mutated.collectiveConnection).toBe('number');
      expect(['herbivore', 'carnivore', 'omnivore', 'scavenger']).toContain(
        mutated.energyStrategy
      );
    });

    it('should clamp all numeric traits to TRAIT_MIN and TRAIT_MAX', () => {
      const rng = createRng(12345);
      let mutated = mutateTraits(DEFAULT_TRAITS, rng);

      // Test multiple times to be confident about bounds
      for (let i = 0; i < 100; i++) {
        mutated = mutateTraits(mutated, rng);

        // Check all numeric traits are within bounds
        if (TRAIT_MIN.size !== undefined) {
          expect(mutated.size).toBeGreaterThanOrEqual(TRAIT_MIN.size);
        }
        if (TRAIT_MAX.size !== undefined) {
          expect(mutated.size).toBeLessThanOrEqual(TRAIT_MAX.size);
        }

        if (TRAIT_MIN.speed !== undefined) {
          expect(mutated.speed).toBeGreaterThanOrEqual(TRAIT_MIN.speed);
        }
        if (TRAIT_MAX.speed !== undefined) {
          expect(mutated.speed).toBeLessThanOrEqual(TRAIT_MAX.speed);
        }

        if (TRAIT_MIN.visionRange !== undefined) {
          expect(mutated.visionRange).toBeGreaterThanOrEqual(
            TRAIT_MIN.visionRange
          );
        }
        if (TRAIT_MAX.visionRange !== undefined) {
          expect(mutated.visionRange).toBeLessThanOrEqual(TRAIT_MAX.visionRange);
        }

        if (TRAIT_MIN.camouflage !== undefined) {
          expect(mutated.camouflage).toBeGreaterThanOrEqual(TRAIT_MIN.camouflage);
        }
        if (TRAIT_MAX.camouflage !== undefined) {
          expect(mutated.camouflage).toBeLessThanOrEqual(TRAIT_MAX.camouflage);
        }

        if (TRAIT_MIN.consciousnessLevel !== undefined) {
          expect(mutated.consciousnessLevel).toBeGreaterThanOrEqual(
            TRAIT_MIN.consciousnessLevel
          );
        }
        if (TRAIT_MAX.consciousnessLevel !== undefined) {
          expect(mutated.consciousnessLevel).toBeLessThanOrEqual(
            TRAIT_MAX.consciousnessLevel
          );
        }
      }
    });

    it('should produce different traits from parent when mutated multiple times', () => {
      const rng = createRng(999);
      let mutated1 = mutateTraits(DEFAULT_TRAITS, rng);
      let mutated2 = mutateTraits(DEFAULT_TRAITS, rng);
      let mutated3 = mutateTraits(DEFAULT_TRAITS, rng);

      // At least some trait should be different
      const isDifferent =
        mutated1.size !== DEFAULT_TRAITS.size ||
        mutated1.speed !== DEFAULT_TRAITS.speed ||
        mutated2.size !== DEFAULT_TRAITS.size ||
        mutated3.size !== DEFAULT_TRAITS.size;

      expect(isDifferent).toBe(true);
    });

    it('should produce deterministic results with same seed', () => {
      const traits1 = mutateTraits(DEFAULT_TRAITS, createRng(777));
      const traits2 = mutateTraits(DEFAULT_TRAITS, createRng(777));

      expect(traits1).toEqual(traits2);
    });

    it('should produce different results with different seeds', () => {
      const traits1 = mutateTraits(DEFAULT_TRAITS, createRng(111));
      const traits2 = mutateTraits(DEFAULT_TRAITS, createRng(222));

      const isDifferent =
        traits1.size !== traits2.size ||
        traits1.speed !== traits2.speed ||
        traits1.visionRange !== traits2.visionRange;

      expect(isDifferent).toBe(true);
    });

    it('should mutate energyStrategy with approximately 5% probability', () => {
      // Track how many times the strategy changes across mutations
      const rng = createRng(42);
      let current = { ...DEFAULT_TRAITS };
      let strategyChanges = 0;
      let previousStrategy = current.energyStrategy;

      for (let i = 0; i < 1000; i++) {
        current = mutateTraits(current, rng);
        if (current.energyStrategy !== previousStrategy) {
          strategyChanges++;
          previousStrategy = current.energyStrategy;
        }
      }

      // energyStrategy should mutate approximately 5% of the time (50 out of 1000)
      // Allow reasonable variance: expect between 20 and 100 changes (2% to 10%)
      expect(strategyChanges).toBeGreaterThanOrEqual(20);
      expect(strategyChanges).toBeLessThanOrEqual(100);
    });

    it('should not modify the original traits object', () => {
      const original = { ...DEFAULT_TRAITS };
      const rng = createRng(555);
      mutateTraits(original, rng);

      expect(original).toEqual(DEFAULT_TRAITS);
    });
  });

  describe('reproduceCreature', () => {
    it('should create a child creature with correct parentId', () => {
      const parent = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 50,
        y: 50,
        energy: 200,
      });

      const rng = createRng(123);
      const child = reproduceCreature(parent, rng);

      expect(child.parentId).toBe(parent.id);
      expect(child.lineageId).toBe(parent.lineageId);
      expect(child.speciesId).toBe(parent.speciesId);
    });

    it('should create a child with mutated traits', () => {
      const parent = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 50,
        y: 50,
        energy: 200,
      });

      const rng = createRng(456);
      const child = reproduceCreature(parent, rng);

      // Traits should be different (with very high probability)
      const traitsAreDifferent =
        JSON.stringify(child.traits) !== JSON.stringify(parent.traits);
      expect(traitsAreDifferent).toBe(true);
    });

    it('should set child energy to half of parent energy (minimum 50)', () => {
      const parent1 = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 50,
        y: 50,
        energy: 200,
      });

      const rng1 = createRng(111);
      const child1 = reproduceCreature(parent1, rng1);
      expect(child1.energy).toBe(100);

      const parent2 = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 50,
        y: 50,
        energy: 80,
      });

      const rng2 = createRng(222);
      const child2 = reproduceCreature(parent2, rng2);
      expect(child2.energy).toBe(Math.max(50, 80 * 0.5));
    });

    it('should set child age to 0', () => {
      const parent = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 50,
        y: 50,
        energy: 200,
        age: 100,
      });

      const rng = createRng(789);
      const child = reproduceCreature(parent, rng);

      expect(child.age).toBe(0);
    });

    it('should set child position to parent position', () => {
      const parent = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 25,
        y: 75,
        energy: 200,
      });

      const rng = createRng(444);
      const child = reproduceCreature(parent, rng);

      expect(child.x).toBe(parent.x);
      expect(child.y).toBe(parent.y);
    });

    it('should produce deterministic child traits with same seed', () => {
      const parent1 = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 50,
        y: 50,
        energy: 200,
      });

      const parent2 = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 50,
        y: 50,
        energy: 200,
      });

      Creature.resetIdCounter();
      const child1 = reproduceCreature(parent1, createRng(555));

      Creature.resetIdCounter();
      const child2 = reproduceCreature(parent2, createRng(555));

      expect(child1.traits).toEqual(child2.traits);
    });

    it('should set lifecycleState to alive', () => {
      const parent = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 50,
        y: 50,
        energy: 200,
      });

      const rng = createRng(888);
      const child = reproduceCreature(parent, rng);

      expect(child.lifecycleState).toBe('alive');
    });

    it('should generate unique child ids', () => {
      const parent = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 50,
        y: 50,
        energy: 200,
      });

      const rng = createRng(999);
      const child1 = reproduceCreature(parent, rng);
      const child2 = reproduceCreature(parent, rng);

      expect(child1.id).not.toBe(child2.id);
      expect(child1.id).not.toBe(parent.id);
    });
  });

  describe('LineageTree', () => {
    it('should add creatures and retrieve them', () => {
      const tree = new LineageTree();
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 50,
        y: 50,
        energy: 100,
      });

      tree.addCreature(creature, 0);

      expect(tree.getCreature(creature.id)).toEqual(creature);
    });

    it('should get a single creature as a lineage of length 1', () => {
      const tree = new LineageTree();
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 50,
        y: 50,
        energy: 100,
      });

      tree.addCreature(creature, 0);
      const lineage = tree.getLineage(creature.id);

      expect(lineage).toHaveLength(1);
      expect(lineage[0]).toEqual(creature);
    });

    it('should track a 3-generation family lineage correctly', () => {
      const tree = new LineageTree();

      // Generation 1: Ancestor
      const ancestor = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 50,
        y: 50,
        energy: 200,
      });
      tree.addCreature(ancestor, 0);

      // Generation 2: Child
      const rng1 = createRng(100);
      const child = reproduceCreature(ancestor, rng1);
      tree.addCreature(child, 1);

      // Generation 3: Grandchild
      const rng2 = createRng(200);
      const grandchild = reproduceCreature(child, rng2);
      tree.addCreature(grandchild, 2);

      // Check lineage of grandchild
      const lineage = tree.getLineage(grandchild.id);

      expect(lineage).toHaveLength(3);
      expect(lineage[0].id).toBe(ancestor.id);
      expect(lineage[1].id).toBe(child.id);
      expect(lineage[2].id).toBe(grandchild.id);
      expect(lineage[0].parentId).toBeNull();
      expect(lineage[1].parentId).toBe(ancestor.id);
      expect(lineage[2].parentId).toBe(child.id);
    });

    it('should create Species record when adding first member', () => {
      const tree = new LineageTree();
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 50,
        y: 50,
        energy: 100,
      });

      tree.addCreature(creature, 0);

      const species = tree.getSpecies('lineage_1');
      expect(species).toBeDefined();
      expect(species!.id).toBe('lineage_1');
      expect(species!.firstSeenTick).toBe(0);
      expect(species!.lastSeenTick).toBeNull();
    });

    it('should mark species as extinct', () => {
      const tree = new LineageTree();
      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 50,
        y: 50,
        energy: 100,
      });

      tree.addCreature(creature, 0);
      tree.markExtinct('lineage_1', 10);

      const species = tree.getSpecies('lineage_1');
      expect(species!.lastSeenTick).toBe(10);
    });

    it('should get all species members correctly', () => {
      const tree = new LineageTree();

      // Add multiple creatures to same lineage
      const creature1 = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 50,
        y: 50,
        energy: 100,
      });
      tree.addCreature(creature1, 0);

      const creature2 = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: creature1.id,
        traits: DEFAULT_TRAITS,
        x: 50,
        y: 50,
        energy: 100,
      });
      tree.addCreature(creature2, 1);

      const members = tree.getSpeciesMembers('lineage_1');
      expect(members).toHaveLength(2);
      expect(members.map((m) => m.id)).toContain(creature1.id);
      expect(members.map((m) => m.id)).toContain(creature2.id);
    });

    it('should serialize and deserialize correctly', () => {
      const tree = new LineageTree();

      const creature = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 50,
        y: 50,
        energy: 100,
      });
      tree.addCreature(creature, 0);

      const json = tree.toJSON();
      const restored = LineageTree.fromJSON(json);

      expect(restored.getCreature(creature.id)).toBeDefined();
      expect(restored.getSpecies('lineage_1')).toBeDefined();
      expect(restored.getLineage(creature.id)).toHaveLength(1);
    });

    it('should serialize complex multi-generation lineage', () => {
      const tree = new LineageTree();

      // Build 3-generation family
      const ancestor = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 50,
        y: 50,
        energy: 200,
      });
      tree.addCreature(ancestor, 0);

      const child = reproduceCreature(ancestor, createRng(100));
      tree.addCreature(child, 1);

      const grandchild = reproduceCreature(child, createRng(200));
      tree.addCreature(grandchild, 2);

      // Serialize
      const json = tree.toJSON();

      // Deserialize
      const restored = LineageTree.fromJSON(json);

      // Verify structure
      const restoredLineage = restored.getLineage(grandchild.id);
      expect(restoredLineage).toHaveLength(3);
      expect(restoredLineage[0].id).toBe(ancestor.id);
      expect(restoredLineage[1].id).toBe(child.id);
      expect(restoredLineage[2].id).toBe(grandchild.id);
    });

    it('should return empty lineage for non-existent creature', () => {
      const tree = new LineageTree();
      const lineage = tree.getLineage('non_existent');

      expect(lineage).toHaveLength(0);
    });

    it('should get all creatures', () => {
      const tree = new LineageTree();

      const creature1 = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 50,
        y: 50,
        energy: 100,
      });

      const creature2 = new Creature({
        speciesId: 'species_2',
        lineageId: 'lineage_2',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 60,
        y: 60,
        energy: 100,
      });

      tree.addCreature(creature1, 0);
      tree.addCreature(creature2, 1);

      const all = tree.getAllCreatures();
      expect(all).toHaveLength(2);
      expect(all.map((c) => c.id)).toContain(creature1.id);
      expect(all.map((c) => c.id)).toContain(creature2.id);
    });

    it('should get all species', () => {
      const tree = new LineageTree();

      const creature1 = new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 50,
        y: 50,
        energy: 100,
      });

      const creature2 = new Creature({
        speciesId: 'species_2',
        lineageId: 'lineage_2',
        parentId: null,
        traits: DEFAULT_TRAITS,
        x: 60,
        y: 60,
        energy: 100,
      });

      tree.addCreature(creature1, 0);
      tree.addCreature(creature2, 1);

      const all = tree.getAllSpecies();
      expect(all).toHaveLength(2);
      expect(all.map((s) => s.id)).toContain('lineage_1');
      expect(all.map((s) => s.id)).toContain('lineage_2');
    });

    it('should handle fromJSON with invalid data', () => {
      expect(() => LineageTree.fromJSON(null)).toThrow(
        'Invalid LineageTree JSON: expected object'
      );

      expect(() => LineageTree.fromJSON('not an object')).toThrow(
        'Invalid LineageTree JSON: expected object'
      );

      // Should handle empty object gracefully
      const tree = LineageTree.fromJSON({});
      expect(tree.getAllCreatures()).toHaveLength(0);
      expect(tree.getAllSpecies()).toHaveLength(0);
    });
  });
});
