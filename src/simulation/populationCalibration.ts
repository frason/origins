import { measureBiomass } from './biomassMetrics';
import { tickEngine } from './engine';
import { createRng } from './rng';
import { buildEvaluationWorld } from './sustainability';
import {
  SIMULATION_CONSTANTS,
  type SimulationConstants,
} from '../utils/constants';

export const POPULATION_CALIBRATION_SEEDS = [42, 12345, 54321, 99999] as const;

export type CalibrationConstant =
  | 'baseSolarEnergy'
  | 'producerGrowthRate'
  | 'baseMetabolism'
  | 'feedingEfficiency'
  | 'reproductionEnergyThreshold'
  | 'reproductionCooldownTicks';

export interface PopulationCalibrationCandidate {
  id: string;
  constants: Partial<SimulationConstants>;
}

export interface PopulationCalibrationSuite {
  seeds: readonly number[];
  ticks: number;
  sampleInterval: number;
  maximumWallTimeMs?: number;
  measureRuntime?: boolean;
}

export interface PopulationCalibrationOutcome {
  candidateId: string;
  seed: number;
  ticksRequested: number;
  ticksProcessed: number;
  populationSeries: number[];
  speciesSeries: number[];
  lineageSeries: number[];
  maximumPopulation: number;
  extinctionTick: number | null;
  mutationCount: number;
  speciationCount: number;
  meanDepletedOccupiedTileShare: number;
  meanTickTimeMs: number | null;
}

export interface PopulationCalibrationObjectives {
  extinctionRisk: number;
  populationOverflowRisk: number;
  diversityRetention: number;
  evolutionaryActivity: number;
  trajectoryVariation: number;
  biomassDepletion: number;
  runtimeCostMs: number | null;
}

export interface PopulationCalibrationAssessment {
  candidateId: string;
  objectives: PopulationCalibrationObjectives;
  hardGateFailures: string[];
  paretoOptimal: boolean;
  rank: number;
}

export interface PopulationCalibrationReport {
  suite: Omit<PopulationCalibrationSuite, 'measureRuntime'> & { measureRuntime: boolean };
  candidates: PopulationCalibrationCandidate[];
  outcomes: PopulationCalibrationOutcome[];
  assessments: PopulationCalibrationAssessment[];
  paretoCandidateIds: string[];
}

export interface PopulationCalibrationGates {
  minimumSurvivalShare: number;
  maximumPopulation: number;
  minimumEvolutionaryActivity: number;
  maximumEvolutionaryActivity: number;
  maximumMeanTickTimeMs?: number;
}

const DEFAULT_GATES: PopulationCalibrationGates = {
  minimumSurvivalShare: 0.5,
  maximumPopulation: SIMULATION_CONSTANTS.maxGlobalPopulation,
  minimumEvolutionaryActivity: 0.001,
  maximumEvolutionaryActivity: 1,
};

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function round(value: number): number {
  return Number(finite(value).toFixed(6));
}

/** Produce a stable Cartesian product whose identifiers also describe the candidate. */
export function generatePopulationCalibrationGrid(
  dimensions: Partial<Record<CalibrationConstant, readonly number[]>>
): PopulationCalibrationCandidate[] {
  const entries = (Object.entries(dimensions) as Array<[CalibrationConstant, readonly number[]]>)
    .filter(([, values]) => values.length > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  let candidates: PopulationCalibrationCandidate[] = [{ id: 'baseline', constants: {} }];
  for (const [key, values] of entries) {
    candidates = candidates.flatMap((candidate) => values.map((value) => ({
      id: candidate.id === 'baseline' ? `${key}=${value}` : `${candidate.id},${key}=${value}`,
      constants: { ...candidate.constants, [key]: value },
    })));
  }
  return candidates;
}

/** Generate bounded candidates without introducing unseeded optimizer behavior. */
export function generateSeededPopulationCandidates(
  seed: number,
  count: number,
  bounds: Partial<Record<CalibrationConstant, readonly [number, number]>>
): PopulationCalibrationCandidate[] {
  const rng = createRng(seed);
  const entries = (Object.entries(bounds) as Array<[
    CalibrationConstant,
    readonly [number, number]
  ]>).sort(([a], [b]) => a.localeCompare(b));
  return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, index) => {
    const constants: Partial<SimulationConstants> = {};
    const parts: string[] = [];
    for (const [key, [first, second]] of entries) {
      const min = Math.min(first, second);
      const max = Math.max(first, second);
      const value = round(min + rng() * (max - min));
      Object.assign(constants, { [key]: value });
      parts.push(`${key}=${value}`);
    }
    return { id: `seed-${seed}-${index + 1}:${parts.join(',')}`, constants };
  });
}

