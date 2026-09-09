/**
 * Scenario Framework
 *
 * Defines authored ecological situations with clear objectives, rules, and scoring.
 * Scenarios support resilience, recovery, adaptation, observation, and forecasting goals
 * while preserving open-ended sandbox play.
 *
 * A scenario consists of:
 * - A world recipe (seed, initial settings, starting species)
 * - Allowed interventions (what players can and cannot change)
 * - Objectives (what to observe or achieve)
 * - Completion conditions (when the scenario ends)
 * - Scoring criteria (how to evaluate success)
 */

import type { WorldRecipe } from '../ui/worldRecipe';
import type { SimulationConstants } from '../utils/constants';
import type { EnergyStrategy } from '../utils/traits';

/**
 * Represents an objective or goal within a scenario.
 * Players can aim to observe, achieve, or avoid specific ecosystem states.
 */
export interface ScenarioObjective {
  id: string;
  title: string;
  description: string;
  type: 'observation' | 'resilience' | 'recovery' | 'adaptation' | 'forecasting';

  // For observation: what to watch for
  // For resilience: ecosystem metrics to maintain
  // For recovery: metrics to restore
  // For adaptation: trait changes to track
  // For forecasting: prediction to verify
  targetMetrics?: {
    speciesId?: string;
    metric: 'population' | 'traits' | 'lineages' | 'energy' | 'biodiversity' | 'stability';
    threshold?: number;
    direction?: 'increase' | 'decrease' | 'stable' | 'oscillate';
    within?: number; // ticks
  };
}

/**
 * Defines which world settings and interventions are allowed in a scenario.
 */
export interface ScenarioConstraints {
  // Cannot modify world dimensions
  lockedDimensions: boolean;

  // Which constants can be changed (empty array = no changes allowed)
  modifiableConstants: (keyof SimulationConstants)[];

  // Species introduction allowed?
  allowSpeciesIntroduction: boolean;

  // Creature placement/removal allowed?
  allowCreatureManipulation: boolean;

  // Resource injection allowed?
  allowResourceInjection: boolean;

  // Can species be removed/culled?
  allowSpeciesRemoval: boolean;
}

/**
 * Defines when and how a scenario ends.
 */
export interface ScenarioCompletionCondition {
  // Maximum ticks to simulate
  maxTicks: number;

  // Automatic completion trigger
  trigger?: {
    type: 'extinction' | 'objective_met' | 'time_elapsed' | 'all_objectives_met';
    condition?: string; // For extensibility
  };

  // Fail condition (optional)
  failCondition?: {
    type: 'extinction' | 'threshold_breach' | 'time_limit';
    description?: string;
  };
}

/**
 * Scoring criteria for evaluating a scenario run.
 */
export interface ScenarioScoringCriteria {
  // Primary score: 0-100
  primaryMetric: {
    type: 'population' | 'biodiversity' | 'stability' | 'recovery' | 'adaptation' | 'forecastAccuracy';
    weight: number;
    target?: number;
  };

  // Secondary scores (evidence-based, not just final state)
  evidenceMetrics: {
    name: string;
    type: 'trait_change' | 'population_change' | 'extinction_recovery' | 'niche_specialization';
    weight: number;
  }[];

  // Trade-off awareness: reward balanced solutions
  tradeoffBonus?: {
    enabled: boolean;
    multiObjectiveBonus: number; // e.g., 1.1 for 1.1x
  };
}

/**
 * Complete scenario definition.
 * Immutable once created; used for reproducible runs.
 */
export interface Scenario {
  // Metadata
  id: string;
  version: number;
  title: string;
  description: string;
  difficulty: 'tutorial' | 'easy' | 'moderate' | 'hard' | 'expert';

  // World setup
  recipe: WorldRecipe;

  // Gameplay rules
  constraints: ScenarioConstraints;

  // Objectives and completion
  objectives: ScenarioObjective[];
  completionCondition: ScenarioCompletionCondition;

  // Scoring
  scoring: ScenarioScoringCriteria;

  // Authoring metadata
  author?: string;
  createdAt?: number; // Unix timestamp
  tags?: string[];

  // Validation
  validated: boolean;
  validationErrors?: string[];
}

/**
 * Result of a single scenario run.
 * Captured at completion for comparison and learning.
 */
export interface ScenarioResult {
  // Scenario identity
  scenarioId: string;
  scenarioVersion: number;

  // Run metadata
  runId: string; // Unique per run
  timestamp: number; // Unix timestamp
  playerId?: string; // For multi-player scenarios (future)

  // Performance
  finalTick: number;
  completionStatus: 'success' | 'failure' | 'abandoned';

  // Scores
  primaryScore: number; // 0-100
  evidenceScores: Record<string, number>;
  totalScore: number; // Weighted sum

  // Ecosystem state at completion
  finalStats: {
    populationBySpecies: Record<string, number>;
    biodiversity: number; // Species + lineage count
    averageEnergy: number;
    producerBiomass: number;
    totalExtinctions: number;
  };

  // Evidence captured
  objectivesMet: string[]; // IDs of completed objectives
  objectivesPartial: string[]; // IDs of partially completed objectives
  evidenceCollected: ScenarioEvidence[];

  // Key moments for replay
  keyMoments: {
    tick: number;
    description: string;
    speciesId?: string;
  }[];
}

/**
 * Represents a piece of evidence supporting scenario objectives.
 */
export interface ScenarioEvidence {
  type: 'adaptation' | 'recovery' | 'extinction' | 'lineage_persistence' | 'forecast_verification';
  tick: number;
  speciesId?: string;
  lineageId?: string;
  description: string;
  quantitativeValue?: number;
}

/**
 * Versioned summary for comparing multiple runs.
 */
export interface ScenarioResultSummary {
  scenarioId: string;
  runs: ScenarioResult[];

  // Aggregated statistics
  successRate: number; // % of runs that succeeded
  averagePrimaryScore: number;
  averageTotalScore: number;
  averageFinalTick: number;

  // Variance (for reproducibility checking)
  scoreVariance: number;
  tickVariance: number;

  // Common outcomes
  mostCommonOutcome: {
    completionStatus: string;
    frequency: number;
  };
}

/**
 * Validation result for scenario definitions.
 */
export interface ScenarioValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  diagnostics?: {
    recipeParseable: boolean;
    constraintsConsistent: boolean;
    objectivesFeasible: boolean;
    scoringWeightsSum: number;
  };
}

/**
 * Create a fresh scenario result for a run in progress.
 */
export function createScenarioResult(scenario: Scenario, runId: string): ScenarioResult {
  return {
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    runId,
    timestamp: Date.now(),
    finalTick: 0,
    completionStatus: 'abandoned',
    primaryScore: 0,
    evidenceScores: {},
    totalScore: 0,
    finalStats: {
      populationBySpecies: {},
      biodiversity: 0,
      averageEnergy: 0,
      producerBiomass: 0,
      totalExtinctions: 0,
    },
    objectivesMet: [],
    objectivesPartial: [],
    evidenceCollected: [],
    keyMoments: [],
  };
}
