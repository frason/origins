/**
 * Species Definition, Mutations, and Lineage Tracking
 * Implements creature reproduction with genetic drift and family tree tracking
 */

import { Creature } from './creature';
import { RngFn, randChoice } from './rng';
import {
  Traits,
  EnergyStrategy,
  TRAIT_MIN,
  TRAIT_MAX,
} from '../utils/traits';
import {
  DEFAULT_MUTATION_RATE,
  MUTATION_DRIFT,
  REPRODUCTION_ENERGY_COST,
} from '../utils/constants';

/**
 * Species represents a distinct genetic lineage with tracking info
 */
export interface Species {
  id: string;
  name: string;
  ancestorId: string | null; // First ancestor creature id, or null if unknown
  firstSeenTick: number; // Tick when species first appeared
  lastSeenTick: number | null; // Tick when species went extinct, or null if still alive
  traitSnapshot: Traits; // Traits of the ancestor or first observed creature
}

/**
 * Mutate a creature's traits based on mutation rates and RNG.
 * Each birth has one configured chance to mutate a trait. A successful mutation
 * changes one numeric trait by visible drift or selects a new energy strategy.
 * All results are clamped to TRAIT_MIN and TRAIT_MAX.
 *
 * @param traits - parent traits to mutate
 * @param rng - deterministic RNG function
 * @param mutationDrift - proportional size of a successful numeric mutation
 * @param mutationRate - chance that this birth mutates one trait
 * @returns new mutated traits
 */
export function mutateTraits(
  traits: Traits,
  rng: RngFn,
  mutationDrift: number = MUTATION_DRIFT,
  mutationRate: number = DEFAULT_MUTATION_RATE
): Traits {
  const mutated: Traits = { ...traits };

  // List of numeric trait names (excluding energyStrategy)
  const numericTraits = [
    'size',
    'speed',
    'visionRange',
    'hearingRange',
    'camouflage',
    'armor',
    'boneDensity',
    'metabolism',
    'reproductionRate',
    'brainSize',
    'consciousnessLevel',
    'communication',
    'collectiveConnection',
  ] as const;

  if (rng() >= mutationRate) return mutated;

  const mutationTargets: Array<(typeof numericTraits)[number] | 'energyStrategy'> = [
    ...numericTraits,
    // Ecological strategy exploration was too rare across otherwise healthy fixed-seed runs.
    // Three slots keep numeric drift dominant while making niche shifts reliably observable.
    'energyStrategy',
    'energyStrategy',
    'energyStrategy',
  ];
  const target = randChoice(rng, mutationTargets);

  if (target === 'energyStrategy') {
    const strategies: EnergyStrategy[] = [
      'herbivore',
      'carnivore',
      'omnivore',
      'scavenger',
    ].filter((strategy) => strategy !== traits.energyStrategy) as EnergyStrategy[];
    mutated.energyStrategy = randChoice(rng, strategies);
  } else {
    const currentValue = traits[target];
    const min = TRAIT_MIN[target] ?? 0;
    const max = TRAIT_MAX[target] ?? Math.max(1, Math.abs(currentValue) * 2);
    const scale = currentValue === 0 ? (max - min) * 0.1 : Math.abs(currentValue);
    const driftAmount = mutationDrift * scale;
    const directionDraw = rng();
    const sign = directionDraw < 0.5 ? -1 : 1;
    mutated[target] = Math.max(min, Math.min(max, currentValue + sign * driftAmount));

    // Habitat adaptations co-evolve with related physical traits without
    // disturbing the simulation's established seeded mutation sequence.
    const adaptationFor = {
      armor: 'thermalTolerance',
      metabolism: 'waterRetention',
      speed: 'aquaticAffinity',
      boneDensity: 'terrainGrip',
    } as const;
    const adaptation = adaptationFor[target as keyof typeof adaptationFor];
    if (adaptation && mutated[target] !== currentValue) {
      const currentAdaptation = traits[adaptation];
      const adaptationDrift = mutationDrift * (currentAdaptation === 0 ? 0.1 : currentAdaptation);
      mutated[adaptation] = Math.max(0, Math.min(1, currentAdaptation + (currentAdaptation === 0 ? 1 : sign) * adaptationDrift));
    }
  }

  return mutated;
}

/**
 * Reproduce a creature, creating an offspring with mutated traits.
 * The child inherits:
 * - parentId: parent's id
 * - lineageId: parent's lineageId (maintains lineage)
 * - speciesId: parent's speciesId
 * - Mutated traits from mutateTraits()
 * - Initial energy: exactly the energy invested by the parent
 * - Position: same as parent (offspring starts at parent location)
 * - Age: 0
 *
 * @param parent - the parent creature
 * @param rng - deterministic RNG function
 * @param offspringEnergy - energy already paid by the parent for this child
 * @returns new offspring creature
 */
export function reproduceCreature(
  parent: Creature,
  rng: RngFn,
  mutationDrift: number = MUTATION_DRIFT,
  mutationRate: number = DEFAULT_MUTATION_RATE,
  offspringEnergy: number = REPRODUCTION_ENERGY_COST
): Creature {
  const mutatedTraits = mutateTraits(parent.traits, rng, mutationDrift, mutationRate);

  // A mutation creates a visible branch in the family tree.
  const energyStrategyChanged = mutatedTraits.energyStrategy !== parent.traits.energyStrategy;
  const numericKeys = (Object.keys(mutatedTraits) as (keyof Traits)[]).filter(
    (k) => k !== 'energyStrategy'
  ) as Exclude<keyof Traits, 'energyStrategy'>[];
  const significantDrift = numericKeys.some(
    (trait) => mutatedTraits[trait] !== parent.traits[trait]
  );
  // Derive branch IDs from the seeded RNG so same-seed runs stay identical
  const childLineageId =
    energyStrategyChanged || significantDrift
      ? `lineage_${Math.floor(rng() * 0xffffffff)
          .toString(16)
          .padStart(8, '0')}_${Math.floor(rng() * 0xffffffff)
          .toString(16)
          .padStart(8, '0')}`
      : parent.lineageId;

  return new Creature({
    speciesId: parent.speciesId,
    lineageId: childLineageId,
    parentId: parent.id,
    traits: mutatedTraits,
    x: parent.x,
    y: parent.y,
    energy: Math.max(0, offspringEnergy),
    age: 0,
    lifecycleState: 'alive',
    corpseDecayTicks: 0,
  });
}

