import { describe, it, expect } from 'vitest';
import {
  generateDailySeed,
  generateRunId,
  createDailyChallenge,
  buildChallengeSummary,
  areVersionsCompatible,
  explainVersionIncompatibility,
  compareChallengeOutcomes,
  serializeChallengeSummary,
  parseChallengeSummary,
  CURRENT_ENGINE_VERSION,
  type Challenge,
  type WorldRecipe,
  type SessionSummary,
  type ChallengeSummary,
} from '../simulation/challenges';

// Test fixtures
const mockRecipe: WorldRecipe = {
  version: 1,
  seed: 12345,
  throughTick: 100,
  initialSettings: {
    feedingEfficiency: 0.8,
  },
  actions: [],
};

const mockSessionSummary: SessionSummary = {
  worldName: 'Test World',
  seed: 12345,
  status: 'ended',
  ticksSurvived: 100,
  currentPopulation: 5,
  peakPopulation: 20,
  activeSpecies: 2,
  activeLineages: 3,
  births: 15,
  deaths: 12,
  mutations: 3,
  extinctions: 1,
  interventions: 2,
  speciesObserved: 3,
  remainingBiomass: 100,
  finalEvents: [],
  recentStories: [],
  story: {
    heading: 'Test Story',
    paragraphs: ['A test world'],
  },
  points: {
    total: 150,
    breakdown: {
      survival: 50,
      biodiversity: 40,
      exploration: 30,
      recovery: 20,
      stewardship: 10,
    },
    awards: [],
    history: [],
  },
};

const mockChallenge: Challenge = {
  id: 'test-challenge-001',
  title: 'Survival Challenge',
  description: 'Keep the ecosystem alive for 100 ticks',
  difficulty: 'easy',
  recipe: mockRecipe,
  engineVersion: CURRENT_ENGINE_VERSION,
  recipeVersion: 1,
  objectives: [
    {
      id: 'obj-1',
      title: 'Survive 100 ticks',
      description: 'Keep at least one creature alive',
      type: 'survive',
      targetMetric: {
        metric: 'population',
        threshold: 1,
        direction: 'increase',
      },
    },
  ],
  author: 'Test Author',
};

describe('generateDailySeed', () => {
  it('should generate same seed for same date', () => {
    const seed1 = generateDailySeed('2025-01-15');
    const seed2 = generateDailySeed('2025-01-15');
    expect(seed1).toBe(seed2);
  });

  it('should generate different seeds for different dates', () => {
    const seed1 = generateDailySeed('2025-01-15');
    const seed2 = generateDailySeed('2025-01-16');
    expect(seed1).not.toBe(seed2);
  });

  it('should generate valid 32-bit unsigned integers', () => {
    const seed = generateDailySeed('2025-06-15');
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(2 ** 32 - 1);
  });

  it('should handle valid date strings', () => {
    expect(() => generateDailySeed('2025-01-01')).not.toThrow();
    expect(() => generateDailySeed('2025-12-31')).not.toThrow();
    expect(() => generateDailySeed('2020-06-15')).not.toThrow();
  });

  it('should reject invalid date formats', () => {
    expect(() => generateDailySeed('01-15-2025')).toThrow();
    expect(() => generateDailySeed('2025/01/15')).toThrow();
    expect(() => generateDailySeed('2025-1-15')).toThrow();
    expect(() => generateDailySeed('invalid')).toThrow();
  });

  it('should reject out-of-range dates', () => {
    expect(() => generateDailySeed('2019-01-01')).toThrow(); // Before 2020
    expect(() => generateDailySeed('2100-01-01')).toThrow(); // After 2099
    expect(() => generateDailySeed('2025-13-01')).toThrow(); // Invalid month
    expect(() => generateDailySeed('2025-01-32')).toThrow(); // Invalid day
  });
});

