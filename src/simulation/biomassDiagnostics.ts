import { SIMULATION_CONSTANTS, type SimulationConstants } from '../utils/constants';
import type { EnergyStrategy } from '../utils/traits';
import { reachableTerrainCells } from './biomeTraversal';
import { measureBiomass, type BiomassMetrics } from './biomassMetrics';
import type { Creature } from './creature';
import { buildDemoEngine } from './demoWorld';
import { getEnergyCapacity } from './energy';
import { tickEngine } from './engine';
import type { EngineState } from './engine';
import { calculateProducerGrowth } from './producer';
import type { World } from './world';

const STRATEGIES: EnergyStrategy[] = ['herbivore', 'carnivore', 'omnivore', 'scavenger'];
const MIN_FOOD_BIOMASS = 1;

export interface StrategyFoodAccess {
  population: number;
  accessiblePopulation: number;
  accessShare: number;
  lowEnergyPopulation: number;
  starvationDeaths: number;
  firstStarvationTick: number | null;
}

export type FoodAccessByStrategy = Record<EnergyStrategy, StrategyFoodAccess>;

export interface BiomassDiagnosticSample {
  tick: number;
  population: number;
  biomass: BiomassMetrics;
  cumulativeProducerRegrowth: number;
  cumulativeGrazingConsumption: number;
  recentGrazing: GrazingPressureMetrics;
  foodAccess: FoodAccessByStrategy;
}

export interface GrazingPressureMetrics {
  consumedBiomass: number;
  grazedTileCount: number;
  averageConsumptionPerGrazedTile: number;
  maximumTileConsumption: number;
}

export interface BiomassDiagnosticReport {
  seed: number;
  throughTick: number;
  samples: BiomassDiagnosticSample[];
}

function emptyFoodAccess(): FoodAccessByStrategy {
  return Object.fromEntries(STRATEGIES.map((strategy) => [strategy, {
    population: 0,
    accessiblePopulation: 0,
    accessShare: 0,
    lowEnergyPopulation: 0,
    starvationDeaths: 0,
    firstStarvationTick: null,
  }])) as FoodAccessByStrategy;
}

function ediblePrey(strategy: EnergyStrategy, candidate: Creature): boolean {
  return (
    (strategy === 'carnivore' || strategy === 'omnivore') &&
    candidate.lifecycleState === 'alive' &&
    ['herbivore', 'omnivore', 'scavenger'].includes(candidate.traits.energyStrategy)
  );
}

function edibleCorpse(strategy: EnergyStrategy, candidate: Creature): boolean {
  return (
    (strategy === 'scavenger' || strategy === 'omnivore') &&
    candidate.lifecycleState !== 'alive' &&
    candidate.corpseDecayTicks > 0
  );
}

/** Measure physically reachable food without consuming RNG or changing perception state. */
export function measureFoodAccess(
  world: World,
  creatures: Creature[],
  starvationDeaths: Partial<Record<EnergyStrategy, number>> = {},
  firstStarvationTicks: Partial<Record<EnergyStrategy, number | null>> = {}
): FoodAccessByStrategy {
  const result = emptyFoodAccess();
  for (const strategy of STRATEGIES) {
    result[strategy].starvationDeaths = starvationDeaths[strategy] ?? 0;
    result[strategy].firstStarvationTick = firstStarvationTicks[strategy] ?? null;
  }

  for (const creature of creatures) {
    if (creature.lifecycleState !== 'alive') continue;
    const strategy = creature.traits.energyStrategy;
    const metric = result[strategy];
    metric.population++;
    if (creature.energy < getEnergyCapacity(creature) * 0.25) metric.lowEnergyPopulation++;

    const reachable = reachableTerrainCells(
      world,
      creature.x,
      creature.y,
      creature.traits.visionRange,
      creature.traits
    );
    let hasFood = false;
    if (strategy === 'herbivore' || strategy === 'omnivore') {
      for (const coordinate of reachable) {
        const [x, y] = coordinate.split(',').map(Number);
        if (world.getCell(x, y).producerBiomass > MIN_FOOD_BIOMASS) {
          hasFood = true;
          break;
        }
      }
    }
    if (!hasFood && strategy !== 'herbivore') {
      hasFood = creatures.some((candidate) =>
        candidate.id !== creature.id &&
        reachable.has(`${candidate.x},${candidate.y}`) &&
        (ediblePrey(strategy, candidate) || edibleCorpse(strategy, candidate))
      );
    }
    if (hasFood) metric.accessiblePopulation++;
  }

  for (const strategy of STRATEGIES) {
    const metric = result[strategy];
    metric.accessShare = metric.population > 0
      ? metric.accessiblePopulation / metric.population
      : 0;
  }
  return result;
}

/** Predict gross producer growth for one tick before grazing removes biomass. */
export function estimateProducerRegrowth(
  world: World,
  constants: Pick<SimulationConstants, 'producerGrowthRate'>
): number {
  let regrowth = 0;
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const cell = world.getCell(x, y);
      regrowth += Math.max(
        0,
        calculateProducerGrowth(cell, 'solar', constants.producerGrowthRate, true, true).growth
      );
    }
  }
  return regrowth;
}

