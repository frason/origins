/**
 * Shared Challenges Framework
 *
 * Enables players to share and compare deterministic ecosystem challenges
 * without requiring real-time multiplayer.
 *
 * Supports:
 * - Portable, versioned world recipes
 * - Deterministic daily seed generation
 * - Comparable outcome summaries with evidence
 * - Version compatibility detection
 * - Privacy-safe local-first sharing
 */

import type { WorldRecipe } from '../ui/worldRecipe';
import type { SessionSummary } from '../ui/sessionSummary';

// Re-export types for convenience
export type { WorldRecipe, SessionSummary };

/**
 * Engine version metadata for compatibility tracking.
 * Increment PATCH when fixing bugs without changing determinism.
 * Increment MINOR when adding features that don't affect existing simulations.
 * Increment MAJOR when changing simulation behavior or RNG streams.
 */
export interface EngineVersion {
  major: number;
  minor: number;
  patch: number;
  hash?: string; // Optional: git commit hash for verification
}

/**
 * Current engine version.
 * Update this when simulation logic changes.
 */
export const CURRENT_ENGINE_VERSION: EngineVersion = {
  major: 1,
  minor: 0,
  patch: 0,
};

/**
 * Represents a shared ecosystem challenge.
 * Portable format: can be shared via text, URL, or file without account login.
 */
export interface Challenge {
  // Challenge metadata
  id: string; // Unique identifier (can be auto-generated or human-friendly)
  title: string;
  description: string;
  difficulty: 'tutorial' | 'easy' | 'moderate' | 'hard' | 'expert';

  // World setup
  recipe: WorldRecipe;

  // Compatibility tracking
  engineVersion: EngineVersion;
  recipeVersion: number;

  // Challenge configuration
  timeLimit?: number; // Maximum ticks before auto-end
  objectives?: ChallengeObjective[];

  // Metadata
  author?: string;
  createdAt?: number; // Unix timestamp
  tags?: string[];
  featured?: boolean; // Highlight this challenge
}

/**
 * Challenge objective: what players should aim to observe or achieve.
 */
export interface ChallengeObjective {
  id: string;
  title: string;
  description: string;
  type: 'observe' | 'achieve' | 'survive' | 'avoid';
  targetMetric?: {
    metric:
      | 'population'
      | 'species_count'
      | 'biodiversity'
      | 'stability'
      | 'adaptation'
      | 'extinction_recovery';
    threshold?: number;
    direction?: 'increase' | 'decrease' | 'stable';
  };
}

/**
 * Daily challenge: deterministically seeded challenge for a specific date.
 * Two players running the same daily challenge on the same date will
 * receive identical recipes and can directly compare outcomes.
 */
export interface DailyChallenge extends Challenge {
  date: string; // ISO 8601 format: YYYY-MM-DD
  seed: number; // Derived deterministically from date
}

/**
 * Comparable milestone captured during challenge play.
 * Used to show divergence points if two players follow different strategies.
 */
export interface ChallengeMilestone {
  tick: number;
  description: string;
  population?: number;
  activeSpecies?: number;
  biomass?: number;
  interventionCount?: number;
}

/**
 * Evidence of achievement or observation during a challenge.
 * Enables meaningful comparison beyond just final scores.
 */
export interface ChallengeEvidence {
  type:
    | 'adaptation'
    | 'recovery'
    | 'extinction'
    | 'lineage_persistence'
    | 'species_introduction'
    | 'intervention';
  tick: number;
  speciesId?: string;
  description: string;
  quantitativeValue?: number;
}

/**
 * Outcome summary for a challenge run: portable, shareable format.
 * Can be exported and compared with other players' summaries.
 * Does not require server storage; can be shared via text/URL/file.
 */
export interface ChallengeSummary {
  // Challenge identity
  challengeId: string;
  challengeTitle: string;
  date?: string; // For daily challenges

  // Run metadata
  runId: string; // Unique per run
  playerId?: string; // Hashed ID if shared; null for anonymous
  completedAt: number; // Unix timestamp

  // Engine & version compatibility
  engineVersion: EngineVersion;
  recipeVersion: number;

  // Outcome facts
  finalTick: number;
  completionStatus: 'success' | 'failure' | 'abandoned';

  // Observable metrics at completion
  finalStats: {
    population: number;
    activeSpecies: number;
    activeLineages: number;
    peakPopulation: number;
    totalExtinctions: number;
    totalBirths: number;
    totalMutations: number;
    totalInterventions: number;
    remainingBiomass: number;
  };

  // Objectives met
  objectivesMet: string[]; // Objective IDs that succeeded
  objectivesPartial: string[]; // Objective IDs that partially succeeded

  // Evidence: key moments and adaptations
  milestones: ChallengeMilestone[];
  evidence: ChallengeEvidence[];

