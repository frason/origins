import { reachableTerrainCells } from './biomeTraversal';
import type { Creature } from './creature';
import { CreatureSpatialIndex } from './creatureSpatialIndex';
import { getProducerBiteCapacity } from './energy';
import { getProducerTraits } from './producerTypes';
import type { World } from './world';
import type { EnergyStrategy } from '../utils/traits';

export const DEFAULT_LOCAL_PRESSURE_RADIUS = 5;
/** Parallel-suite wall-clock gate; isolated runs are typically well below this. */
export const LOCAL_PRESSURE_500_CREATURE_BUDGET_MS = 2_000;

export interface LocalResourcePressure {
  creatureId: string;
  nearbyLiving: number;
  sameSpeciesCompetitors: number;
  foodCompetitors: number;
  prey: number;
  corpses: number;
  accessibleProducerEnergy: number;
  accessiblePreyEnergy: number;
  accessibleCorpseEnergy: number;
  accessibleFoodEnergy: number;
  localDemand: number;
  pressure: number;
}

function canPreyOn(strategy: EnergyStrategy, candidate: Creature): boolean {
  return (
    strategy === 'carnivore' || strategy === 'omnivore'
  ) && (
    candidate.traits.energyStrategy === 'herbivore' ||
    candidate.traits.energyStrategy === 'omnivore' ||
    candidate.traits.energyStrategy === 'scavenger'
  );
}

function sharesFoodSource(observer: EnergyStrategy, candidate: EnergyStrategy): boolean {
  if (observer === 'herbivore') return candidate === 'herbivore' || candidate === 'omnivore';
  if (observer === 'carnivore') return candidate === 'carnivore' || candidate === 'omnivore';
  if (observer === 'scavenger') return candidate === 'scavenger' || candidate === 'omnivore';
  return true;
}

function boundedRadius(radius: number): number {
  return Math.max(0, Math.min(50, Math.floor(radius)));
}

function round(value: number): number {
  return Number((Number.isFinite(value) ? value : 0).toFixed(6));
}

function measureCreaturePressure(
  creature: Creature,
  world: World,
  index: CreatureSpatialIndex,
  radius: number,
  originX: number = creature.x,
  originY: number = creature.y
): LocalResourcePressure {
  const nearby = index.querySquare(originX, originY, radius).filter((candidate) =>
    candidate.id !== creature.id &&
    Math.max(Math.abs(candidate.x - originX), Math.abs(candidate.y - originY)) <= radius
  );
  const reachable = reachableTerrainCells(
    world,
    originX,
    originY,
    radius,
    creature.traits
  );
  const strategy = creature.traits.energyStrategy;
  let nearbyLiving = 0;
  let sameSpeciesCompetitors = 0;
  let foodCompetitors = 0;
  let prey = 0;
  let corpses = 0;
  let accessiblePreyEnergy = 0;
  let accessibleCorpseEnergy = 0;
  let localDemand = getProducerBiteCapacity(creature);

  for (const candidate of nearby) {
    const accessible = reachable.has(`${candidate.x},${candidate.y}`);
    if (candidate.lifecycleState === 'alive') {
      nearbyLiving++;
      if (candidate.speciesId === creature.speciesId) sameSpeciesCompetitors++;
      if (sharesFoodSource(strategy, candidate.traits.energyStrategy)) {
        foodCompetitors++;
        localDemand += getProducerBiteCapacity(candidate);
      }
      if (canPreyOn(strategy, candidate)) {
        prey++;
        if (accessible) accessiblePreyEnergy += Math.max(0, candidate.energy);
      }
    } else if (candidate.corpseDecayTicks > 0) {
      corpses++;
      if (accessible) accessibleCorpseEnergy += Math.max(0, candidate.energy);
    }
  }

  let accessibleProducerEnergy = 0;
  if (strategy === 'herbivore' || strategy === 'omnivore') {
    const minX = Math.max(0, originX - radius);
    const maxX = Math.min(world.width - 1, originX + radius);
    const minY = Math.max(0, originY - radius);
    const maxY = Math.min(world.height - 1, originY + radius);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (!reachable.has(`${x},${y}`)) continue;
        const cell = world.getCell(x, y);
        const producer = getProducerTraits(cell.producerArchetype);
        accessibleProducerEnergy += Math.max(0, cell.producerBiomass)
          * (1 - producer.defense)
          * producer.energyDensity;
      }
    }
  }

  const accessibleFoodEnergy = strategy === 'herbivore'
    ? accessibleProducerEnergy
    : strategy === 'carnivore'
      ? accessiblePreyEnergy
      : strategy === 'scavenger'
        ? accessibleCorpseEnergy
        : accessibleProducerEnergy + accessiblePreyEnergy + accessibleCorpseEnergy;
  const pressure = localDemand / Math.max(1, localDemand + accessibleFoodEnergy);
  return Object.freeze({
    creatureId: creature.id,
    nearbyLiving,
    sameSpeciesCompetitors,
    foodCompetitors,
    prey,
    corpses,
    accessibleProducerEnergy: round(accessibleProducerEnergy),
    accessiblePreyEnergy: round(accessiblePreyEnergy),
    accessibleCorpseEnergy: round(accessibleCorpseEnergy),
    accessibleFoodEnergy: round(accessibleFoodEnergy),
    localDemand: round(localDemand),
    pressure: round(Math.max(0, Math.min(1, pressure))),
  });
}

/** Evaluate a hypothetical destination without mutating creature or world state. */
export function measureLocalResourcePressureAt(
  creature: Creature,
  x: number,
  y: number,
  world: World,
  spatialIndex: CreatureSpatialIndex,
  radius: number = DEFAULT_LOCAL_PRESSURE_RADIUS
): LocalResourcePressure {
  return measureCreaturePressure(
    creature,
    world,
    spatialIndex,
    boundedRadius(radius),
    Math.max(0, Math.min(world.width - 1, Math.floor(x))),
    Math.max(0, Math.min(world.height - 1, Math.floor(y)))
  );
}

/**
 * Immutable per-tick pressure cache. Records contain aggregates only: no
 * creature references or neighborhood arrays enter replay/save state.
 */
export class LocalResourcePressureCache {
  private readonly byCreatureId: Map<string, LocalResourcePressure>;

  constructor(
    readonly tick: number,
    creatures: Creature[],
    world: World,
    radius: number = DEFAULT_LOCAL_PRESSURE_RADIUS,
    spatialIndex?: CreatureSpatialIndex
  ) {
    const normalizedRadius = boundedRadius(radius);
    const index = spatialIndex ?? new CreatureSpatialIndex(creatures);
    this.byCreatureId = new Map();
    for (const creature of creatures) {
      if (creature.lifecycleState !== 'alive') continue;
      this.byCreatureId.set(
        creature.id,
        measureCreaturePressure(creature, world, index, normalizedRadius)
      );
    }
  }

  get(creatureId: string): LocalResourcePressure | undefined {
    return this.byCreatureId.get(creatureId);
  }

  get size(): number {
    return this.byCreatureId.size;
  }

  records(): LocalResourcePressure[] {
    return [...this.byCreatureId.values()];
  }
}

export function buildLocalResourcePressureCache(
  tick: number,
  creatures: Creature[],
  world: World,
  radius: number = DEFAULT_LOCAL_PRESSURE_RADIUS,
  spatialIndex?: CreatureSpatialIndex
): LocalResourcePressureCache {
  return new LocalResourcePressureCache(tick, creatures, world, radius, spatialIndex);
}
