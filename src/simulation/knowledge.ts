/**
 * Knowledge Progression System — Evidence Validation & KP Calculation
 *
 * Issue #177: Core logic for awarding Knowledge Points from evidence.
 * This module is deterministic: same evidence + configuration → same KP.
 */

import type { EcosystemDynamics } from '../ui/ecosystemHealth';
import { DEFAULT_KNOWLEDGE_CONSTANTS, type KnowledgeConstants } from '../constants/knowledge';

export type EvidenceType = 'adaptation' | 'causal_investigation' | 'lineage_discovery' | 'forecasting';

/** Base interface for all evidence types */
export interface EvidenceBase {
  id: string; // UUID or deterministic hash
  type: EvidenceType;
  world_seed: number;
  tick_discovered: number;
  player_notes: string;
  knowledge_points_awarded: number;
  signature_hash: string; // For duplication detection
}

export interface AdaptationEvidence extends EvidenceBase {
  type: 'adaptation';
  species_id: string;
  trait_name: string;
  trait_change: { from: number; to: number };
  frequency_percent: number;
  generations: number;
  environment_pressure: string;
  lineage_ids: string[];
}

export interface CausalInvestigationEvidence extends EvidenceBase {
  type: 'causal_investigation';
  intervention_tick: number;
  intervention_x: number;
  intervention_y: number;
  intervention_type: string; // "add_energy", "add_nutrients", etc.
  intervention_amount: number;
  baseline_snapshot: Record<string, number>;
  outcome_tick_10: Record<string, number>;
  outcome_tick_25: Record<string, number>;
  outcome_summary: string;
  player_prediction_before?: string;
  player_prediction_correct?: boolean;
}

export interface LineageDiscoveryEvidence extends EvidenceBase {
  type: 'lineage_discovery';
  lineage_id: string;
  species_id: string;
  founder_tick: number;
  duration_ticks: number;
  total_individuals: number;
  specialization_type: 'niche' | 'geographic' | 'trophic' | 'extinction' | null;
  specialization_description: string;
  milestone_ticks: number[];
  extinction_tick?: number;
  extinction_cause?: string;
}

export interface ForecastingEvidence extends EvidenceBase {
  type: 'forecasting';
  prediction_tick: number;
  prediction_statement: string;
  predicted_variable: string;
  predicted_value: number;
  predicted_tolerance: number;
  forecast_window_end: number;
  actual_value: number;
  accuracy_percent: number;
  confidence_level: 'high' | 'medium' | 'low';
  baseline_knowledge: string;
  player_reasoning?: string;
}

export type Evidence =
  | AdaptationEvidence
  | CausalInvestigationEvidence
  | LineageDiscoveryEvidence
  | ForecastingEvidence;

/**
 * Result of evidence validation
 */
export interface EvidenceValidationResult {
  valid: boolean;
  reason?: string;
  base_kp?: number;
}

/**
 * Result of KP calculation
 */
export interface KPCalculationResult {
  base_kp: number;
  context_multiplier: number;
  diversity_bonus: number;
  duplication_penalty: number;
  observation_depth_bonus: number;
  final_kp: number;
  breakdown: string;
}

/**
 * Deterministic FNV-1a hash function (browser-safe, pure JS)
 * Used for evidence signature hashing in duplication detection.
 */
function fnv1aHash(str: string): string {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619); // FNV prime
  }
  return Math.abs(hash).toString(16).substring(0, 16);
}

/**
 * Deterministically hash evidence signature for duplication detection
 */
export function hashEvidenceSignature(evidence: Evidence): string {
  let signature = '';

  switch (evidence.type) {
    case 'adaptation':
      signature = `${evidence.type}:${evidence.species_id}:${evidence.trait_name}:${evidence.environment_pressure}`;
      break;
    case 'causal_investigation':
      signature = `${evidence.type}:${evidence.intervention_x},${evidence.intervention_y}:${evidence.intervention_type}`;
      break;
    case 'lineage_discovery':
      signature = `${evidence.type}:${evidence.lineage_id}:${evidence.specialization_type}`;
      break;
    case 'forecasting':
      signature = `${evidence.type}:${evidence.predicted_variable}:${Math.round(evidence.predicted_value)}`;
      break;
  }

  // Create deterministic hash using FNV-1a (browser-safe)
  return fnv1aHash(signature);
}

/**
 * Validate evidence against ecological validity thresholds
 */
