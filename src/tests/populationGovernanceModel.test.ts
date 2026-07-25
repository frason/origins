import { describe, expect, it } from 'vitest';
import { buildPopulationGovernanceSummary } from '../ui/populationGovernanceModel';
import { DEFAULT_TRAITS } from '../utils/traits';

function creature(
  id: string,
  lifecycleState: 'alive' | 'dead' = 'alive',
  reproductionPressureMultiplier = 1
) {
  return {
    id,
    speciesId: 'grazer',
    lineageId: 'grazer',
    parentId: null,
    traits: { ...DEFAULT_TRAITS },
    x: 0,
    y: 0,
    energy: 100,
    age: 10,
    lifecycleState,
    corpseDecayTicks: 0,
    reproductionPressureMultiplier,
  };
}

describe('population governance presentation', () => {
  it('separates local reproductive restraint from the global safety limit', () => {
    const summary = buildPopulationGovernanceSummary([
      creature('a', 'alive', 1.4),
      creature('b'),
      creature('corpse', 'dead', 2),
    ], 500);

    expect(summary).toMatchObject({
      living: 2,
      locallyRestrained: 1,
      safetyLimit: 500,
      atSafetyLimit: false,
      populationLabel: '2 / 500',
      breedingLabel: '1 locally restrained',
    });
  });

  it('explains that births wait for turnover at the deterministic guard', () => {
    const summary = buildPopulationGovernanceSummary(
      [creature('a'), creature('b')],
      2
    );

    expect(summary.atSafetyLimit).toBe(true);
    expect(summary.safetyUtilization).toBe(1);
    expect(summary.breedingLabel).toBe('Births await turnover');
  });
});
