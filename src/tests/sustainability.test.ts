import { describe, expect, it } from 'vitest';
import {
  evaluateSustainability,
  rankSustainability,
  type SustainabilityPreset,
} from '../simulation/sustainability';
import { BALANCED_LONGEVITY_PRESET } from '../utils/constants';

const SEED = 12345;
const TICK_HORIZON = 300;
const MULTI_SEEDS = [12345, 54321, 99999];
const LONG_RUN_HORIZON = 500;

const PRESETS: SustainabilityPreset[] = [
  { name: 'current-defaults', constants: {} },
  {
    name: 'lower-metabolism',
    constants: { baseMetabolism: 1 },
  },
  {
    name: 'abundant-food',
    constants: {
      baseSolarEnergy: 16,
      producerGrowthRate: 0.16,
      feedingEfficiency: 0.9,
    },
  },
  {
    name: 'balanced-longevity',
    constants: BALANCED_LONGEVITY_PRESET,
  },
];

describe('God Mode sustainability matrix', () => {
  it('deterministically ranks a bounded four-species preset matrix', () => {
    const first = rankSustainability(
      PRESETS.map((preset) => evaluateSustainability(preset, SEED, TICK_HORIZON))
    );
    const replay = rankSustainability(
      PRESETS.map((preset) => evaluateSustainability(preset, SEED, TICK_HORIZON))
    );
    const defaults = first.find((result) => result.preset === 'current-defaults');

    expect(replay).toEqual(first);
    expect(defaults).toBeDefined();
    expect(first).toHaveLength(4);
    expect(first[0].allSpeciesSurvivalTicks).toBeGreaterThan(
      defaults!.allSpeciesSurvivalTicks
    );
    expect(first[0].preset).toBe('balanced-longevity');
    expect(first[0].allSpeciesSurvivalTicks).toBeGreaterThanOrEqual(200);
    expect(first[0].ecosystemSurvivalTicks).toBe(TICK_HORIZON);
  }, 30_000);

  it('sustains active evolution across multiple reproducible seeds', () => {
    const presets = [PRESETS[0], PRESETS[3]];
    const run = () => MULTI_SEEDS.flatMap((seed) =>
      presets.map((preset) => evaluateSustainability(preset, seed, LONG_RUN_HORIZON))
    );
    const first = run();
    const replay = run();
    const longevity = first.filter((result) => result.preset === 'balanced-longevity');
    const defaults = first.filter((result) => result.preset === 'current-defaults');

    expect(replay).toEqual(first);
    expect(longevity).toHaveLength(MULTI_SEEDS.length);
    for (let index = 0; index < longevity.length; index++) {
      const evidence = JSON.stringify(longevity[index]);
      expect(longevity[index].ecosystemSurvivalTicks, evidence).toBe(LONG_RUN_HORIZON);
      expect(longevity[index].finalSpeciesCount, evidence).toBeGreaterThanOrEqual(2);
      expect(longevity[index].mutationCount, evidence).toBeGreaterThanOrEqual(25);
      expect(longevity[index].strategyShiftCount, evidence).toBeGreaterThanOrEqual(3);
      expect(longevity[index].activeLineageCount, evidence).toBeGreaterThanOrEqual(4);
      expect(longevity[index].activeNicheCount, evidence).toBeGreaterThanOrEqual(3);
      expect(longevity[index].longestMonocultureTicks).toBe(0);
      expect(longevity[index].maximumDominantShare, evidence).toBeLessThan(0.9);
      expect(
        longevity[index].maximumDominantShare - longevity[index].minimumDominantShare,
        evidence
      ).toBeGreaterThan(0.1);
      expect(longevity[index].longestMutationSilenceTicks, evidence).toBeLessThanOrEqual(100);
      expect(longevity[index].longestHighDominanceTicks, evidence).toBeLessThan(50);
      expect(longevity[index].allSpeciesSurvivalTicks).toBeGreaterThan(
        defaults[index].allSpeciesSurvivalTicks
      );
    }
    expect(new Set(longevity.map((result) => result.finalPopulation)).size)
      .toBeGreaterThan(1);
    expect(longevity.some((result) => result.allSpeciesSurvivalTicks < LONG_RUN_HORIZON))
      .toBe(true);
    expect(longevity.some((result) => result.lineageDominanceChangeCount > 0)).toBe(true);
  }, 120_000);
});