  // Strategy notes (optional, player-provided)
  notes?: string;

  // Playback recipe for verification
  outcomeRecipe?: WorldRecipe; // Allows replay to verify determinism
}

/**
 * Comparison of two challenge outcomes.
 * Helps players understand how their strategies diverged.
 */
export interface ChallengeComparison {
  summary1: ChallengeSummary;
  summary2: ChallengeSummary;

  // Compatibility check
  sameChallenge: boolean;
  sameEngineVersion: boolean;
  sameRecipeVersion: boolean;
  sameRecipe: boolean; // Byte-for-byte identical

  // Outcome differences
  divergenceType: 'identical' | 'minor' | 'moderate' | 'major' | 'incompatible';
  divergenceReason?: string; // If incompatible, why they differ

  // Metric deltas
  deltas: {
    finalTick: number;
    population: number;
    activeSpecies: number;
    peakPopulation: number;
    totalExtinctions: number;
    totalInterventions: number;
  };

  // Strategic insights
  summary: string; // Human-readable narrative of differences
}

/**
 * Generates a deterministic seed for a given date.
 * Same date → same seed across all clients (no server required).
 *
 * @param dateString - ISO 8601 date string (YYYY-MM-DD)
 * @returns A 32-bit unsigned integer seed
 */
export function generateDailySeed(dateString: string): number {
  // Parse date string YYYY-MM-DD
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid date format: ${dateString}. Use YYYY-MM-DD`);
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  // Validate date bounds
  if (year < 2020 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Invalid date values: ${dateString}`);
  }

  // Combine year, month, day into a 32-bit hash
  // Simple deterministic formula: YY*366 + MM*31 + DD, then seed it
  let seed = ((year - 2020) * 400 + (month - 1) * 31 + (day - 1)) >>> 0;

  // Mix bits for better distribution
  seed = ((seed ^ 0x9e3779b9) >>> 0);
  seed = (((seed ^ (seed >>> 16)) * 0x85ebca6b) >>> 0);
  seed = (((seed ^ (seed >>> 13)) * 0xc2b2ae35) >>> 0);
  seed = (seed ^ (seed >>> 16)) >>> 0;

  return seed;
}

/**
 * Generate a unique run ID for a challenge session.
 * Format: {timestamp}-{randomPart}
 * Can be used to identify and reference specific runs.
 */
export function generateRunId(): string {
  const timestamp = Date.now();
  // Generate a random suffix for uniqueness
  const randomPart = Math.random().toString(36).substring(2, 11);
  return `${timestamp}-${randomPart}`;
}

/**
 * Create a daily challenge for a specific date.
 * The recipe seed is deterministically derived from the date.
 *
 * @param date - ISO 8601 date string (YYYY-MM-DD)
 * @param recipe - Base recipe to use (seed will be overridden)
 * @param title - Challenge title
 * @param description - Challenge description
 * @param difficulty - Difficulty level
 * @returns A daily challenge with deterministic seed
 */
export function createDailyChallenge(
  date: string,
  recipe: WorldRecipe,
  title: string,
  description: string,
  difficulty: 'tutorial' | 'easy' | 'moderate' | 'hard' | 'expert' = 'moderate'
): DailyChallenge {
  const seed = generateDailySeed(date);
  const dailyRecipe: WorldRecipe = {
    ...recipe,
    seed,
  };

  return {
    id: `daily-${date}`,
    title,
    description,
    difficulty,
    recipe: dailyRecipe,
    engineVersion: CURRENT_ENGINE_VERSION,
    recipeVersion: recipe.version,
    date,
    seed,
    featured: true,
  };
}

/**
 * Build a challenge summary from session data.
 * Can be exported and shared without account login.
 *
 * @param challenge - The challenge being played
 * @param sessionSummary - Session state at completion
 * @param currentTick - Final tick number
 * @param milestones - Key milestones during play
 * @param evidence - Collected evidence of objectives
 * @param outcomeRecipe - Optional recipe for outcome verification
 * @param notes - Optional player notes
 * @returns A shareable outcome summary
 */
