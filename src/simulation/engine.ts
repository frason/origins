import { computeSolarEnergyGrid, World } from './world';
import { Creature } from './creature';
import { CreatureSpatialIndex } from './creatureSpatialIndex';
import { createRng, RngFn, StreamedRng, RNG_STREAMS } from './rng';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  SIMULATION_CONSTANTS,
  SimulationConstants,
} from '../utils/constants';
import { growProducers } from './producer';
import { reproduceCreature } from './species';
import {
  introducedSpeciesId,
  lineageDisplayName,
  speciesDisplayName,
} from './speciesNames';
import type { EnergyStrategy } from '../utils/traits';
import { buildFounderTraits, type FounderTraitOverrides } from './founderTraits';
import {
  appendEcosystemHistory,
  BASE_HISTORY_INTERVAL,
  createEcosystemHistorySample,
  type EcosystemHistorySample,
} from './ecosystemHistory';
import { compareConstants, compareTraits, type DeathCause, type SimEvent } from './events';
import {
  getLocalMiasmaMutationPressure,
  getMiasmaAdjustedMutationRate,
  getToxinAdjustedReproductionThreshold,
} from './toxicity';
import {
  buildSpeciesLifespanEvidence,
  getAdaptiveReproductionTiming,
} from './adaptiveReproduction';
import {
  decideTick,
  applyMovement,
  applyMovementWithScan,
  DecisionType,
  computeMovementTarget,
  VisionScan,
} from './creature';
import {
  DecisionIntent,
  createDecisionIntent,
  tieBreakCreatureOrder,
  type DecisionMetrics,
} from './decisionIntent';
import {
  feedOnProducer,
  feedOnCreature,
  feedOnCorpse,
  applyMetabolism,
  canReproduce,
  payReproductionCost,
  getEnergyCapacity,
} from './energy';
import {
  checkAgeAndStarvation,
  recycleNutrients,
  dissipateToxicity,
  aggregateCorpseBiomass,
  calculateDecomposerActivity,
  processDecomposition,
  applyCorpseToxicity,
  decrementCorpseDecayTimers,
  syncCreatureEnergyWithDecomposition,
} from './decomposition';
import { applyEnvironmentalStress } from './biomeStress';
import { buildLocalResourcePressureCache } from './localResourcePressure';
import {
  applyReproductionPressure,
  getReproductionPressureMultiplier,
} from './reproductionPressure';
import { findDispersalTarget, shouldEvaluateDispersal } from './dispersal';
import {
  establishableCandidates,
  createIncipientSpecies,
  livingCandidateIds,
  type IncipientSpecies,
  type SpeciesProfile,
} from './speciation';
import {
  createSoundEvent,
  detectActiveSounds,
  shouldStalk,
  getStalkingSpeedMultiplier,
  getStalkingEnergyCostMultiplier,
  SOUND_PERSISTENCE_TICKS,
  type SoundEvent,
  type DetectedSound,
} from './soundEcology';
import {
  AdaptationMetricsTracker,
  type AdaptationObservation,
} from './adaptationMetrics';
import { compactEvents } from './eventCompaction';
import { CHECKPOINT_INTERVAL } from './checkpointTimeline';

export type {
  ConstantChange,
  EcosystemCheckpoint,
  SimEvent,
  SimEventType,
  TraitChange,
} from './events';

function ecosystemCheckpoint(world: World, creatures: Creature[]) {
  const living = creatures.filter((creature) => creature.lifecycleState === 'alive');
  let producerBiomass = 0;
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      producerBiomass += world.getCell(x, y).producerBiomass;
    }
  }
  return {
    population: living.length,
    speciesCount: new Set(living.map((creature) => creature.speciesId)).size,
    lineageCount: new Set(living.map((creature) => creature.lineageId)).size,
    livingEnergy: living.reduce((total, creature) => total + creature.energy, 0),
    producerBiomass,
  };
}

/** Require a nearby food source before converting stored energy into offspring. */
export function hasLocalReproductiveResources(
  creature: Creature,
  world: World,
  spatialIndex: CreatureSpatialIndex,
  supportedEnergy: number = Infinity
): boolean {
  const strategy = creature.traits.energyStrategy;
  const cellHasProducers = world.getCell(creature.x, creature.y).producerBiomass >= 5;
  // querySquare returns bucket candidates, a superset of the requested square,
  // so the Chebyshev bound still has to be applied here.
  const nearby = spatialIndex.querySquare(creature.x, creature.y, 1).filter(
    (other) => other.id !== creature.id
      && Math.max(Math.abs(other.x - creature.x), Math.abs(other.y - creature.y)) <= 1
  );
  const hasPrey = nearby.some((other) =>
    other.lifecycleState === 'alive'
    && (other.traits.energyStrategy === 'herbivore'
      || other.traits.energyStrategy === 'omnivore'
      || other.traits.energyStrategy === 'scavenger')
  );
  const hasCorpse = nearby.some((other) =>
    other.lifecycleState === 'dead' || other.lifecycleState === 'corpse'
  );
  const hasGeneratedCorpse = nearby.some((other) =>
    (other.lifecycleState === 'dead' || other.lifecycleState === 'corpse') &&
    !other.lineageId.endsWith('_starter_carrion')
  );
  const recentlyFed = creature.energy >= supportedEnergy;
  if (strategy === 'herbivore') return cellHasProducers || recentlyFed;
  if (strategy === 'carnivore') return hasPrey || recentlyFed;
  if (strategy === 'scavenger') return hasGeneratedCorpse || recentlyFed;
  return cellHasProducers || hasPrey || hasCorpse || recentlyFed;
}

/**
 * Complete engine state snapshot
 * Contains world, creatures, tick counter, seed, and event log
 */
export interface EngineState {
  world: World;
  creatures: Creature[];
  /** Next value for the per-world creature ID allocator. */
  creatureIdCounter: number;
  tick: number;
  seed: number;
  events: SimEvent[];
  constants: SimulationConstants;
  history: EcosystemHistorySample[];
  historyInterval: number;
  speciesProfiles: SpeciesProfile[];
  incipientSpecies: IncipientSpecies[];
  /** Active sound events from creature actions this and recent ticks */
  activeSounds: SoundEvent[];
  /** Sound event counter for deterministic ID generation */
  soundEventCounter: number;
  /** Tracks trait frequencies and adaptation evidence across lineages */
  adaptationMetrics: AdaptationMetricsTracker;
  /** Recent adaptation observations from the current tick */
  lastAdaptationObservations: AdaptationObservation[];
}