function predictProducerBiomass(
  world: World,
  constants: Pick<SimulationConstants, 'producerGrowthRate'>
): { regrowth: number; biomass: Float64Array } {
  const biomass = new Float64Array(world.width * world.height);
  let regrowth = 0;
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const cell = world.getCell(x, y);
      const prediction = calculateProducerGrowth(
        cell, 'solar', constants.producerGrowthRate, true, true
      );
      biomass[y * world.width + x] = prediction.nextBiomass;
      regrowth += Math.max(0, prediction.growth);
    }
  }
  return { regrowth, biomass };
}

export function summarizeGrazingPressure(
  grazingByTile: ReadonlyMap<number, number>
): GrazingPressureMetrics {
  let consumedBiomass = 0;
  let grazedTileCount = 0;
  let maximumTileConsumption = 0;
  for (const consumption of grazingByTile.values()) {
    if (consumption <= 1e-9) continue;
    consumedBiomass += consumption;
    grazedTileCount++;
    maximumTileConsumption = Math.max(maximumTileConsumption, consumption);
  }
  return {
    consumedBiomass,
    grazedTileCount,
    averageConsumptionPerGrazedTile: grazedTileCount > 0
      ? consumedBiomass / grazedTileCount
      : 0,
    maximumTileConsumption,
  };
}

function sample(
  state: EngineState,
  producerRegrowth: number,
  grazingConsumption: number,
  recentGrazing: ReadonlyMap<number, number>,
  starvationDeaths: Partial<Record<EnergyStrategy, number>>,
  firstStarvationTicks: Partial<Record<EnergyStrategy, number | null>>
): BiomassDiagnosticSample {
  const living = state.creatures.filter((creature) => creature.lifecycleState === 'alive');
  return {
    tick: state.tick,
    population: living.length,
    biomass: measureBiomass(state.world, state.creatures),
    cumulativeProducerRegrowth: producerRegrowth,
    cumulativeGrazingConsumption: grazingConsumption,
    recentGrazing: summarizeGrazingPressure(recentGrazing),
    foodAccess: measureFoodAccess(
      state.world, state.creatures, starvationDeaths, firstStarvationTicks
    ),
  };
}

/** Run a fixed-seed, no-render diagnostic without changing live simulation behavior. */
export function runBiomassDiagnostic(
  seed: number,
  throughTick: number = 150,
  sampleTicks: number[] = [0, 10, 30, 60, 100, 150],
  constants: SimulationConstants = { ...SIMULATION_CONSTANTS }
): BiomassDiagnosticReport {
  const boundedHorizon = Math.max(0, Math.floor(throughTick));
  const checkpoints = new Set(
    sampleTicks
      .map((tick) => Math.max(0, Math.min(boundedHorizon, Math.floor(tick))))
  );
  checkpoints.add(0);
  checkpoints.add(boundedHorizon);
  let state = buildDemoEngine(seed, { ...constants });
  let cumulativeProducerRegrowth = 0;
  let cumulativeGrazingConsumption = 0;
  let recentGrazing = new Map<number, number>();
  const starvationDeaths: Partial<Record<EnergyStrategy, number>> = {};
  const firstStarvationTicks: Partial<Record<EnergyStrategy, number | null>> = {};
  const samples: BiomassDiagnosticSample[] = [];
  if (checkpoints.has(0)) {
    samples.push(sample(state, 0, 0, recentGrazing, starvationDeaths, firstStarvationTicks));
  }

  for (let tick = 1; tick <= boundedHorizon; tick++) {
    const predicted = predictProducerBiomass(state.world, state.constants);
    const previousEventCount = state.events.length;
    state = tickEngine(state);
    cumulativeProducerRegrowth += predicted.regrowth;
    let tickConsumption = 0;
    for (let y = 0; y < state.world.height; y++) {
      for (let x = 0; x < state.world.width; x++) {
        const index = y * state.world.width + x;
        const consumed = Math.max(
          0,
          predicted.biomass[index] - state.world.getCell(x, y).producerBiomass
        );
        if (consumed <= 1e-9) continue;
        tickConsumption += consumed;
        recentGrazing.set(index, (recentGrazing.get(index) ?? 0) + consumed);
      }
    }
    cumulativeGrazingConsumption += tickConsumption;

    for (const event of state.events.slice(previousEventCount)) {
      if (event.type !== 'death' || event.deathCause !== 'starvation' || !event.creatureId) continue;
      const creature = state.creatures.find((candidate) => candidate.id === event.creatureId);
      if (!creature) continue;
      const strategy = creature.traits.energyStrategy;
      starvationDeaths[strategy] = (starvationDeaths[strategy] ?? 0) + 1;
      if (firstStarvationTicks[strategy] == null) firstStarvationTicks[strategy] = state.tick;
    }
    if (checkpoints.has(state.tick)) {
      samples.push(sample(
        state,
        cumulativeProducerRegrowth,
        cumulativeGrazingConsumption,
        recentGrazing,
        starvationDeaths,
        firstStarvationTicks
      ));
      recentGrazing = new Map<number, number>();
    }
  }

  return { seed, throughTick: boundedHorizon, samples };
}