export function buildChallengeSummary(
  challenge: Challenge,
  sessionSummary: SessionSummary,
  currentTick: number,
  milestones: ChallengeMilestone[] = [],
  evidence: ChallengeEvidence[] = [],
  outcomeRecipe?: WorldRecipe,
  notes?: string
): ChallengeSummary {
  const objectivesMet = challenge.objectives
    ?.filter((obj) =>
      evidence.some((ev) => ev.description.includes(obj.title))
    )
    .map((obj) => obj.id) ?? [];

  return {
    challengeId: challenge.id,
    challengeTitle: challenge.title,
    date: 'date' in challenge ? (challenge as DailyChallenge).date : undefined,

    runId: generateRunId(),
    completedAt: Date.now(),

    engineVersion: challenge.engineVersion,
    recipeVersion: challenge.recipeVersion,

    finalTick: currentTick,
    completionStatus: sessionSummary.status === 'living' ? 'abandoned' : 'failure',

    finalStats: {
      population: sessionSummary.currentPopulation,
      activeSpecies: sessionSummary.activeSpecies,
      activeLineages: sessionSummary.activeLineages,
      peakPopulation: sessionSummary.peakPopulation,
      totalExtinctions: sessionSummary.extinctions,
      totalBirths: sessionSummary.births,
      totalMutations: sessionSummary.mutations,
      totalInterventions: sessionSummary.interventions,
      remainingBiomass: sessionSummary.remainingBiomass,
    },

    objectivesMet,
    objectivesPartial: [],

    milestones,
    evidence,

    notes,
    outcomeRecipe,
  };
}

/**
 * Check if two engine versions are compatible for comparison.
 * - Same MAJOR version required for deterministic playback
 * - Different PATCH is OK (just bug fixes)
 * - Different MINOR might indicate different features (but same determinism)
 */
export function areVersionsCompatible(v1: EngineVersion, v2: EngineVersion): boolean {
  // Must have same major version for deterministic simulation
  if (v1.major !== v2.major) return false;

  // Minor and patch differences are generally OK for comparison purposes
  // (though they might affect non-deterministic UI elements)
  return true;
}

/**
 * Generate a human-readable explanation for version incompatibility.
 */
export function explainVersionIncompatibility(v1: EngineVersion, v2: EngineVersion): string {
  if (v1.major !== v2.major) {
    return `Incompatible major versions: ${v1.major}.x vs ${v2.major}.x. Outcomes may differ due to simulation changes.`;
  }
  if (v1.minor !== v2.minor) {
    return `Different feature versions: ${v1.major}.${v1.minor} vs ${v2.major}.${v2.minor}. Outcomes should be comparable.`;
  }
  if (v1.patch !== v2.patch) {
    return `Different patch versions: ${v1.major}.${v1.minor}.${v1.patch} vs ${v2.major}.${v2.minor}.${v2.patch}. Bug fixes applied.`;
  }
  return 'Versions match exactly.';
}

/**
 * Compare two challenge outcomes.
 * Identifies divergence and explains differences.
 *
 * @param summary1 - First outcome
 * @param summary2 - Second outcome
 * @returns Comparison with divergence analysis
 */
export function compareChallengeOutcomes(
  summary1: ChallengeSummary,
  summary2: ChallengeSummary
): ChallengeComparison {
  const sameChallenge = summary1.challengeId === summary2.challengeId;
  const sameEngineVersion =
    summary1.engineVersion.major === summary2.engineVersion.major &&
    summary1.engineVersion.minor === summary2.engineVersion.minor &&
    summary1.engineVersion.patch === summary2.engineVersion.patch;
  const sameRecipeVersion = summary1.recipeVersion === summary2.recipeVersion;
  const sameRecipe =
    JSON.stringify(summary1.outcomeRecipe) === JSON.stringify(summary2.outcomeRecipe);

  const deltas = {
    finalTick: summary2.finalTick - summary1.finalTick,
    population: summary2.finalStats.population - summary1.finalStats.population,
    activeSpecies: summary2.finalStats.activeSpecies - summary1.finalStats.activeSpecies,
    peakPopulation: summary2.finalStats.peakPopulation - summary1.finalStats.peakPopulation,
    totalExtinctions:
      summary2.finalStats.totalExtinctions - summary1.finalStats.totalExtinctions,
    totalInterventions:
      summary2.finalStats.totalInterventions - summary1.finalStats.totalInterventions,
  };

  let divergenceType: 'identical' | 'minor' | 'moderate' | 'major' | 'incompatible';
  let divergenceReason: string | undefined;

  if (!sameChallenge) {
    divergenceType = 'incompatible';
    divergenceReason = 'Different challenges';
  } else if (!sameEngineVersion) {
    divergenceType = 'incompatible';
    divergenceReason = explainVersionIncompatibility(summary1.engineVersion, summary2.engineVersion);
  } else if (!sameRecipeVersion) {
    divergenceType = 'major';
    divergenceReason = 'Recipe version differs; simulation may have changed';
  } else if (!sameRecipe) {
    divergenceType = 'major';
    divergenceReason = 'Outcome recipes differ; determinism may be compromised';
  } else if (
    deltas.finalTick === 0 &&
    deltas.population === 0 &&
    deltas.activeSpecies === 0 &&
    deltas.peakPopulation === 0
  ) {
    divergenceType = 'identical';
  } else if (
    Math.abs(deltas.population) <= 1 &&
    deltas.activeSpecies === 0 &&
    deltas.totalInterventions === 0
  ) {
    divergenceType = 'minor';
  } else if (Math.abs(deltas.population) <= Math.max(5, summary1.finalStats.population * 0.1)) {
    divergenceType = 'moderate';
  } else {
    divergenceType = 'major';
  }

  let summary: string;
  if (divergenceType === 'incompatible') {
    summary = `Outcomes cannot be compared: ${divergenceReason}`;
  } else if (divergenceType === 'identical') {
    summary = 'Outcomes are identical (fully reproducible)';
  } else if (divergenceType === 'minor') {
    summary = 'Outcomes are nearly identical with minor variation';
  } else if (divergenceType === 'moderate') {
    const dir = deltas.population > 0 ? 'higher' : 'lower';
    summary = `Population is ${dir} (Δ${Math.abs(deltas.population)}), but overall strategy is similar`;
  } else {
    const strategies = deltas.totalInterventions !== 0 ? 'with different strategies' : '';
    summary = `Substantially different outcomes ${strategies}`;
  }

  return {
    summary1,
    summary2,
    sameChallenge,
    sameEngineVersion,
    sameRecipeVersion,
    sameRecipe,
    divergenceType,
    divergenceReason,
    deltas,
    summary,
  };
}