export interface SpeciesIntroduction {
  state: EngineState;
  speciesId: string;
  creatureIds: string[];
}

const INTRODUCTION_ENERGY: Record<EnergyStrategy, number> = {
  herbivore: 140,
  carnivore: 180,
  omnivore: 160,
  scavenger: 120,
};

/** Add a founder group without consuming RNG, keeping intervention replay exact. */
export function introduceSpecies(
  state: EngineState,
  strategy: EnergyStrategy,
  origin: { x: number; y: number },
  requestedName?: string,
  traitOverrides: FounderTraitOverrides = {}
): SpeciesIntroduction {
  // Creature currently owns the allocator implementation, but its position is
  // world state. Restore it before creating founders so parallel/replayed
  // worlds cannot affect one another.
  Creature.setIdCounter(state.creatureIdCounter);
  if (
    !Number.isInteger(origin.x) || !Number.isInteger(origin.y) ||
    origin.x < 0 || origin.x >= state.world.width ||
    origin.y < 0 || origin.y >= state.world.height
  ) {
    throw new RangeError('Choose a tile inside the world');
  }
  const originCell = state.world.getCell(origin.x, origin.y);
  if (originCell.biome === 'ocean' || originCell.biome === 'mountain') {
    throw new Error('Choose a habitable land tile');
  }

  const occupied = new Set(
    state.creatures
      .filter((creature) => creature.lifecycleState === 'alive')
      .map((creature) => `${creature.x},${creature.y}`)
  );
  const candidates: { x: number; y: number }[] = [];
  for (let y = 0; y < state.world.height; y++) {
    for (let x = 0; x < state.world.width; x++) {
      const cell = state.world.getCell(x, y);
      if (
        cell.biome !== 'ocean' && cell.biome !== 'mountain' &&
        !occupied.has(`${x},${y}`)
      ) {
        candidates.push({ x, y });
      }
    }
  }
  candidates.sort((a, b) => {
    const aDistance = (a.x - origin.x) ** 2 + (a.y - origin.y) ** 2;
    const bDistance = (b.x - origin.x) ** 2 + (b.y - origin.y) ** 2;
    return aDistance - bDistance || a.y - b.y || a.x - b.x;
  });
  if (candidates.length < 3) throw new Error('Not enough open habitat for a founder group');

  const introductionNumber = state.events.filter(
    (event) => event.interventionKind === 'species-introduction'
  ).length + 1;
  const speciesId = requestedName === undefined
    ? `introduced_${strategy}_${introductionNumber}`
    : introducedSpeciesId(strategy, introductionNumber, requestedName);
  const founderTraits = buildFounderTraits(strategy, traitOverrides);
  const founders = candidates.slice(0, 3).map((position, index) => {
    const creature = new Creature({
      speciesId,
      lineageId: speciesId,
      parentId: null,
      traits: { ...founderTraits },
      ...position,
      energy: INTRODUCTION_ENERGY[strategy],
    });
    creature.id = `${speciesId}_founder_${index + 1}`;
    return creature;
  });
  const event: SimEvent = {
    type: 'intervention',
    tick: state.tick,
    speciesId,
    interventionKind: 'species-introduction',
    interventionOrigin: { ...origin },
    introducedStrategy: strategy,
    introducedTraits: { ...founderTraits },
    founderCount: founders.length,
    ecosystemBefore: ecosystemCheckpoint(state.world, state.creatures),
    detail: `Introduced ${speciesDisplayName(speciesId)} (${strategy}) with 3 founders`,
  };
  const nextState = {
    ...state,
    creatures: [...state.creatures, ...founders],
    creatureIdCounter: Creature.getIdCounter(),
    events: [...state.events, event],
    speciesProfiles: state.speciesProfiles.some((profile) => profile.id === speciesId)
      ? state.speciesProfiles
      : [...state.speciesProfiles, {
          id: speciesId,
          ancestorSpeciesId: null,
          founderTraits: { ...founders[0].traits },
          establishedTick: state.tick,
        }],
    history:
      state.history[state.history.length - 1]?.tick === state.tick
        ? [
            ...state.history.slice(0, -1),
            createEcosystemHistorySample(
              state.tick,
              [...state.creatures, ...founders],
              [...state.events, event],
              state.world
            ),
          ]
        : state.history,
  };
  return {
    state: nextState,
    speciesId,
    creatureIds: founders.map((creature) => creature.id),
  };
}

/**
 * Create a new engine state with initial creatures
 * Initializes world, seeds RNG, and prepares simulation state
 *
 * @param seed - deterministic RNG seed for reproducibility
 * @param initialCreatures - array of creatures to start with
 * @param worldWidth - optional world width (default: WORLD_WIDTH)
 * @param worldHeight - optional world height (default: WORLD_HEIGHT)
 * @returns initial EngineState ready for simulation
 */
