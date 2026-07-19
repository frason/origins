import { SIMULATION_CONSTANTS, type SimulationConstants } from '../utils/constants';
import type { EnergyStrategy } from '../utils/traits';
import { reachableTerrainCells } from './biomeTraversal';
import { measureBiomass, type BiomassMetrics } from './biomassMetrics';
import type { Creature } from './creature';
import { buildDemoEngine } from './demoWorld';
import { getEnergyCapacity } from './energy';
import { tickEngine } from './engine';
import type { EngineState } from './engine';
import { getBiomeProductivity } from './producer';
import { getProducerTraits } from './producerTypes';
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
  foodAccess: FoodAccessByStrategy;
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
      const carryingCapacity = getProducerTraits(cell.producerArchetype).carryingCapacity;
      const potentialGrowth = constants.producerGrowthRate * cell.energy
        * getBiomeProductivity(cell.biome) / (1 + Math.max(0, cell.toxicity));
      regrowth += Math.max(
        0,
        Math.min(carryingCapacity, cell.producerBiomass + potentialGrowth) - cell.producerBiomass
      );
    }
  }
  return regrowth;
}

function totalBiomass(world: World): number {
  let total = 0;
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) total += world.getCell(x, y).producerBiomass;
  }
  return total;
}

function sample(
  state: EngineState,
  producerRegrowth: number,
  grazingConsumption: number,
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
  const starvationDeaths: Partial<Record<EnergyStrategy, number>> = {};
  const firstStarvationTicks: Partial<Record<EnergyStrategy, number | null>> = {};
  const samples: BiomassDiagnosticSample[] = [];
  if (checkpoints.has(0)) {
    samples.push(sample(state, 0, 0, starvationDeaths, firstStarvationTicks));
  }

  for (let tick = 1; tick <= boundedHorizon; tick++) {
    const beforeBiomass = totalBiomass(state.world);
    const grossRegrowth = estimateProducerRegrowth(state.world, state.constants);
    const previousEventCount = state.events.length;
    state = tickEngine(state);
    cumulativeProducerRegrowth += grossRegrowth;
    cumulativeGrazingConsumption += Math.max(
      0,
      beforeBiomass + grossRegrowth - totalBiomass(state.world)
    );

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
        starvationDeaths,
        firstStarvationTicks
      ));
    }
  }

  return { seed, throughTick: boundedHorizon, samples };
}
