/**
 * Knowledge Progression System Constants
 *
 * Issue #177: Progression system configuration for evidence-based knowledge rewards.
 * All values are tunable for playtesting.
 */

export interface KnowledgeConstants {
  // === Evidence Base KP Values (tunable per evidence type) ===
  /** Adaptation evidence: heritable trait change over generations (50–200 KP range) */
  ADAPTATION_BASE_KP: number;
  /** Causal investigation: intervention + measured outcome (75–150 KP range) */
  INVESTIGATION_BASE_KP: number;
  /** Lineage discovery: tracking founder → persistence/extinction (100 + duration bonus) */
  LINEAGE_BASE_KP: number;
  /** Successful forecasting: prediction + verification (150–300 KP range) */
  FORECASTING_BASE_KP: number;

  // === Unlock Thresholds (tier progression) ===
  UNLOCK_STABILITY_METER: number;
  UNLOCK_WATCHLIST: number;
  UNLOCK_EXPORT: number;
  UNLOCK_OVERLAYS: number;
  UNLOCK_BRANCH: number;
  UNLOCK_FREQUENCY_CHART: number;
  UNLOCK_FORECAST: number;
  UNLOCK_COMPARE: number;
  UNLOCK_SCENARIOS: number;
  UNLOCK_LIBRARY: number;

  // === Context Multiplier Thresholds ===
  /** Ecosystem score threshold for order/chaos/exploration strategies to qualify for bonus */
  STRATEGY_BONUS_THRESHOLD: number;
  /** Multiplier when strategy score meets threshold (order/chaos/exploration all get same bonus) */
  STRATEGY_BONUS_MULTIPLIER: number;
  /** Baseline context multiplier when no strategy is dominant */
  CONTEXT_BASELINE_MULTIPLIER: number;
  /** Observation depth bonus: applied when player documents >3 related observations */
  OBSERVATION_DEPTH_BONUS: number;

  // === Diversity & Multi-Role Bonuses ===
  /** Lineage tracking bonus: applies when tracking 3+ distinct lineages */
  LINEAGE_TRACKING_BONUS: number;
  /** Multi-role evidence bonus: herbivore + carnivore + decomposer in single observation */
  MULTIROLE_BONUS: number;

  // === Anti-Farming: Time Windows & Penalties ===
  /** Duplication detection window: observations within this many ticks are compared for farming */
  DUPLICATION_WINDOW_TICKS: number;
  /** Penalty multiplier for observations within duplication window */
  DUPLICATION_PENALTY_PERCENT: number;
  /** Stricter penalty for nearly-identical signatures within short time */
  NEAR_IDENTICAL_PENALTY_PERCENT: number;
  /** Time window for "nearly identical" detection */
  NEAR_IDENTICAL_WINDOW_TICKS: number;

  // === Anti-Farming: Ecological Validity Thresholds ===
  /** Minimum trait frequency change to count as adaptation (not noise) */
  TRAIT_CHANGE_MIN_PERCENT: number;
  /** Minimum population change to count as causal intervention effect */
  POPULATION_CHANGE_MIN_PERCENT: number;
  /** Minimum lineage size to count as "meaningful persistence" */
  LINEAGE_MIN_SIZE: number;
  /** Minimum lineage duration (ticks) to count as discovery */
  LINEAGE_MIN_DURATION_TICKS: number;
  /** Maximum forecast tolerance to be considered "reasonable prediction" */
  FORECAST_TOLERANCE_MAX_PERCENT: number;

  // === Diversity Requirement: Diminishing Returns ===
  /** How many observations of same type per session get full reward */
  OBSERVATIONS_FULL_REWARD_COUNT: number;
  /** KP multiplier for 2nd observation of same type in session */
  SECOND_OBSERVATION_MULTIPLIER: number;
  /** KP multiplier for 3rd observation of same type in session */
  THIRD_OBSERVATION_MULTIPLIER: number;
  /** KP multiplier for 4+ observations of same type (meta-awareness only) */
  SUBSEQUENT_OBSERVATION_MULTIPLIER: number;

  // === Lineage Discovery Scoring ===
  /** Base KP for lineage tracking */
  LINEAGE_TRACKING_BASE_KP: number;
  /** KP per 100 ticks of lineage duration (capped) */
  LINEAGE_DURATION_BONUS_PER_100_TICKS: number;
  /** Maximum KP for lineage duration bonus */
  LINEAGE_DURATION_MAX_BONUS: number;
  /** Specialization bonus: niche adaptation (highest) */
  LINEAGE_NICHE_BONUS: number;
  /** Specialization bonus: geographic clustering */
  LINEAGE_GEOGRAPHIC_BONUS: number;
  /** Specialization bonus: trophic role specialization */
  LINEAGE_TROPHIC_BONUS: number;
  /** Specialization bonus: extinction narrative */
  LINEAGE_EXTINCTION_BONUS: number;