function countLiving(state: ReturnType<typeof buildEvaluationWorld>): {
  population: number;
  species: number;
  lineages: number;
} {
  const living = state.creatures.filter((creature) => creature.lifecycleState === 'alive');
  return {
    population: living.length,
    species: new Set(living.map((creature) => creature.speciesId)).size,
    lineages: new Set(living.map((creature) => creature.lineageId)).size,
  };
}

export function runPopulationCalibrationOutcome(
  candidate: PopulationCalibrationCandidate,
  seed: number,
  suite: PopulationCalibrationSuite
): PopulationCalibrationOutcome {
  const ticksRequested = Math.max(0, Math.floor(suite.ticks));
  const sampleInterval = Math.max(1, Math.floor(suite.sampleInterval));
  let state = buildEvaluationWorld(seed, candidate.constants);
  const initial = countLiving(state);
  const populationSeries = [initial.population];
  const speciesSeries = [initial.species];
  const lineageSeries = [initial.lineages];
  let maximumPopulation = initial.population;
  let extinctionTick: number | null = initial.population === 0 ? 0 : null;
  let ticksProcessed = 0;
  let depletedShareTotal = 0;
  let depletedSampleCount = 0;
  let runtimeTotal = 0;

  for (let tick = 1; tick <= ticksRequested; tick++) {
    const started = suite.measureRuntime ? performance.now() : 0;
    state = tickEngine(state);
    if (suite.measureRuntime) runtimeTotal += performance.now() - started;
    ticksProcessed = tick;
    const counts = countLiving(state);
    maximumPopulation = Math.max(maximumPopulation, counts.population);
    if (tick % sampleInterval === 0 || tick === ticksRequested || counts.population === 0) {
      populationSeries.push(counts.population);
      speciesSeries.push(counts.species);
      lineageSeries.push(counts.lineages);
      depletedShareTotal += measureBiomass(state.world, state.creatures)
        .depletedOccupiedTileShare;
      depletedSampleCount++;
    }
    if (counts.population === 0) {
      extinctionTick = tick;
      break;
    }
  }

  return {
    candidateId: candidate.id,
    seed,
    ticksRequested,
    ticksProcessed,
    populationSeries,
    speciesSeries,
    lineageSeries,
    maximumPopulation,
    extinctionTick,
    mutationCount: state.events.filter((event) => event.type === 'mutation').length,
    speciationCount: state.events.filter((event) => event.type === 'speciation').length,
    meanDepletedOccupiedTileShare: round(
      depletedSampleCount > 0 ? depletedShareTotal / depletedSampleCount : 0
    ),
    meanTickTimeMs: suite.measureRuntime && ticksProcessed > 0
      ? round(runtimeTotal / ticksProcessed)
      : null,
  };
}