export function createEngine(
  seed: number,
  initialCreatures: Creature[],
  worldWidth: number = WORLD_WIDTH,
  worldHeight: number = WORLD_HEIGHT,
  constantOverrides: Partial<SimulationConstants> = {}
): EngineState {
  // Create constants with proper world dimensions
  const constants = {
    ...SIMULATION_CONSTANTS,
    ...constantOverrides,
    worldWidth,
    worldHeight,
  };

  const world = new World(worldWidth, worldHeight, constants, seed);

  // Deep copy initial creatures
  const creatures = initialCreatures.map(
    (c) =>
      new Creature({
        speciesId: c.speciesId,
        lineageId: c.lineageId,
        parentId: c.parentId,
        traits: { ...c.traits },
        x: c.x,
        y: c.y,
        energy: c.energy,
        age: c.age ?? 0,
        lifecycleState: c.lifecycleState ?? 'alive',
        corpseDecayTicks: c.corpseDecayTicks ?? 0,
        lastReproductionAge: c.lastReproductionAge,
        generation: c.generation,
        incipientSpeciesId: c.incipientSpeciesId,
        offspringCount: c.offspringCount,
        toxinExposure: c.toxinExposure,
        localResourcePressure: c.localResourcePressure,
        reproductionPressureMultiplier: c.reproductionPressureMultiplier,
        dispersalTargetX: c.dispersalTargetX,
        dispersalTargetY: c.dispersalTargetY,
        lastDispersalTick: c.lastDispersalTick,
        dispersalMoves: c.dispersalMoves,
      })
  );

  const speciesProfiles: SpeciesProfile[] = [];
  for (const creature of creatures) {
    if (speciesProfiles.some((profile) => profile.id === creature.speciesId)) continue;
    speciesProfiles.push({
      id: creature.speciesId,
      ancestorSpeciesId: null,
      founderTraits: { ...creature.traits },
      establishedTick: 0,
    });
  }

  return {
    world,
    creatures,
    creatureIdCounter: Creature.getIdCounter(),
    tick: 0,
    seed,
    events: [],
    constants,
    history: [createEcosystemHistorySample(0, creatures, [], world)],
    historyInterval: BASE_HISTORY_INTERVAL,
    speciesProfiles,
    incipientSpecies: [],
    activeSounds: [],
    soundEventCounter: 0,
    adaptationMetrics: new AdaptationMetricsTracker(),
    lastAdaptationObservations: [],
  };
}

/**
 * Execute one simulation tick
 * Applies all 10 simulation steps in sequence, returning a new immutable state
 *
 * Steps:
 * 1. Energy Generation (already done via solar grid initialization)
 * 2. Producer Growth
 * 3. Creature Decisions
 * 4. Movement
 * 5. Feeding
 * 6. Energy Updates (Metabolism)
 * 7. Reproduction
 * 8. Death (Age and Starvation)
 * 9. Decomposition
 * 10. Nutrient Recycling
 * 11. Event Generation
 *
 * @param state - current engine state (unchanged)
 * @returns new engine state after one tick (immutable)
 */