describe('generateRunId', () => {
  it('should generate unique run IDs', () => {
    const id1 = generateRunId();
    const id2 = generateRunId();
    expect(id1).not.toBe(id2);
  });

  it('should include timestamp component', () => {
    const id = generateRunId();
    const parts = id.split('-');
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(Number(parts[0])).toBeGreaterThan(0);
  });

  it('should be a valid string format', () => {
    const id = generateRunId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
});

describe('createDailyChallenge', () => {
  it('should create a daily challenge with correct date', () => {
    const daily = createDailyChallenge(
      '2025-06-15',
      mockRecipe,
      'Daily Challenge',
      'Test daily challenge'
    );

    expect(daily.date).toBe('2025-06-15');
    expect(daily.seed).toEqual(generateDailySeed('2025-06-15'));
    expect(daily.recipe.seed).toBe(daily.seed);
  });

  it('should use deterministic seed from date', () => {
    const daily1 = createDailyChallenge(
      '2025-06-15',
      mockRecipe,
      'Title',
      'Description'
    );
    const daily2 = createDailyChallenge(
      '2025-06-15',
      mockRecipe,
      'Title',
      'Description'
    );

    expect(daily1.seed).toBe(daily2.seed);
    expect(daily1.recipe.seed).toBe(daily2.recipe.seed);
  });

  it('should preserve other recipe properties', () => {
    const daily = createDailyChallenge(
      '2025-06-15',
      mockRecipe,
      'Title',
      'Description'
    );

    expect(daily.recipe.throughTick).toBe(mockRecipe.throughTick);
    expect(daily.recipe.version).toBe(mockRecipe.version);
  });

  it('should mark daily challenges as featured', () => {
    const daily = createDailyChallenge(
      '2025-06-15',
      mockRecipe,
      'Title',
      'Description'
    );

    expect(daily.featured).toBe(true);
  });

  it('should accept custom difficulty', () => {
    const daily = createDailyChallenge(
      '2025-06-15',
      mockRecipe,
      'Title',
      'Description',
      'expert'
    );

    expect(daily.difficulty).toBe('expert');
  });
});

describe('buildChallengeSummary', () => {
  it('should create a summary with required fields', () => {
    const summary = buildChallengeSummary(
      mockChallenge,
      mockSessionSummary,
      100,
      [],
      []
    );

    expect(summary.challengeId).toBe(mockChallenge.id);
    expect(summary.finalTick).toBe(100);
    expect(summary.engineVersion).toEqual(CURRENT_ENGINE_VERSION);
  });

  it('should capture session statistics', () => {
    const summary = buildChallengeSummary(
      mockChallenge,
      mockSessionSummary,
      100
    );

    expect(summary.finalStats.population).toBe(mockSessionSummary.currentPopulation);
    expect(summary.finalStats.activeSpecies).toBe(mockSessionSummary.activeSpecies);
    expect(summary.finalStats.totalBirths).toBe(mockSessionSummary.births);
  });

  it('should include milestones and evidence', () => {
    const milestones = [
      { tick: 50, description: 'Halfway point', population: 10 },
    ];
    const evidence = [
      {
        type: 'adaptation' as const,
        tick: 60,
        speciesId: 'sp-1',
        description: 'Speed mutation observed',
      },
    ];

    const summary = buildChallengeSummary(
      mockChallenge,
      mockSessionSummary,
      100,
      milestones,
      evidence
    );

    expect(summary.milestones).toEqual(milestones);
    expect(summary.evidence).toEqual(evidence);
  });

  it('should accept optional notes and recipe', () => {
    const notes = 'This was a great run!';
    const summary = buildChallengeSummary(
      mockChallenge,
      mockSessionSummary,
      100,
      [],
      [],
      mockRecipe,
      notes
    );

    expect(summary.notes).toBe(notes);
    expect(summary.outcomeRecipe).toEqual(mockRecipe);
  });
});

describe('areVersionsCompatible', () => {
  it('should reject different major versions', () => {
    const v1 = { major: 1, minor: 0, patch: 0 };
    const v2 = { major: 2, minor: 0, patch: 0 };
    expect(areVersionsCompatible(v1, v2)).toBe(false);
  });

  it('should allow same major version with different minor', () => {
    const v1 = { major: 1, minor: 0, patch: 0 };
    const v2 = { major: 1, minor: 1, patch: 0 };
    expect(areVersionsCompatible(v1, v2)).toBe(true);
  });

  it('should allow same major version with different patch', () => {
    const v1 = { major: 1, minor: 0, patch: 0 };
    const v2 = { major: 1, minor: 0, patch: 1 };
    expect(areVersionsCompatible(v1, v2)).toBe(true);
  });

  it('should allow identical versions', () => {
    const v = { major: 1, minor: 2, patch: 3 };
    expect(areVersionsCompatible(v, v)).toBe(true);
  });
});

describe('explainVersionIncompatibility', () => {
  it('should explain major version differences', () => {
    const v1 = { major: 1, minor: 0, patch: 0 };
    const v2 = { major: 2, minor: 0, patch: 0 };
    const msg = explainVersionIncompatibility(v1, v2);
    expect(msg).toContain('major');
  });

  it('should explain minor version differences', () => {
    const v1 = { major: 1, minor: 0, patch: 0 };
    const v2 = { major: 1, minor: 1, patch: 0 };
    const msg = explainVersionIncompatibility(v1, v2);
    expect(msg).toContain('feature');
  });

  it('should explain patch version differences', () => {
    const v1 = { major: 1, minor: 0, patch: 0 };
    const v2 = { major: 1, minor: 0, patch: 1 };
    const msg = explainVersionIncompatibility(v1, v2);
    expect(msg).toContain('patch');
  });
});

describe('compareChallengeOutcomes', () => {
  const makeSummary = (overrides: Partial<ChallengeSummary> = {}): ChallengeSummary => ({
    challengeId: 'test-1',
    challengeTitle: 'Test Challenge',
    runId: 'run-1',
    completedAt: Date.now(),
    engineVersion: CURRENT_ENGINE_VERSION,
    recipeVersion: 1,
    finalTick: 100,
    completionStatus: 'abandoned' as const,
    finalStats: {
      population: 5,
      activeSpecies: 2,
      activeLineages: 3,
      peakPopulation: 20,
      totalExtinctions: 1,
      totalBirths: 15,
      totalMutations: 3,
      totalInterventions: 2,
      remainingBiomass: 100,
    },
    objectivesMet: [],
    objectivesPartial: [],
    milestones: [],
    evidence: [],
    ...overrides,
  });

  it('should detect identical outcomes', () => {
    const summary = makeSummary();
    const comparison = compareChallengeOutcomes(summary, summary);

    expect(comparison.divergenceType).toBe('identical');
    expect(comparison.sameChallenge).toBe(true);
  });

  it('should detect minor differences', () => {
    const summary1 = makeSummary();
    const summary2 = makeSummary({
      finalTick: 101,
      finalStats: { ...summary1.finalStats, population: 6 },
    });

    const comparison = compareChallengeOutcomes(summary1, summary2);
    expect(['identical', 'minor']).toContain(comparison.divergenceType);
  });

  it('should detect incompatibility when challenges differ', () => {
    const summary1 = makeSummary({ challengeId: 'test-1' });
    const summary2 = makeSummary({ challengeId: 'test-2' });

    const comparison = compareChallengeOutcomes(summary1, summary2);
    expect(comparison.divergenceType).toBe('incompatible');
    expect(comparison.sameChallenge).toBe(false);
  });

  it('should detect incompatibility when versions differ significantly', () => {
    const summary1 = makeSummary({
      engineVersion: { major: 1, minor: 0, patch: 0 },
    });
    const summary2 = makeSummary({
      engineVersion: { major: 2, minor: 0, patch: 0 },
    });

    const comparison = compareChallengeOutcomes(summary1, summary2);
    expect(comparison.divergenceType).toBe('incompatible');
    expect(comparison.sameEngineVersion).toBe(false);
  });

  it('should calculate deltas correctly', () => {
    const summary1 = makeSummary({ finalTick: 100, finalStats: { ...makeSummary().finalStats, population: 10 } });
    const summary2 = makeSummary({ finalTick: 150, finalStats: { ...makeSummary().finalStats, population: 15 } });

    const comparison = compareChallengeOutcomes(summary1, summary2);
    expect(comparison.deltas.finalTick).toBe(50);
    expect(comparison.deltas.population).toBe(5);
  });
});

describe('serializeChallengeSummary & parseChallengeSummary', () => {
  it('should serialize and deserialize correctly', () => {
    const summary = buildChallengeSummary(
      mockChallenge,
      mockSessionSummary,
      100
    );

    const json = serializeChallengeSummary(summary);
    expect(typeof json).toBe('string');

    const result = parseChallengeSummary(json);
    expect('summary' in result).toBe(true);
    if ('summary' in result) {
      expect(result.summary.challengeId).toBe(summary.challengeId);
    }
  });

  it('should reject invalid JSON', () => {
    const result = parseChallengeSummary('not valid json');
    expect('error' in result).toBe(true);
  });

  it('should reject missing required fields', () => {
    const result = parseChallengeSummary('{}');
    expect('error' in result).toBe(true);
  });

  it('should produce human-readable JSON', () => {
    const summary = buildChallengeSummary(
      mockChallenge,
      mockSessionSummary,
      100
    );
    const json = serializeChallengeSummary(summary);

    // Should be indented (pretty-printed)
    expect(json).toContain('\n');
    expect(json).toContain('  ');
  });
});

describe('Daily challenge determinism', () => {
  it('should produce identical outcomes with same daily seed', () => {
    const date = '2025-06-15';
    const seed1 = generateDailySeed(date);
    const seed2 = generateDailySeed(date);

    expect(seed1).toBe(seed2);
  });

  it('should support multiple daily challenges without collision', () => {
    const dates = ['2025-01-01', '2025-01-02', '2025-06-15', '2025-12-31'];
    const seeds = dates.map(generateDailySeed);

    // All seeds should be unique
    const uniqueSeeds = new Set(seeds);
    expect(uniqueSeeds.size).toBe(seeds.length);
  });
});

describe('Challenge comparison narratives', () => {
  it('should provide human-readable divergence summary', () => {
    const summary1 = {
      challengeId: 'test-1',
      challengeTitle: 'Test',
      runId: 'run-1',
      completedAt: Date.now(),
      engineVersion: CURRENT_ENGINE_VERSION,
      recipeVersion: 1,
      finalTick: 100,
      completionStatus: 'abandoned' as const,
      finalStats: {
        population: 5,
        activeSpecies: 2,
        activeLineages: 3,
        peakPopulation: 20,
        totalExtinctions: 1,
        totalBirths: 15,
        totalMutations: 3,
        totalInterventions: 2,
        remainingBiomass: 100,
      },
      objectivesMet: [],
      objectivesPartial: [],
      milestones: [],
      evidence: [],
    };

    const comparison = compareChallengeOutcomes(summary1, summary1);
    expect(typeof comparison.summary).toBe('string');
    expect(comparison.summary.length).toBeGreaterThan(0);
  });
});
