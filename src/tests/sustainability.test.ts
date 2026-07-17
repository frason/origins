import { describe, expect, it } from 'vitest';
import {
  evaluateSustainability,
  rankSustainability,
  type SustainabilityPreset,
} from '../simulation/sustainability';

const SEED = 12345;
const TICK_HORIZON = 300;

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
    constants: {
      baseSolarEnergy: 20,
      producerGrowthRate: 0.2,
      baseMetabolism: 0.5,
      feedingEfficiency: 0.9,
      reproductionEnergyThreshold: 120,
      reproductionEnergyCost: 60,
      maxCreatureAgeTicks: 2000,
    },
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
});