export function tickEngine(
  state: EngineState,
  constantOverrides: Partial<SimulationConstants> = {}
): EngineState {
  // Keep allocation deterministic per engine state rather than per JS process.
  // This must happen before cloning because Creature construction consumes IDs.
  Creature.setIdCounter(state.creatureIdCounter);
  const constants: SimulationConstants = {
    ...SIMULATION_CONSTANTS,
    ...state.constants,
    ...constantOverrides,
    worldWidth: state.world.width,
    worldHeight: state.world.height,
  };
  // Deep copy world state from JSON
  const newWorld = World.fromJSON(state.world.toJSON());
  applyLiveSolarConstants(newWorld, state.constants, constants);

  // Deep copy creatures
  const creatures: Creature[] = state.creatures.map(
    (c) =>
      new Creature({
        speciesId: c.speciesId,
        lineageId: c.lineageId,
        parentId: c.parentId,
        traits: { ...c.traits },
        x: c.x,
        y: c.y,
        energy: c.energy,
        age: c.age,
        lifecycleState: c.lifecycleState,
        corpseDecayTicks: c.corpseDecayTicks,
        lastReproductionAge: c.lastReproductionAge,
        generation: c.generation,
        incipientSpeciesId: c.incipientSpeciesId,
        offspringCount: c.offspringCount,
        toxinExposure: c.toxinExposure,
        localResourcePressure: c.localResourcePressure,
        reproductionPressureMultiplier: c.reproductionPressureMultiplier,
        dispersalTargetX: c.dispersalTargetX,
        dispersalTargetY: c.dispersalTargetY,
        lastDispersalTick: c.lastDispersalTick,
        dispersalMoves: c.dispersalMoves,
      })
  );

  // Restore original creature IDs
  for (let i = 0; i < creatures.length; i++) {
    creatures[i].id = state.creatures[i].id;
  }

  const newEvents: SimEvent[] = [];
  const speciesProfiles = state.speciesProfiles.map((profile) => ({
    ...profile,
    founderTraits: { ...profile.founderTraits },
  }));
  let incipientSpecies = state.incipientSpecies.map((candidate) => ({
    ...candidate,
    founderTraits: { ...candidate.founderTraits },
  }));
  const constantChanges = compareConstants(state.constants, constants);
  if (constantChanges.length > 0) {
    newEvents.push({
      type: 'intervention',
      tick: state.tick,
      interventionKind: 'settings-change',
      detail: `God Mode changed ${constantChanges.length} ${constantChanges.length === 1 ? 'setting' : 'settings'}`,
      constantChanges,
      ecosystemBefore: ecosystemCheckpoint(state.world, state.creatures),
    });
  }

  // Capture every creature alive at the start of the tick. Feeding can kill
  // prey before the metabolism/death phase, so this snapshot must come first.
  const aliveBeforeDeath = new Set<string>(
    creatures.filter((c) => c.lifecycleState === 'alive').map((c) => c.id)
  );
  const deathCauses = new Map<string, DeathCause>();

  // Create deterministic named RNG streams from seed and tick
  const rngStreams = new StreamedRng(state.seed ^ state.tick, state.tick);

  // Extract named streams for different subsystems
  const mutationStream = rngStreams.getStream(RNG_STREAMS.MUTATION);
  const biodiversityStream = rngStreams.getStream(RNG_STREAMS.BIODIVERSITY_PRESSURE);

  // Initialize sound event tracking
  let soundEventCounter = state.soundEventCounter;
  const newSounds: SoundEvent[] = [];

  // Step 2: Producer Growth
  growProducers(newWorld, 'solar', constants.producerGrowthRate, true, true);

  // Step 3 & 4: Creature Decisions and Movement
  // Refactored to use single perception pass per creature decision + DecisionIntent pattern
  const decisions = new Map<string, DecisionType>();
  const perceptionScans = new Map<string, VisionScan>();
  let perceptionScanCount = 0;
  const decisionIntents: DecisionIntent[] = [];

  const creatureIndex = new CreatureSpatialIndex(creatures);
  const localPressure = buildLocalResourcePressureCache(
    state.tick,
    creatures,
    newWorld,
    constants.localResourcePressureRadius,
    creatureIndex
  );
  const dispersalPolicy = {
    pressureStart: constants.dispersalPressureStart,
    evaluationIntervalTicks: constants.dispersalEvaluationIntervalTicks,
    range: constants.dispersalRange,
    pressureRadius: constants.localResourcePressureRadius,
    minimumPressureImprovement: constants.dispersalMinimumPressureImprovement,
  };
  let dispersalMoves = 0;
  let dispersalEnergySpent = 0;
  let dispersalBiomeTransitions = 0;

  // Phase 1: Generate DecisionIntents with deterministic tie-breaking order
  // Sort creatures by tie-breaking order before decision phase
  const aliveCreatures = creatures.filter(c => c.lifecycleState === 'alive');
  const sortedCreatures = [...aliveCreatures].sort(tieBreakCreatureOrder);

  for (const creature of sortedCreatures) {
    const pressure = localPressure.get(creature.id);
    creature.localResourcePressure = pressure?.pressure ?? 0;
    if (
      pressure &&
      shouldEvaluateDispersal(creature, state.tick, pressure.pressure, dispersalPolicy)
    ) {
      const target = findDispersalTarget(
        creature,
        newWorld,
        creatureIndex,
        pressure,
        dispersalPolicy
      );
      if (target) {
        creature.dispersalTargetX = target.x;
        creature.dispersalTargetY = target.y;
        creature.lastDispersalTick = state.tick;
      }
    }
    // Get entity-level movement stream for stable per-creature randomness
    const entityMovementStream = rngStreams.getEntityStream(RNG_STREAMS.MOVEMENT, creature.id);
    // Single perception pass: decideTick now returns both decision and scan
    const { decision: baseDecision, scan } = decideTick(
      creature,
      newWorld,
      creatures,
      entityMovementStream.fn,
      creatureIndex,
      constants.reproductionEnergyThreshold * 0.8,
      constants.predationHungerThresholdShare
    );
    perceptionScanCount++;
    perceptionScans.set(creature.id, scan);

    let decision = baseDecision;
    const hasDispersalTarget =
      creature.dispersalTargetX !== null && creature.dispersalTargetY !== null;
    if (hasDispersalTarget && decision !== 'flee') decision = 'disperse';
    decisions.set(creature.id, decision);

    // Create DecisionIntent bundling perception data with decision
    const intent = createDecisionIntent(creature, decision, scan, newWorld, creatures);
    decisionIntents.push(intent);
  }

  // Phase 2: Execute DecisionIntents in tie-breaking order (already sorted above)
  for (const intent of decisionIntents) {
    const creature = creatures.find(c => c.id === intent.creatureId)!;
    if (creature.lifecycleState === 'alive') {
      const previousX = creature.x;
      const previousY = creature.y;
      const previousBiome = newWorld.getCell(previousX, previousY).biome;

      const hasDispersalTarget =
        creature.dispersalTargetX !== null && creature.dispersalTargetY !== null;

      // Use pre-computed scan from DecisionIntent (no rescanning)
      applyMovementWithScan(
        creature,
        intent.decision,
        intent.scan,
        newWorld,
        creatures,
        creatureIndex,
        hasDispersalTarget
          ? { x: creature.dispersalTargetX!, y: creature.dispersalTargetY! }
          : undefined
      );

      if (intent.decision === 'disperse') {
        const distance = Math.max(
          Math.abs(creature.x - previousX),
          Math.abs(creature.y - previousY)
        );
        const energyCost = distance * Math.max(0, constants.dispersalEnergyCostPerCell);
        creature.energy = Math.max(0, creature.energy - energyCost);
        dispersalEnergySpent += energyCost;
        if (distance > 0) {
          creature.dispersalMoves++;
          dispersalMoves++;
          if (newWorld.getCell(creature.x, creature.y).biome !== previousBiome) {
            dispersalBiomeTransitions++;
          }
        }
        if (
          creature.x === creature.dispersalTargetX &&
          creature.y === creature.dispersalTargetY
        ) {
          creature.dispersalTargetX = null;
          creature.dispersalTargetY = null;
        }
        if (creature.energy <= 0) {
          creature.lifecycleState = 'dead';
          deathCauses.set(creature.id, 'dispersal-exhaustion');
        }
      }
    }
  }

  // DecisionIntent metrics: Track perception efficiency
  // Performance improvement: single scan per decision eliminates redundant perception passes
  const decisionMetrics: DecisionMetrics = {
    totalCreatures: aliveCreatures.length,
    perceptionScans: perceptionScanCount,
    intentGenerationTime: 0, // Timing would be measured separately in performance tests
    executionTime: 0,
  };

  // Step 5: Feeding
  for (const creature of creatures) {
    if (creature.lifecycleState === 'alive') {
      const cell = newWorld.getCell(creature.x, creature.y);

      // Herbivores and omnivores feed on producer biomass
      if (
        (creature.traits.energyStrategy === 'herbivore' ||
          creature.traits.energyStrategy === 'omnivore') &&
        cell.producerBiomass > 0
      ) {
        feedOnProducer(
          creature,
          cell,
          newWorld,
          creature.x,
          creature.y,
          constants.feedingEfficiency,
          true
        );
      }

      // Carnivores and omnivores feed on other creatures
      if (
        (
          creature.traits.energyStrategy === 'carnivore' ||
          creature.traits.energyStrategy === 'omnivore'
        ) &&
        creature.energy / getEnergyCapacity(creature)
          < Math.max(0, Math.min(1, constants.predationHungerThresholdShare))
      ) {
        for (const prey of creatureIndex.at(creature.x, creature.y)) {
          if (
            prey.id !== creature.id &&
            prey.lifecycleState === 'alive' &&
            prey.x === creature.x &&
            prey.y === creature.y
          ) {
            feedOnCreature(creature, prey, constants.feedingEfficiency);
            deathCauses.set(prey.id, 'predation');
            break; // Only eat one prey per tick
          }
        }
      }

      // Omnivores and dedicated scavengers consume corpses on their tile.
      if (
        creature.traits.energyStrategy === 'omnivore' ||
        creature.traits.energyStrategy === 'scavenger'
      ) {
        const corpse = creatureIndex.at(creature.x, creature.y).find(
          (candidate) =>
            candidate.lifecycleState !== 'alive' &&
            candidate.corpseDecayTicks > 0 &&
            candidate.energy > 0 &&
            candidate.x === creature.x &&
            candidate.y === creature.y
        );
        if (corpse) {
          feedOnCorpse(
            creature,
            corpse,
            constants.feedingEfficiency,
            constants.scavengingRate
          );
        }
      }
    }
  }

  // Keep malformed inputs or extreme God Mode settings from propagating
  // unbounded/invalid values into rendering and reproduction.
  for (const creature of creatures) {
    if (creature.lifecycleState !== 'alive') continue;
    const capacity = getEnergyCapacity(creature);
    creature.energy = Number.isFinite(creature.energy)
      ? Math.max(0, Math.min(capacity, creature.energy))
      : 0;
  }

  // Step 6: Energy Updates (Metabolism)
  for (const creature of creatures) {
    if (creature.lifecycleState === 'alive') {
      applyMetabolism(creature, constants.baseMetabolism);
      if (creature.energy <= 0) {
        deathCauses.set(creature.id, 'starvation');
        continue;
      }
      const stress = applyEnvironmentalStress(creature, newWorld);
      if (creature.energy <= 0 && stress.totalCost > 0) {
        deathCauses.set(creature.id, 'environmental-stress');
      }
    }
  }

  // Step 7: Reproduction (with mutation and lineage branching via species.ts)
  const offspring: Creature[] = [];
  const livingBeforeBirths = creatures.filter((creature) => creature.lifecycleState === 'alive');
  const birthPressure = getPopulationPressure(livingBeforeBirths, constants);
  const lifespanEvidence = buildSpeciesLifespanEvidence(state.events);
  let birthSlots = Math.max(0, constants.maxGlobalPopulation - livingBeforeBirths.length);
  let restrainedCandidates = 0;
  let pressureTotal = 0;
  let pressureCount = 0;
  let maximumPressure = 0;
  for (const creature of creatures) {
    if (creature.lifecycleState !== 'alive') continue;
    const pressure = localPressure.get(creature.id)?.pressure ?? 0;
    const pressurePolicy = {
      pressureStart: constants.reproductionPressureStart,
      maximumMultiplier: constants.reproductionPressureMaxMultiplier,
    };
    const pressureMultiplier = getReproductionPressureMultiplier(pressure, pressurePolicy);
    creature.localResourcePressure = pressure;
    creature.reproductionPressureMultiplier = pressureMultiplier;
    pressureTotal += pressure;
    pressureCount++;
    maximumPressure = Math.max(maximumPressure, pressure);
    const timing = getAdaptiveReproductionTiming(
      creature.speciesId,
      creature.age,
      state.events,
      constants,
      lifespanEvidence,
      creature.energy / getEnergyCapacity(creature)
    );
    const dominantReproductionSuppressed =
      birthPressure.isMonopoly &&
      birthPressure.dominantCount >= constants.monocultureReproductionLimit &&
      creature.speciesId === birthPressure.dominantSpecies;
    const firstBirthUrgency = creature.offspringCount === 0 && timing.urgency > 0;
    const baseThreshold = getToxinAdjustedReproductionThreshold(
      timing.energyThreshold,
      creature.toxinExposure
    );
    const adjustedThreshold = applyReproductionPressure(
      baseThreshold,
      pressure,
      pressurePolicy
    );
    const resourceThreshold = firstBirthUrgency
      ? Infinity
      : timing.energyThreshold
        + constants.reproductionEnergyCost * 0.25 * (1 - timing.urgency);
    const hasResources = hasLocalReproductiveResources(
      creature,
      newWorld,
      creatureIndex,
      resourceThreshold
    );
    const baseEligible = canReproduce(
      creature,
      baseThreshold,
      timing.maturityAge,
      constants.reproductionCooldownTicks
    );
    if (
      !dominantReproductionSuppressed &&
      baseEligible &&
      hasResources &&
      creature.energy < adjustedThreshold
    ) restrainedCandidates++;
    if (
      birthSlots > 0 &&
      !dominantReproductionSuppressed &&
      canReproduce(
        creature,
        adjustedThreshold,
        timing.maturityAge,
        constants.reproductionCooldownTicks
      ) && hasResources
    ) {
      const energyPaid = payReproductionCost(
        creature,
        constants.reproductionEnergyCost * timing.costMultiplier
      );
      const offspringEnergy = Math.min(constants.reproductionEnergyCost, energyPaid);
      const nearbySources = creatureIndex.querySquare(
        creature.x,
        creature.y,
        constants.corpseToxicityRadius
      );
      const cellToxicity = newWorld.getCell(creature.x, creature.y).toxicity;
      const mutationPressure = getLocalMiasmaMutationPressure(
        creature.x,
        creature.y,
        nearbySources,
        constants.corpseToxicityRadius,
        constants.corpseDecayDurationTicks,
        cellToxicity
      );
      const mutationRate = getMiasmaAdjustedMutationRate(
        constants.defaultMutationRate,
        mutationPressure
      );

      // Get entity-level mutation stream for stable per-creature mutation outcomes
      const entityMutationStream = rngStreams.getEntityStream(RNG_STREAMS.MUTATION, creature.id);
      const child = reproduceCreature(
        creature,
        entityMutationStream.fn,
        constants.mutationDrift,
        mutationRate,
        offspringEnergy
      );

      if (child.lineageId !== creature.lineageId && !child.incipientSpeciesId) {
        const profile = speciesProfiles.find((item) => item.id === creature.speciesId);
        if (profile) {
          const candidate = createIncipientSpecies(
            creature.speciesId,
            child.lineageId,
            child.traits,
            profile.founderTraits,
            child.generation,
            state.tick,
            child.x,
            child.y
          );
          if (candidate) {
            child.incipientSpeciesId = candidate.id;
            incipientSpecies.push(candidate);
          }
        }
      }

      offspring.push(child);
      creature.lastReproductionAge = creature.age;
      creature.offspringCount++;
      birthSlots--;
      newEvents.push({
        type: 'birth',
        tick: state.tick,
        creatureId: child.id,
        speciesId: child.speciesId,
        lineageId: child.lineageId,
        parentCreatureId: creature.id,
        mutationPressure,
        mutationRate,
        affectedRegion: { x: child.x, y: child.y, radius: 0 },
        rngStream: entityMutationStream.streamName,
      });
      if (child.lineageId !== creature.lineageId) {
        newEvents.push({
          type: 'mutation',
          tick: state.tick,
          creatureId: child.id,
          speciesId: child.speciesId,
          parentLineageId: creature.lineageId,
          lineageId: child.lineageId,
          traitChanges: compareTraits(creature.traits, child.traits),
          mutationPressure,
          mutationRate,
          detail: `${lineageDisplayName(
            creature.speciesId,
            creature.lineageId
          )} → ${lineageDisplayName(child.speciesId, child.lineageId)}`,
          affectedRegion: { x: child.x, y: child.y, radius: 0 },
          rngStream: entityMutationStream.streamName,
        });
      }
    }
  }

  // Add offspring to creature list
  creatures.push(...offspring);

  // Step 8: Death (Age and Starvation)
  for (const creature of creatures) {
    if (creature.lifecycleState !== 'alive') continue;
    creature.age++;
    checkAgeAndStarvation(
      creature,
      constants.maxCreatureAgeTicks,
      constants.corpseDecayDurationTicks
    );
    if (creature.energy <= 0 || creature.age >= constants.maxCreatureAgeTicks) {
      deathCauses.set(creature.id, creature.energy <= 0 ? 'starvation' : 'age');
    }
  }

  // Step 8.5: Biodiversity Pressure (density-dependent mortality and monoculture penalties)
  for (const [creatureId, cause] of applyBiodiversityPressure(creatures, biodiversityStream.fn, constants)) {
    deathCauses.set(creatureId, cause);
  }

  const established = establishableCandidates(creatures, incipientSpecies);
  const establishedIds = new Set(established.map((candidate) => candidate.id));
  for (const candidate of established) {
    for (const creature of creatures) {
      if (creature.incipientSpeciesId !== candidate.id) continue;
      creature.speciesId = candidate.id;
      creature.incipientSpeciesId = null;
    }
    speciesProfiles.push({
      id: candidate.id,
      ancestorSpeciesId: candidate.ancestorSpeciesId,
      founderTraits: { ...candidate.founderTraits },
      establishedTick: state.tick,
    });
    // Speciation is a result of mutations, so tag with mutation stream
    newEvents.push({
      type: 'speciation',
      tick: state.tick,
      speciesId: candidate.id,
      ancestralSpeciesId: candidate.ancestorSpeciesId,
      lineageId: candidate.founderLineageId,
      detail: `${speciesDisplayName(candidate.id)} emerged from ${speciesDisplayName(candidate.ancestorSpeciesId)}`,
      affectedRegion: candidate.founderX !== undefined && candidate.founderY !== undefined
        ? { x: candidate.founderX, y: candidate.founderY, radius: 0 }
        : undefined,
      rngStream: mutationStream.streamName,
    });
  }
  const livingCandidates = livingCandidateIds(creatures);
  incipientSpecies = incipientSpecies.filter((candidate) =>
    !establishedIds.has(candidate.id) && livingCandidates.has(candidate.id)
  );

  // Log death events for creatures that just died
  for (const creature of creatures) {
    if (creature.lifecycleState === 'dead' && aliveBeforeDeath.has(creature.id)) {
      // Deaths caused by feeding, metabolism, or biodiversity pressure do not
      // pass through checkAgeAndStarvation. Give every new corpse the same
      // configurable persistence window before decomposition removes it.
      if (creature.corpseDecayTicks <= 0) {
        creature.corpseDecayTicks = constants.corpseDecayDurationTicks;
      }
      // A starved animal has spent its stored energy, but still leaves behind
      // limited structural body mass. Without this reserve, starvation deaths
      // are visible corpses that provide no food and scavengers can only live
      // off the opening's hand-placed carrion.
      creature.energy = Math.max(
        creature.energy,
        Math.max(0, constants.minimumCarrionEnergy) * Math.max(0.25, creature.traits.size)
      );
      // Tag death event only if it resulted from a random decision
      // Starvation, age, and environmental-stress deaths are deterministic checks with no RNG involvement
      const deathCause = deathCauses.get(creature.id) ?? 'unknown';
      const deathEvent = {
        type: 'death' as const,
        tick: state.tick,
        creatureId: creature.id,
        speciesId: creature.speciesId,
        lineageId: creature.lineageId,
        deathCause,
        offspringCountAtDeath: creature.offspringCount,
        prematureDeath: creature.offspringCount === 0,
        ageAtDeath: creature.age,
        affectedRegion: { x: creature.x, y: creature.y, radius: 0 },
        // Only overcrowding and monoculture-pressure deaths used randomness (from biodiversityStream)
        ...(deathCause === 'overcrowding' || deathCause === 'monoculture-pressure'
          ? { rngStream: biodiversityStream.streamName }
          : {}),
      };
      newEvents.push(deathEvent);
    }
  }

  // Step 9: Decomposition
  // Dissipate old toxicity from previous ticks
  dissipateToxicity(newWorld, constants.toxicityRetention);

  // Aggregate corpse biomass from newly-dead creatures to their tiles
  aggregateCorpseBiomass(creatures, newWorld, constants.corpseDecayDurationTicks);

  // Process deterministic decomposition for each cell
  // Track biomass consumed per cell to sync with creature energy
  const consumptionPerCell = new Map<string, number>();
  for (let y = 0; y < newWorld.height; y++) {
    for (let x = 0; x < newWorld.width; x++) {
      const cell = newWorld.getCell(x, y);
      const decompserActivity = calculateDecomposerActivity(
        cell.temperature,
        cell.moisture,
        cell.toxicity,
        cell.corpseBiomass || 0,
        constants
      );
      // Process decomposition (mutates the cell copy, returns amount consumed)
      const biomassConsumed = processDecomposition(
        cell,
        decompserActivity,
        constants.corpseDecayRate
      );
      // Track consumption for energy sync
      consumptionPerCell.set(`${x},${y}`, biomassConsumed);
      // Persist changes back to world
      newWorld.setCell(x, y, {
        decompserActivity,
        corpseBiomass: cell.corpseBiomass,
        nutrients: cell.nutrients,
      });
    }
  }

  // Sync creature energy with decomposition consumption
  for (let y = 0; y < newWorld.height; y++) {
    for (let x = 0; x < newWorld.width; x++) {
      const consumed = consumptionPerCell.get(`${x},${y}`) ?? 0;
      if (consumed > 0) {
        syncCreatureEnergyWithDecomposition(x, y, consumed, creatures);
      }
    }
  }

  // Apply toxicity from decaying corpses and decrement timers
  for (const creature of creatures) {
    if (creature.lifecycleState === 'dead' && creature.corpseDecayTicks > 0) {
      applyCorpseToxicity(
        creature,
        newWorld,
        constants.corpseToxicityPerTick,
        constants.corpseToxicityRadius,
        constants.corpseDecayDurationTicks
      );
    }
  }

  // Decrement corpse decay timers
  decrementCorpseDecayTimers(creatures);

  // Step 10: Nutrient Recycling
  recycleNutrients(newWorld);

  // Detect environmental shocks (high toxicity spikes at specific locations)
  const TOXICITY_SHOCK_THRESHOLD = 50; // Toxicity level that triggers shock detection
  const MAX_SHOCKS_PER_TICK = 3; // Limit shocks to prevent spam
  let shocksEmitted = 0;
  for (let y = 0; y < newWorld.height && shocksEmitted < MAX_SHOCKS_PER_TICK; y++) {
    for (let x = 0; x < newWorld.width && shocksEmitted < MAX_SHOCKS_PER_TICK; x++) {
      const cell = newWorld.getCell(x, y);
      if (cell.toxicity > TOXICITY_SHOCK_THRESHOLD) {
        newEvents.push({
          type: 'environmental-shock',
          tick: state.tick,
          shockKind: 'toxicity-surge',
          affectedRegion: { x, y, radius: 2 },
          detail: `Toxicity surge at (${x}, ${y})`,
          // Toxicity surge detection is deterministic (threshold check), not random
        });
        shocksEmitted++;
      }
    }
  }

  // Count living creatures per species (for extinction detection)
  // Initialize with 0 for all known species to detect extinctions correctly
  const speciesLivingCount = new Map<string, number>();
  for (const profile of state.speciesProfiles) {
    speciesLivingCount.set(profile.id, 0);
  }

  const lastSpeciesLocation = new Map<string, { x: number; y: number }>();
  for (const creature of creatures) {
    // Track last known location of each species (alive or dead for better accuracy)
    lastSpeciesLocation.set(creature.speciesId, { x: creature.x, y: creature.y });

    if (creature.lifecycleState === 'alive') {
      speciesLivingCount.set(
        creature.speciesId,
        (speciesLivingCount.get(creature.speciesId) || 0) + 1
      );
    }
  }

  // Remove fully decomposed creatures and detect extinctions
  const creaturesAfterDecomposition: Creature[] = [];

  for (const creature of creatures) {
    if (creature.lifecycleState === 'dead' && creature.corpseDecayTicks <= 0) {
      // Fully decomposed; remove from simulation
    } else {
      creaturesAfterDecomposition.push(creature);
    }
  }

  // Detect extinct species (those with 0 living members in this tick)
  // Only emit extinction event if the species existed before but is now gone
  const currentLivingSpecies = new Set<string>();
  for (const creature of creaturesAfterDecomposition) {
    if (creature.lifecycleState === 'alive') {
      currentLivingSpecies.add(creature.speciesId);
    }
  }

  for (const speciesId of speciesLivingCount.keys()) {
    if (speciesLivingCount.get(speciesId) === 0 && !currentLivingSpecies.has(speciesId)) {
      const lastLoc = lastSpeciesLocation.get(speciesId);
      // Extinction is recorded as an event
      // Extinction detection is deterministic (population counting), not random
      newEvents.push({
        type: 'extinction',
        tick: state.tick,
        speciesId,
        affectedRegion: lastLoc
          ? { x: lastLoc.x, y: lastLoc.y, radius: 0 }
          : undefined,
      });
    }
  }

  const completeEvents = state.events.concat(newEvents);
  const nextTick = state.tick + 1;
  const reproductionPressure = {
    restrainedCandidates,
    averagePressure: pressureCount > 0 ? pressureTotal / pressureCount : 0,
    maximumPressure,
  };
  const dispersal = {
    activeCreatures: creaturesAfterDecomposition.filter((creature) =>
      creature.lifecycleState === 'alive'
      && creature.dispersalTargetX !== null
      && creature.dispersalTargetY !== null
    ).length,
    moves: dispersalMoves,
    energySpent: dispersalEnergySpent,
    biomeTransitions: dispersalBiomeTransitions,
  };
  const historyResult = nextTick % state.historyInterval === 0
    ? appendEcosystemHistory(
        state.history,
        state.historyInterval,
        createEcosystemHistorySample(
          nextTick,
          creaturesAfterDecomposition,
          completeEvents,
          newWorld,
          reproductionPressure,
          dispersal,
          constants
        )
      )
    : { history: state.history, interval: state.historyInterval };

  // Clean up expired sounds (older than SOUND_PERSISTENCE_TICKS)
  const activeSounds = state.activeSounds.filter(
    (sound) => nextTick - sound.tick < SOUND_PERSISTENCE_TICKS
  );

  // Update adaptation metrics tracker with current creature snapshots
  const adaptationObservations = state.adaptationMetrics.updateMetrics(
    nextTick,
    creaturesAfterDecomposition.map((c) => ({
      id: c.id,
      speciesId: c.speciesId,
      lineageId: c.lineageId,
      parentId: c.parentId,
      traits: c.traits,
      x: c.x,
      y: c.y,
      energy: c.energy,
      age: c.age,
      lifecycleState: c.lifecycleState,
      corpseDecayTicks: c.corpseDecayTicks,
      lastReproductionAge: c.lastReproductionAge,
      generation: c.generation,
      incipientSpeciesId: c.incipientSpeciesId,
      offspringCount: c.offspringCount,
      toxinExposure: c.toxinExposure,
      localResourcePressure: c.localResourcePressure,
      reproductionPressureMultiplier: c.reproductionPressureMultiplier,
      dispersalTargetX: c.dispersalTargetX,
      dispersalTargetY: c.dispersalTargetY,
      lastDispersalTick: c.lastDispersalTick,
      dispersalMoves: c.dispersalMoves,
    })),
    completeEvents
  );

  // Compact events at checkpoint boundaries to prevent unbounded memory growth
  const eventsToStore = nextTick % CHECKPOINT_INTERVAL === 0
    ? compactEvents(completeEvents, nextTick)
    : completeEvents;

  return {
    world: newWorld,
    creatures: creaturesAfterDecomposition,
    creatureIdCounter: Creature.getIdCounter(),
    tick: nextTick,
    seed: state.seed,
    events: eventsToStore,
    constants,
    history: historyResult.history,
    historyInterval: historyResult.interval,
    speciesProfiles,
    incipientSpecies,
    activeSounds,
    soundEventCounter: state.soundEventCounter,
    adaptationMetrics: state.adaptationMetrics,
    lastAdaptationObservations: adaptationObservations,
  };
}

