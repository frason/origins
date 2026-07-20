import { SIMULATION_CONSTANTS, type SimulationConstants } from '../utils/constants';
import type { EnergyStrategy } from '../utils/traits';
import { measureBiomass, type BiomassMetrics } from './biomassMetrics';
import { buildDemoEngine } from './demoWorld';
import { tickEngine } from './engine';
import { growProducers } from './producer';
import { World } from './world';

export const BIOMASS_CALIBRATION_SEEDS = [42, 12345, 54321, 99999] as const;
export const BIOMASS_CALIBRATION_HORIZONS = [30, 100, 150] as const;

export interface BiomassCalibrationSample {
  tick: number;
  population: number;
  strategies: EnergyStrategy[];
  biomass: BiomassMetrics;
  births: number;
  deaths: number;
}

export interface BiomassCalibrationResult {
  seed: number;
  samples: BiomassCalibrationSample[];
  maximumPopulation: number;
  starvationDeaths: number;
  extinctionEvents: number;
}

function sample(state: ReturnType<typeof buildDemoEngine>): BiomassCalibrationSample {
  const living = state.creatures.filter((creature) => creature.lifecycleState === 'alive');
  return {
    tick: state.tick,
    population: living.length,
    strategies: [...new Set(living.map((creature) => creature.traits.energyStrategy))].sort(),
    biomass: measureBiomass(state.world, state.creatures),
    births: state.events.filter((event) => event.type === 'birth').length,
    deaths: state.events.filter((event) => event.type === 'death').length,
  };
}

/** Run one full-size world once and retain only bounded calibration checkpoints. */
export function runBiomassCalibration(
  seed: number,
  constants: SimulationConstants = { ...SIMULATION_CONSTANTS },
  horizons: readonly number[] = BIOMASS_CALIBRATION_HORIZONS
): BiomassCalibrationResult {
  const checkpoints = [...new Set(horizons.map((tick) => Math.max(0, Math.floor(tick))))]
    .sort((a, b) => a - b);
  const finalTick = checkpoints[checkpoints.length - 1] ?? 0;
  let state = buildDemoEngine(seed, { ...constants });
  let maximumPopulation = state.creatures.filter(
    (creature) => creature.lifecycleState === 'alive'
  ).length;
  const samples: BiomassCalibrationSample[] = [sample(state)];
  for (let tick = 1; tick <= finalTick; tick++) {
    state = tickEngine(state);
    maximumPopulation = Math.max(
      maximumPopulation,
      state.creatures.filter((creature) => creature.lifecycleState === 'alive').length
    );
    if (checkpoints.includes(tick)) samples.push(sample(state));
  }
  return {
    seed,
    samples,
    maximumPopulation,
    starvationDeaths: state.events.filter(
      (event) => event.type === 'death' && event.deathCause === 'starvation'
    ).length,
    extinctionEvents: state.events.filter((event) => event.type === 'extinction').length,
  };
}

/** Controlled abandoned habitat probe for gradual, deterministic recovery. */
export function measureAbandonedHabitatRecovery(ticks: number = 20): number[] {
  const world = new World(1, 1);
  world.setCell(0, 0, {
    biome: 'grassland',
    producerArchetype: 'ground-cover',
    energy: 10,
    nutrients: 0,
    producerBiomass: 0,
    toxicity: 0,
  });
  const biomass = [0];
  for (let tick = 0; tick < Math.max(0, Math.floor(ticks)); tick++) {
    growProducers(world, 'solar', SIMULATION_CONSTANTS.producerGrowthRate, true, true);
    biomass.push(world.getCell(0, 0).producerBiomass);
  }
  return biomass;
}