  // === Manual Submission Rules ===
  /** Minimum ticks between re-submission of near-identical observations */
  MANUAL_SUBMISSION_MIN_DELAY_TICKS: number;
  /** Penalty if player references prior observation in notes */
  PRIOR_REFERENCE_PENALTY_PERCENT: number;

  // === Forecasting Rules ===
  /** Minimum forecast window (ticks) */
  FORECAST_WINDOW_MIN_TICKS: number;
  /** Maximum forecast window (ticks) */
  FORECAST_WINDOW_MAX_TICKS: number;
  /** Tolerance for verification (e.g., ±10% of prediction or ±10 individuals) */
  FORECAST_VERIFICATION_TOLERANCE: number;
  /** Penalty for forecasts made within this many ticks of similar forecast */
  FORECAST_SPAM_WINDOW_TICKS: number;
  /** Penalty multiplier for spam forecasts */
  FORECAST_SPAM_PENALTY_PERCENT: number;

  // === Storage & Limits ===
  /** Maximum localStorage size (bytes) for playerProgress */
  STORAGE_LIMIT_BYTES: number;
  /** Maximum evidence records before archiving */
  MAX_EVIDENCE_RECORDS: number;
}

/**
 * Default KnowledgeConstants for MVP/beta phase.
 * These are tuned for initial playtesting; adjust based on feedback.
 */
export const DEFAULT_KNOWLEDGE_CONSTANTS: KnowledgeConstants = {
  // Evidence base KP
  ADAPTATION_BASE_KP: 50,
  INVESTIGATION_BASE_KP: 75,
  LINEAGE_BASE_KP: 100,
  FORECASTING_BASE_KP: 150,

  // Unlock thresholds
  UNLOCK_STABILITY_METER: 100,
  UNLOCK_WATCHLIST: 100,
  UNLOCK_EXPORT: 150,
  UNLOCK_OVERLAYS: 200,
  UNLOCK_BRANCH: 250,
  UNLOCK_FREQUENCY_CHART: 300,
  UNLOCK_FORECAST: 350,
  UNLOCK_COMPARE: 400,
  UNLOCK_SCENARIOS: 500,
  UNLOCK_LIBRARY: 600,

  // Context multiplier
  STRATEGY_BONUS_THRESHOLD: 60,
  STRATEGY_BONUS_MULTIPLIER: 1.1,
  CONTEXT_BASELINE_MULTIPLIER: 1.0,
  OBSERVATION_DEPTH_BONUS: 0.2,

  // Diversity bonuses
  LINEAGE_TRACKING_BONUS: 1.1,
  MULTIROLE_BONUS: 1.2,

  // Anti-farming: time windows & penalties
  DUPLICATION_WINDOW_TICKS: 50,
  DUPLICATION_PENALTY_PERCENT: 0.6,
  NEAR_IDENTICAL_PENALTY_PERCENT: 0.8,
  NEAR_IDENTICAL_WINDOW_TICKS: 25,

  // Anti-farming: validity thresholds
  TRAIT_CHANGE_MIN_PERCENT: 2.0,
  POPULATION_CHANGE_MIN_PERCENT: 5.0,
  LINEAGE_MIN_SIZE: 2,
  LINEAGE_MIN_DURATION_TICKS: 10,
  FORECAST_TOLERANCE_MAX_PERCENT: 20,

  // Diversity requirement (diminishing returns)
  OBSERVATIONS_FULL_REWARD_COUNT: 3,
  SECOND_OBSERVATION_MULTIPLIER: 0.8,
  THIRD_OBSERVATION_MULTIPLIER: 0.6,
  SUBSEQUENT_OBSERVATION_MULTIPLIER: 0.2,

  // Lineage discovery scoring
  LINEAGE_TRACKING_BASE_KP: 100,
  LINEAGE_DURATION_BONUS_PER_100_TICKS: 10,
  LINEAGE_DURATION_MAX_BONUS: 400,
  LINEAGE_NICHE_BONUS: 150,
  LINEAGE_GEOGRAPHIC_BONUS: 100,
  LINEAGE_TROPHIC_BONUS: 75,
  LINEAGE_EXTINCTION_BONUS: 50,

  // Manual submission
  MANUAL_SUBMISSION_MIN_DELAY_TICKS: 50,
  PRIOR_REFERENCE_PENALTY_PERCENT: 0.5,

  // Forecasting
  FORECAST_WINDOW_MIN_TICKS: 10,
  FORECAST_WINDOW_MAX_TICKS: 40,
  FORECAST_VERIFICATION_TOLERANCE: 10,
  FORECAST_SPAM_WINDOW_TICKS: 50,
  FORECAST_SPAM_PENALTY_PERCENT: 0.4,

  // Storage
  STORAGE_LIMIT_BYTES: 5242880, // 5 MB
  MAX_EVIDENCE_RECORDS: 2000,
};