/**
 * Apply a changed solar baseline without discarding energy added by nutrient recycling.
 * The world stores solar and recycled energy together, so each cell receives only the
 * difference between its previous and next deterministic solar grids.
 */
function applyLiveSolarConstants(
  world: World,
  previous: SimulationConstants,
  next: SimulationConstants
): void {
  if (
    previous.baseSolarEnergy === next.baseSolarEnergy &&
    previous.solarEdgeFalloffFactor === next.solarEdgeFalloffFactor &&
    previous.solarFalloffExponent === next.solarFalloffExponent
  ) {
    return;
  }

  const previousSolar = computeSolarEnergyGrid({
    ...previous,
    worldWidth: world.width,
    worldHeight: world.height,
  });
  const nextSolar = computeSolarEnergyGrid(next);

  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const cell = world.getCell(x, y);
      world.setCell(x, y, {
        energy: Math.max(0, cell.energy + nextSolar[y][x] - previousSolar[y][x]),
      });
    }
  }
}

interface PopulationPressure {
  dominantSpecies: string | null;
  dominantCount: number;
  isMonopoly: boolean;
}

function getPopulationPressure(
  aliveCreatures: Creature[],
  constants: SimulationConstants
): PopulationPressure {
  const speciesCounts = new Map<string, number>();
  for (const creature of aliveCreatures) {
    speciesCounts.set(creature.speciesId, (speciesCounts.get(creature.speciesId) || 0) + 1);
  }

  let dominantSpecies: string | null = null;
  let dominantCount = 0;
  for (const [speciesId, count] of speciesCounts) {
    if (count > dominantCount) {
      dominantSpecies = speciesId;
      dominantCount = count;
    }
  }

  return {
    dominantSpecies,
    dominantCount,
    isMonopoly:
      aliveCreatures.length > 0 &&
      dominantCount / aliveCreatures.length > constants.monocultureDominanceThreshold,
  };
}