function mean(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function scorePopulationCalibration(
  outcomes: PopulationCalibrationOutcome[],
  maximumPopulation: number
): PopulationCalibrationObjectives {
  const tickCount = Math.max(1, ...outcomes.map((outcome) => outcome.ticksRequested));
  const extinctionRisk = mean(outcomes.map((outcome) => outcome.extinctionTick === null
    ? 0
    : 1 - outcome.extinctionTick / Math.max(1, outcome.ticksRequested)));
  const populationOverflowRisk = mean(outcomes.map((outcome) =>
    Math.max(0, outcome.maximumPopulation - maximumPopulation) / Math.max(1, maximumPopulation)));
  const diversityRetention = mean(outcomes.map((outcome) => {
    const initial = outcome.speciesSeries[0] ?? 0;
    const final = outcome.speciesSeries[outcome.speciesSeries.length - 1] ?? 0;
    return initial > 0 ? final / initial : 0;
  }));
  const evolutionaryActivity = mean(outcomes.map((outcome) =>
    (outcome.mutationCount + outcome.speciationCount * 5) / tickCount));
  const trajectoryVariation = mean(outcomes.map((outcome) => {
    if (outcome.populationSeries.length < 2) return 0;
    let movement = 0;
    for (let index = 1; index < outcome.populationSeries.length; index++) {
      movement += Math.abs(outcome.populationSeries[index] - outcome.populationSeries[index - 1]);
    }
    return movement / Math.max(1, outcome.maximumPopulation * (outcome.populationSeries.length - 1));
  }));
  const measuredRuntime = outcomes
    .map((outcome) => outcome.meanTickTimeMs)
    .filter((value): value is number => value !== null);
  return {
    extinctionRisk: round(extinctionRisk),
    populationOverflowRisk: round(populationOverflowRisk),
    diversityRetention: round(diversityRetention),
    evolutionaryActivity: round(evolutionaryActivity),
    trajectoryVariation: round(trajectoryVariation),
    biomassDepletion: round(mean(outcomes.map((outcome) => outcome.meanDepletedOccupiedTileShare))),
    runtimeCostMs: measuredRuntime.length > 0 ? round(mean(measuredRuntime)) : null,
  };
}

export function evaluatePopulationCalibrationGates(
  outcomes: PopulationCalibrationOutcome[],
  objectives: PopulationCalibrationObjectives,
  gates: PopulationCalibrationGates = DEFAULT_GATES
): string[] {
  const failures: string[] = [];
  const survivalShare = outcomes.length > 0
    ? outcomes.filter((outcome) => outcome.extinctionTick === null).length / outcomes.length
    : 0;
  if (survivalShare < gates.minimumSurvivalShare) failures.push('survival-share');
  if (Math.max(0, ...outcomes.map((outcome) => outcome.maximumPopulation)) > gates.maximumPopulation) {
    failures.push('population-ceiling');
  }
  if (objectives.evolutionaryActivity < gates.minimumEvolutionaryActivity) {
    failures.push('evolutionary-stagnation');
  }
  if (objectives.evolutionaryActivity > gates.maximumEvolutionaryActivity) {
    failures.push('evolutionary-runaway');
  }
  if (
    gates.maximumMeanTickTimeMs !== undefined &&
    objectives.runtimeCostMs !== null &&
    objectives.runtimeCostMs > gates.maximumMeanTickTimeMs
  ) failures.push('runtime-budget');
  return failures;
}

const minimize = new Set<keyof PopulationCalibrationObjectives>([
  'extinctionRisk', 'populationOverflowRisk', 'biomassDepletion', 'runtimeCostMs',
]);

function dominates(
  candidate: PopulationCalibrationObjectives,
  other: PopulationCalibrationObjectives
): boolean {
  const keys = Object.keys(candidate) as Array<keyof PopulationCalibrationObjectives>;
  let strictlyBetter = false;
  for (const key of keys) {
    if (candidate[key] === null || other[key] === null) continue;
    const candidateValue = candidate[key] as number;
    const otherValue = other[key] as number;
    const noWorse = minimize.has(key) ? candidateValue <= otherValue : candidateValue >= otherValue;
    const better = minimize.has(key) ? candidateValue < otherValue : candidateValue > otherValue;
    if (!noWorse) return false;
    if (better) strictlyBetter = true;
  }
  return strictlyBetter;
}

export function buildPopulationCalibrationReport(
  candidates: PopulationCalibrationCandidate[],
  suite: PopulationCalibrationSuite,
  gates: PopulationCalibrationGates = DEFAULT_GATES
): PopulationCalibrationReport {
  const normalizedSuite = {
    seeds: [...suite.seeds],
    ticks: Math.max(0, Math.floor(suite.ticks)),
    sampleInterval: Math.max(1, Math.floor(suite.sampleInterval)),
    ...(suite.maximumWallTimeMs === undefined ? {} : { maximumWallTimeMs: suite.maximumWallTimeMs }),
    measureRuntime: suite.measureRuntime ?? false,
  };
  const outcomes = candidates.flatMap((candidate) => normalizedSuite.seeds.map((seed) =>
    runPopulationCalibrationOutcome(candidate, seed, normalizedSuite)));
  const provisional = candidates.map((candidate) => {
    const candidateOutcomes = outcomes.filter((outcome) => outcome.candidateId === candidate.id);
    const objectives = scorePopulationCalibration(candidateOutcomes, gates.maximumPopulation);
    return {
      candidateId: candidate.id,
      objectives,
      hardGateFailures: evaluatePopulationCalibrationGates(candidateOutcomes, objectives, gates),
    };
  });
  const paretoCandidateIds = provisional
    .filter((candidate) => !provisional.some((other) =>
      other.candidateId !== candidate.candidateId && dominates(other.objectives, candidate.objectives)))
    .map((candidate) => candidate.candidateId)
    .sort();
  const ordered = [...provisional].sort((a, b) =>
    a.hardGateFailures.length - b.hardGateFailures.length ||
    a.objectives.extinctionRisk - b.objectives.extinctionRisk ||
    a.objectives.populationOverflowRisk - b.objectives.populationOverflowRisk ||
    b.objectives.diversityRetention - a.objectives.diversityRetention ||
    b.objectives.evolutionaryActivity - a.objectives.evolutionaryActivity ||
    b.objectives.trajectoryVariation - a.objectives.trajectoryVariation ||
    a.candidateId.localeCompare(b.candidateId));
  const ranks = new Map(ordered.map((candidate, index) => [candidate.candidateId, index + 1]));
  return {
    suite: normalizedSuite,
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      constants: { ...candidate.constants },
    })),
    outcomes,
    assessments: provisional.map((candidate) => ({
      ...candidate,
      paretoOptimal: paretoCandidateIds.includes(candidate.candidateId),
      rank: ranks.get(candidate.candidateId)!,
    })).sort((a, b) => a.rank - b.rank),
    paretoCandidateIds,
  };
}

/** Stable serializer for reports generated without wall-clock measurement. */
export function serializePopulationCalibrationReport(
  report: PopulationCalibrationReport
): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
