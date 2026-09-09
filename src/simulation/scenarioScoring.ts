/**
 * Scenario Scoring
 *
 * Evaluates scenario runs based on evidence, ecosystem metrics, and trade-offs.
 * Focuses on understanding and prediction, not just final population counts.
 */

import type { Scenario, ScenarioResult, ScenarioEvidence, ScenarioResultSummary } from './scenario';
import type { WorldSnapshot } from '../state/store';

/**
 * Compute ecosystem metrics from a world snapshot.
 */
export interface EcosystemMetrics {
  populationCount: number;
  speciesCount: number;
  lineageCount: number;
  biodiversity: number; // species + lineages
  averageEnergy: number;
  totalEnergy: number;
  producerBiomass: number;
  stability: number; // 0-1, how stable populations are
  adaptationRate: number; // 0-1, trait change rate
}

/**
 * Calculate ecosystem metrics from a world snapshot.
 */
export function calculateEcosystemMetrics(world: WorldSnapshot | null): EcosystemMetrics {
  const metrics: EcosystemMetrics = {
    populationCount: 0,
    speciesCount: 0,
    lineageCount: 0,
    biodiversity: 0,
    averageEnergy: 0,
    totalEnergy: 0,
    producerBiomass: 0,
    stability: 0,
    adaptationRate: 0,
  };

  if (!world) return metrics;

  // Count living creatures
  const living = world.creatures.filter((c) => c.lifecycleState === 'alive');
  metrics.populationCount = living.length;

  // Count unique species and lineages
  const speciesSet = new Set<string>();
  const lineageSet = new Set<string>();
  for (const creature of living) {
    speciesSet.add(creature.speciesId);
    lineageSet.add(creature.lineageId);
  }
  metrics.speciesCount = speciesSet.size;
  metrics.lineageCount = lineageSet.size;
  metrics.biodiversity = speciesSet.size + lineageSet.size;

  // Energy calculations
  if (living.length > 0) {
    metrics.totalEnergy = living.reduce((sum, c) => sum + c.energy, 0);
    metrics.averageEnergy = metrics.totalEnergy / living.length;
  }

  // Producer biomass
  for (const cell of world.cells) {
    metrics.producerBiomass += cell.producerBiomass;
  }

  // Stability is inverse of population variance (simplified)
  if (living.length > 1) {
    const energies = living.map((c) => c.energy);
    const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
    const variance = energies.reduce((sum, e) => sum + (e - mean) ** 2, 0) / energies.length;
    // Normalize to 0-1: lower variance = higher stability
    metrics.stability = Math.max(0, 1 - variance / (mean ** 2 + 1));
  }

  return metrics;
}

/**
 * Score a primary metric (biodiversity, population, stability, etc.)
 */