export function validateEvidence(
  evidence: Evidence,
  constants: KnowledgeConstants = DEFAULT_KNOWLEDGE_CONSTANTS
): EvidenceValidationResult {
  switch (evidence.type) {
    case 'adaptation':
      if (evidence.frequency_percent < constants.TRAIT_CHANGE_MIN_PERCENT) {
        return { valid: false, reason: `Trait change ${evidence.frequency_percent}% below minimum ${constants.TRAIT_CHANGE_MIN_PERCENT}%` };
      }
      if (evidence.generations < 2) {
        return { valid: false, reason: `Trait must persist across 2+ generations; found ${evidence.generations}` };
      }
      return { valid: true };

    case 'causal_investigation':
      // Check if outcome measurements show meaningful change in population
      // Both tick 10 and tick 25 must show sufficient change to be valid
      const baselinePopulation = evidence.baseline_snapshot['population'] ?? 0;
      const outcomePopulation10 = evidence.outcome_tick_10['population'] ?? 0;
      const outcomePopulation25 = evidence.outcome_tick_25['population'] ?? 0;

      const populationChange10 = Math.abs(outcomePopulation10 - baselinePopulation);
      const populationChange25 = Math.abs(outcomePopulation25 - baselinePopulation);

      const populationChangePercent10 = baselinePopulation > 0 ? (populationChange10 / baselinePopulation) * 100 : 0;
      const populationChangePercent25 = baselinePopulation > 0 ? (populationChange25 / baselinePopulation) * 100 : 0;

      // Require that the most recent outcome (tick 25) shows sufficient change
      if (populationChangePercent25 < constants.POPULATION_CHANGE_MIN_PERCENT) {
        return {
          valid: false,
          reason: `Outcome change ${populationChangePercent25.toFixed(1)}% below minimum ${constants.POPULATION_CHANGE_MIN_PERCENT}%`,
        };
      }
      return { valid: true };

    case 'lineage_discovery':
      if (evidence.total_individuals < constants.LINEAGE_MIN_SIZE) {
        return { valid: false, reason: `Lineage size ${evidence.total_individuals} below minimum ${constants.LINEAGE_MIN_SIZE}` };
      }
      if (evidence.duration_ticks < constants.LINEAGE_MIN_DURATION_TICKS) {
        return {
          valid: false,
          reason: `Lineage duration ${evidence.duration_ticks} ticks below minimum ${constants.LINEAGE_MIN_DURATION_TICKS}`,
        };
      }
      if (!evidence.specialization_type) {
        return { valid: false, reason: 'Lineage must show at least one specialization type' };
      }
      return { valid: true };

    case 'forecasting':
      if (evidence.predicted_tolerance > constants.FORECAST_TOLERANCE_MAX_PERCENT) {
        return {
          valid: false,
          reason: `Forecast tolerance ±${evidence.predicted_tolerance}% exceeds maximum ${constants.FORECAST_TOLERANCE_MAX_PERCENT}%`,
        };
      }
      if (evidence.accuracy_percent > 100) {
        return { valid: false, reason: 'Accuracy cannot exceed 100%' };
      }
      return { valid: true };

    default:
      return { valid: false, reason: 'Unknown evidence type' };
  }
}

/**
 * Calculate context multiplier based on ecosystem state
 * Symmetric: all three strategies (order, chaos, exploration) get equal 1.1× bonus
 */
function calculateContextMultiplier(
  dynamics: EcosystemDynamics | null,
  constants: KnowledgeConstants = DEFAULT_KNOWLEDGE_CONSTANTS
): number {
  if (!dynamics) {
    return constants.CONTEXT_BASELINE_MULTIPLIER;
  }

  const { order, chaos, exploration } = dynamics;

  // Check if any strategy is dominant (meets bonus threshold)
  if (
    order.score >= constants.STRATEGY_BONUS_THRESHOLD ||
    chaos.score >= constants.STRATEGY_BONUS_THRESHOLD ||
    exploration.score >= constants.STRATEGY_BONUS_THRESHOLD
  ) {
    return constants.STRATEGY_BONUS_MULTIPLIER;
  }

  return constants.CONTEXT_BASELINE_MULTIPLIER;
}

/**
 * Calculate diversity bonus based on multi-lineage and multi-role evidence
 */
function calculateDiversityBonus(
  evidence: Evidence,
  tracked_lineages_count: number = 0,
  constants: KnowledgeConstants = DEFAULT_KNOWLEDGE_CONSTANTS
): number {
  let bonus = 1.0;

  // Lineage tracking bonus
  if (tracked_lineages_count >= 3) {
    bonus *= constants.LINEAGE_TRACKING_BONUS;
  }

  // Multi-role bonus (only applicable for certain evidence types)
  if (evidence.type === 'causal_investigation') {
    // In future, detect if intervention affects multiple trophic levels
    // For now, baseline
  }

  return bonus;
}

/**
 * Calculate duplication penalty based on prior evidence
 * Returns multiplier (1.0 = no penalty)
 */