/**
 * Apply biodiversity pressure penalties to prevent monoculture and overcrowding.
 * Increases mortality risk for:
 * 1. Creatures in dominant species (>80% of population)
 * 2. Random creatures when global population exceeds carrying capacity
 *
 * @param creatures - all creatures in the simulation (mutated in-place)
 * @param rng - deterministic RNG for stochastic mortality
 */
function applyBiodiversityPressure(
  creatures: Creature[],
  rng: RngFn,
  constants: SimulationConstants
): Map<string, DeathCause> {
  const causes = new Map<string, DeathCause>();
  // Count creatures per species (alive only)
  const aliveCreatures = creatures.filter((c) => c.lifecycleState === 'alive');
  if (aliveCreatures.length === 0) {
    return causes;
  }

  const pressure = getPopulationPressure(aliveCreatures, constants);

  // Check if population exceeds carrying capacity
  const isOvercrowded = aliveCreatures.length > constants.maxGlobalPopulation;

  // Apply penalties
  for (const creature of creatures) {
    if (creature.lifecycleState !== 'alive') continue;

    let mortalityBonus = 0;

    // Penalty for creatures in the dominant species during monopoly
    if (pressure.isMonopoly && creature.speciesId === pressure.dominantSpecies) {
      mortalityBonus += constants.monocultureMortalityPenalty;
    }

    // Penalty for all creatures during overcrowding
    if (isOvercrowded) {
      mortalityBonus += constants.overcrowdingMortalityRate;
    }

    // Apply stochastic mortality if any penalty was incurred
    if (mortalityBonus > 0 && rng() < mortalityBonus) {
      creature.lifecycleState = 'dead';
      causes.set(
        creature.id,
        isOvercrowded ? 'overcrowding' : 'monoculture-pressure'
      );
    }
  }

  // Hard carrying capacity: deterministic partial Fisher-Yates selection avoids
  // stable array-order bias while guaranteeing oversized inputs return to cap.
  const survivors = creatures.filter((creature) => creature.lifecycleState === 'alive');
  const excess = Math.max(0, survivors.length - constants.maxGlobalPopulation);
  for (let index = 0; index < excess; index++) {
    const selected = index + Math.floor(rng() * (survivors.length - index));
    [survivors[index], survivors[selected]] = [survivors[selected], survivors[index]];
    survivors[index].lifecycleState = 'dead';
    causes.set(survivors[index].id, 'overcrowding');
  }
  return causes;
}

/**
 * Convenience function to run N ticks sequentially
 * Equivalent to calling tickEngine N times
 *
 * @param state - initial engine state
 * @param ticks - number of ticks to run
 * @returns engine state after N ticks
 */
export function runEngine(state: EngineState, ticks: number): EngineState {
  let currentState = state;
  for (let i = 0; i < ticks; i++) {
    currentState = tickEngine(currentState);
  }
  return currentState;
}