export function scorePrimaryMetric(
  metricType: string,
  metricValue: number,
  targetValue: number | undefined
): number {
  // Clamp score to 0-100
  let score = 0;

  switch (metricType) {
    case 'biodiversity': {
      // Target biodiversity, scale: 0 species = 0%, target = 100%
      if (!targetValue) targetValue = 3;
      score = Math.min(100, (metricValue / targetValue) * 100);
      break;
    }
    case 'population': {
      // Target population
      if (!targetValue) targetValue = 10;
      score = Math.min(100, (metricValue / targetValue) * 100);
      break;
    }
    case 'stability': {
      // Stability is already 0-1, scale to 0-100
      score = metricValue * 100;
      break;
    }
    case 'recovery': {
      // Recovery: from 0 back to target
      if (!targetValue) targetValue = 50;
      score = Math.min(100, (metricValue / targetValue) * 100);
      break;
    }
    case 'adaptation': {
      // Adaptation: how much traits changed
      if (!targetValue) targetValue = 0.3; // 30% trait change
      score = Math.min(100, (metricValue / targetValue) * 100);
      break;
    }
    case 'forecastAccuracy': {
      // Forecast: 100% = perfect, scale down from there
      // Assume metricValue is 0-1 (percentage accuracy)
      score = Math.min(100, metricValue * 100);
      break;
    }
    default:
      score = 50; // Default neutral score
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Score evidence metrics based on observations captured.
 */
export function scoreEvidenceMetrics(
  evidence: ScenarioEvidence[],
  weights: { name: string; type: string; weight: number }[]
): Record<string, number> {
  const scores: Record<string, number> = {};

  for (const metric of weights) {
    const relevant = evidence.filter((e) => e.type === metric.type);
    // Each piece of evidence contributes to the score
    let score = Math.min(100, relevant.length * 25);
    scores[metric.name] = score * metric.weight;
  }

  return scores;
}

/**
 * Calculate total scenario score from primary, evidence, and trade-off scores.
 */
export function calculateScenarioScore(result: ScenarioResult, scenario: Scenario): number {
  const { scoring } = scenario;

  // Primary score (already calculated and stored)
  let totalScore = result.primaryScore * (scoring.primaryMetric.weight || 1.0);

  // Evidence scores
  for (const [metricName, score] of Object.entries(result.evidenceScores)) {
    totalScore += score;
  }

  // Trade-off bonus: reward multiple completed objectives
  if (scoring.tradeoffBonus?.enabled && result.objectivesMet.length > 1) {
    const bonus = scoring.tradeoffBonus.multiObjectiveBonus;
    totalScore *= bonus;
  }

  // Clamp to 0-100 (or higher if bonuses apply)
  return Math.max(0, totalScore);
}

/**
 * Record evidence captured during a run.
 */
export function recordEvidence(
  evidence: ScenarioEvidence[],
  tick: number,
  type: ScenarioEvidence['type'],
  speciesId: string | undefined,
  description: string,
  quantitativeValue?: number
): ScenarioEvidence[] {
  return [
    ...evidence,
    {
      type,
      tick,
      speciesId,
      description,
      quantitativeValue,
    },
  ];
}

/**
 * Compute summary statistics for multiple runs of the same scenario.
 */
export function summarizeScenarioRuns(
  scenarioId: string,
  runs: ScenarioResult[]
): ScenarioResultSummary {
  const filtered = runs.filter((r) => r.scenarioId === scenarioId);

  if (filtered.length === 0) {
    return {
      scenarioId,
      runs: [],
      successRate: 0,
      averagePrimaryScore: 0,
      averageTotalScore: 0,
      averageFinalTick: 0,
      scoreVariance: 0,
      tickVariance: 0,
      mostCommonOutcome: {
        completionStatus: 'none',
        frequency: 0,
      },
    };
  }

  // Aggregate scores
  const primaryScores = filtered.map((r) => r.primaryScore);
  const totalScores = filtered.map((r) => r.totalScore);
  const finalTicks = filtered.map((r) => r.finalTick);

  const avgPrimary = primaryScores.reduce((a, b) => a + b, 0) / primaryScores.length;
  const avgTotal = totalScores.reduce((a, b) => a + b, 0) / totalScores.length;
  const avgTick = finalTicks.reduce((a, b) => a + b, 0) / finalTicks.length;

  // Variance
  const primaryVariance = primaryScores.reduce((sum, s) => sum + (s - avgPrimary) ** 2, 0) / primaryScores.length;
  const tickVariance = finalTicks.reduce((sum, t) => sum + (t - avgTick) ** 2, 0) / finalTicks.length;

  // Success rate
  const successCount = filtered.filter((r) => r.completionStatus === 'success').length;
  const successRate = successCount / filtered.length;

  // Most common outcome
  const outcomes = filtered.map((r) => r.completionStatus);
  const outcomeCounts = outcomes.reduce((acc, outcome) => {
    acc[outcome] = (acc[outcome] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const mostCommon = Object.entries(outcomeCounts).sort(([, a], [, b]) => b - a)[0];

  return {
    scenarioId,
    runs: filtered,
    successRate,
    averagePrimaryScore: avgPrimary,
    averageTotalScore: avgTotal,
    averageFinalTick: avgTick,
    scoreVariance: primaryVariance,
    tickVariance,
    mostCommonOutcome: {
      completionStatus: mostCommon[0],
      frequency: mostCommon[1],
    },
  };
}

/**
 * Check if a scenario run shows consistent results (reproducibility check).
 */
export function checkReproducibility(
  results: ScenarioResult[],
  tolerance: { scoreDelta: number; tickDelta: number } = { scoreDelta: 5, tickDelta: 10 }
): {
  isReproducible: boolean;
  variance: number;
  diagnostics: string[];
} {
  if (results.length < 2) {
    return {
      isReproducible: true,
      variance: 0,
      diagnostics: ['Not enough runs to verify reproducibility'],
    };
  }

  const diagnostics: string[] = [];

  // Check score consistency
  const scores = results.map((r) => r.totalScore);
  const scoreVariance = scores.reduce((sum, s) => sum + (s - scores[0]) ** 2, 0) / scores.length;

  if (Math.sqrt(scoreVariance) > tolerance.scoreDelta) {
    diagnostics.push(
      `Score variance ${Math.sqrt(scoreVariance).toFixed(2)} exceeds tolerance ${tolerance.scoreDelta}`
    );
  }

  // Check tick consistency
  const ticks = results.map((r) => r.finalTick);
  const tickVariance = ticks.reduce((sum, t) => sum + (t - ticks[0]) ** 2, 0) / ticks.length;

  if (Math.sqrt(tickVariance) > tolerance.tickDelta) {
    diagnostics.push(
      `Tick variance ${Math.sqrt(tickVariance).toFixed(2)} exceeds tolerance ${tolerance.tickDelta}`
    );
  }

  return {
    isReproducible: diagnostics.length === 0,
    variance: Math.sqrt(scoreVariance),
    diagnostics,
  };
}