function calculateDuplicationPenalty(
  evidence: Evidence,
  prior_evidence: Evidence[],
  current_tick: number,
  constants: KnowledgeConstants = DEFAULT_KNOWLEDGE_CONSTANTS
): number {
  const current_hash = hashEvidenceSignature(evidence);

  // Find prior evidence with same or similar signature
  for (const prior of prior_evidence) {
    if (prior.type !== evidence.type) continue;

    // Recompute prior's hash to ensure consistency (always use hashEvidenceSignature)
    const prior_hash = hashEvidenceSignature(prior);
    const ticks_since_prior = current_tick - prior.tick_discovered;

    // Exact signature match
    if (prior_hash === current_hash) {
      if (ticks_since_prior < constants.NEAR_IDENTICAL_WINDOW_TICKS) {
        return constants.NEAR_IDENTICAL_PENALTY_PERCENT;
      }
      if (ticks_since_prior < constants.DUPLICATION_WINDOW_TICKS) {
        return constants.DUPLICATION_PENALTY_PERCENT;
      }
    }
  }

  return 1.0; // No penalty
}

/**
 * Calculate observation depth bonus for repeated observation types in session
 */
function calculateObservationDepthBonus(
  evidence: Evidence,
  prior_evidence: Evidence[],
  constants: KnowledgeConstants = DEFAULT_KNOWLEDGE_CONSTANTS
): number {
  const same_type_count = prior_evidence.filter((e) => e.type === evidence.type).length + 1;

  if (same_type_count >= 3) {
    return 1.0 + constants.OBSERVATION_DEPTH_BONUS;
  }

  return 1.0;
}

/**
 * Main KP calculation function
 * Deterministic: same evidence + configuration → same KP
 */
export function calculateKnowledgePoints(
  evidence: Evidence,
  prior_evidence: Evidence[] = [],
  current_tick: number,
  ecosystem_dynamics: EcosystemDynamics | null = null,
  tracked_lineages_count: number = 0,
  constants: KnowledgeConstants = DEFAULT_KNOWLEDGE_CONSTANTS
): KPCalculationResult {
  // Validate evidence first
  const validation = validateEvidence(evidence, constants);
  if (!validation.valid) {
    return {
      base_kp: 0,
      context_multiplier: 0,
      diversity_bonus: 1.0,
      duplication_penalty: 1.0,
      observation_depth_bonus: 1.0,
      final_kp: 0,
      breakdown: `Invalid: ${validation.reason}`,
    };
  }

  // Determine base KP by evidence type
  let base_kp = 0;
  switch (evidence.type) {
    case 'adaptation':
      base_kp = constants.ADAPTATION_BASE_KP;
      break;
    case 'causal_investigation':
      base_kp = constants.INVESTIGATION_BASE_KP;
      break;
    case 'lineage_discovery':
      // Lineage gets duration bonus
      const duration_bonus = Math.min(
        (evidence.duration_ticks / 100) * constants.LINEAGE_DURATION_BONUS_PER_100_TICKS,
        constants.LINEAGE_DURATION_MAX_BONUS
      );
      base_kp = constants.LINEAGE_BASE_KP + duration_bonus;

      // Add specialization bonus
      switch (evidence.specialization_type) {
        case 'niche':
          base_kp += constants.LINEAGE_NICHE_BONUS;
          break;
        case 'geographic':
          base_kp += constants.LINEAGE_GEOGRAPHIC_BONUS;
          break;
        case 'trophic':
          base_kp += constants.LINEAGE_TROPHIC_BONUS;
          break;
        case 'extinction':
          base_kp += constants.LINEAGE_EXTINCTION_BONUS;
          break;
      }
      break;
    case 'forecasting':
      base_kp = constants.FORECASTING_BASE_KP;
      // Accuracy-based adjustment
      if (evidence.accuracy_percent >= 95) {
        base_kp = Math.round(base_kp * 1.3); // Excellent prediction
      } else if (evidence.accuracy_percent >= 80) {
        base_kp = Math.round(base_kp * 1.15); // Good prediction
      }
      break;
  }

  // Calculate multipliers
  const context_multiplier = calculateContextMultiplier(ecosystem_dynamics, constants);
  const diversity_bonus = calculateDiversityBonus(evidence, tracked_lineages_count, constants);
  const duplication_penalty = calculateDuplicationPenalty(evidence, prior_evidence, current_tick, constants);
  const observation_depth_bonus = calculateObservationDepthBonus(evidence, prior_evidence, constants);

  // Apply formula: KP = Base × Context × Diversity × (1 − Duplication) × DepthBonus
  const final_kp = Math.round(base_kp * context_multiplier * diversity_bonus * duplication_penalty * observation_depth_bonus);

  const breakdown = `Base ${base_kp} × Context ${context_multiplier.toFixed(2)} × Diversity ${diversity_bonus.toFixed(2)} × Duplication ${duplication_penalty.toFixed(2)} × Depth ${observation_depth_bonus.toFixed(2)} = ${final_kp} KP`;

  return {
    base_kp,
    context_multiplier,
    diversity_bonus,
    duplication_penalty,
    observation_depth_bonus,
    final_kp,
    breakdown,
  };
}