/**
 * LineageTree tracks all creatures and their family relationships.
 * Supports querying lineage (ancestor chain) and tracking species extinction.
 */
export class LineageTree {
  private creatures: Map<string, Creature> = new Map();
  private species: Map<string, Species> = new Map();
  private speciesMembers: Map<string, Set<string>> = new Map(); // speciesId -> set of creatureIds

  /**
   * Add a creature to the lineage tree.
   * If this creature introduces a new species (by lineageId), create a Species record.
   *
   * @param creature - the creature to add
   * @param tick - current simulation tick
   */
  addCreature(creature: Creature, tick: number): void {
    this.creatures.set(creature.id, creature);

    // Track species membership
    if (!this.speciesMembers.has(creature.lineageId)) {
      this.speciesMembers.set(creature.lineageId, new Set());
    }
    this.speciesMembers.get(creature.lineageId)!.add(creature.id);

    // Create or update Species record
    if (!this.species.has(creature.lineageId)) {
      this.species.set(creature.lineageId, {
        id: creature.lineageId,
        name: `Species_${creature.lineageId.slice(0, 8)}`, // Auto-name based on ID
        ancestorId: creature.parentId, // First known ancestor
        firstSeenTick: tick,
        lastSeenTick: null,
        traitSnapshot: { ...creature.traits },
      });
    } else {
      // Update lastSeenTick to keep it current
      const species = this.species.get(creature.lineageId)!;
      species.lastSeenTick = null; // Still alive
    }
  }

  /**
   * Mark a species as extinct at a given tick.
   *
   * @param speciesId - the species id (lineageId) to mark extinct
   * @param tick - tick when extinction occurred
   */
  markExtinct(speciesId: string, tick: number): void {
    const species = this.species.get(speciesId);
    if (species) {
      species.lastSeenTick = tick;
    }
  }

  /**
   * Get the complete ancestor chain for a creature (including itself).
   * Walks backward through parent relationships until reaching a root.
   *
   * @param creatureId - the creature id to trace
   * @returns array of creatures from root ancestor to target creature
   */
  getLineage(creatureId: string): Creature[] {
    const lineage: Creature[] = [];
    let currentId: string | null = creatureId;

    while (currentId !== null) {
      const creature = this.creatures.get(currentId);
      if (!creature) {
        break; // Stop if we can't find the creature
      }

      lineage.unshift(creature); // Prepend to build root-to-target order
      currentId = creature.parentId;
    }

    return lineage;
  }

  /**
   * Get all creatures in the tree.
   */
  getAllCreatures(): Creature[] {
    return Array.from(this.creatures.values());
  }

  /**
   * Get all species records.
   */
  getAllSpecies(): Species[] {
    return Array.from(this.species.values());
  }

  /**
   * Get a specific creature by id.
   */
  getCreature(creatureId: string): Creature | undefined {
    return this.creatures.get(creatureId);
  }

  /**
   * Get a specific species record by id.
   */
  getSpecies(speciesId: string): Species | undefined {
    return this.species.get(speciesId);
  }

  /**
   * Get all creatures belonging to a species.
   */
  getSpeciesMembers(speciesId: string): Creature[] {
    const memberIds = this.speciesMembers.get(speciesId);
    if (!memberIds) {
      return [];
    }
    return Array.from(memberIds)
      .map((id) => this.creatures.get(id)!)
      .filter((c) => c !== undefined);
  }

  /**
   * Serialize the LineageTree to a JSON-compatible object.
   */
  toJSON(): object {
    return {
      creatures: Array.from(this.creatures.values()).map((c) => c.toJSON()),
      species: Array.from(this.species.values()),
      speciesMembers: Array.from(this.speciesMembers.entries()).map(
        ([speciesId, memberIds]) => ({
          speciesId,
          memberIds: Array.from(memberIds),
        })
      ),
    };
  }

  /**
   * Reconstruct a LineageTree from a JSON snapshot.
   * The snapshot should have been created by toJSON().
   *
   * @param data - JSON object containing lineage tree state
   * @returns reconstructed LineageTree instance
   * @throws if data format is invalid
   */
  static fromJSON(data: any): LineageTree {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid LineageTree JSON: expected object');
    }

    const tree = new LineageTree();

    // Restore creatures
    if (Array.isArray(data.creatures)) {
      for (const creatureData of data.creatures) {
        const creature = Creature.fromJSON(creatureData);
        tree.creatures.set(creature.id, creature);
      }
    }

    // Restore species
    if (Array.isArray(data.species)) {
      for (const speciesData of data.species) {
        if (speciesData.id && typeof speciesData.id === 'string') {
          tree.species.set(speciesData.id, speciesData);
        }
      }
    }

    // Restore species members
    if (Array.isArray(data.speciesMembers)) {
      for (const entry of data.speciesMembers) {
        if (
          entry.speciesId &&
          Array.isArray(entry.memberIds)
        ) {
          tree.speciesMembers.set(
            entry.speciesId,
            new Set(entry.memberIds)
          );
        }
      }
    }

    return tree;
  }
}