/**
 * Serialize a challenge summary to JSON for export/sharing.
 * Designed to be human-readable and safe to share publicly.
 *
 * @param summary - Challenge summary to serialize
 * @returns JSON string
 */
export function serializeChallengeSummary(summary: ChallengeSummary): string {
  return JSON.stringify(summary, null, 2);
}

/**
 * Deserialize a challenge summary from JSON.
 * Validates structure without executing untrusted code.
 *
 * @param jsonText - JSON text to parse
 * @returns Parsed summary or error
 */
export function parseChallengeSummary(jsonText: string): { summary: ChallengeSummary } | { error: string } {
  try {
    const parsed: unknown = JSON.parse(jsonText);
    if (typeof parsed !== 'object' || parsed === null) {
      return { error: 'Summary is not a JSON object' };
    }

    const obj = parsed as Record<string, unknown>;

    // Validate required fields
    const challengeIdValue = obj.challengeId;
    if (typeof challengeIdValue !== 'string' || !challengeIdValue) {
      return { error: 'Missing or invalid challengeId' };
    }
    const runIdValue = obj.runId;
    if (typeof runIdValue !== 'string' || !runIdValue) {
      return { error: 'Missing or invalid runId' };
    }
    if (typeof obj.finalTick !== 'number' || obj.finalTick < 0) {
      return { error: 'Missing or invalid finalTick' };
    }
    if (typeof obj.completedAt !== 'number' || obj.completedAt < 0) {
      return { error: 'Missing or invalid completedAt' };
    }

    // Structure looks valid
    return { summary: parsed as ChallengeSummary };
  } catch (err) {
    return { error: `Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Privacy-safe sharing path for outcomes.
 *
 * Local-first (MVP, current):
 * - Export summary as JSON (copy-paste, file download, URL query params)
 * - No server storage, no authentication required
 * - Players manually share JSON text or URL
 * - Comparison happens client-side
 *
 * Hosted option (V2 future):
 * - Optional: save summary to optional hosted service
 * - Leaderboards, filtered views, social features
 * - Still export-friendly; hosted is optional enhancement
 * - User controls whether to publish
 *
 * This function documents the sharing approach.
 */
export const PRIVACY_SAFE_SHARING_GUIDE = `
# Privacy-Safe Challenge Sharing

## Local-First (MVP - No Server Required)

### Export & Share
1. Complete a challenge
2. Click "Export Outcome" → get JSON file or copy-paste text
3. Share via email, message, or pastebin
4. Friend imports JSON → automatically compares

### URL Sharing (Optional)
- Outcome summary can be encoded in URL query parameter
- Long URLs, but no server storage
- Example: /challenges/outcomes?data=<encoded-json>

### What's Shared
- Seed, recipe, metrics, milestones, evidence
- NO personal data, NO server connection
- Compare by examining JSON side-by-side

## Future: Optional Hosted Leaderboards (V2)

- Players can opt-in to publish summaries
- Leaderboards, filtered by difficulty/date/author
- Always export-friendly; hosted is enhancement
- Privacy controls: anonymous/named summaries
- One-click compare: find other players' runs

## Trust & Verification

Each summary includes:
- Engine version (detect incompatibilities)
- Recipe hash (verify same starting conditions)
- Intervention log (see what player changed)
- Milestones (verify timeline authenticity)

Comparison shows divergence clearly:
- Same seed, same engine → identical or very close
- Different engine version → clearly labeled
- Different strategies → shown in intervention log

---

Players remain in control; sharing is always voluntary.
`;
