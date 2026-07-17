import { describe, expect, it } from 'vitest';
import type { CreatureSnapshot } from '../state/store';
import { DEFAULT_TRAITS } from '../utils/traits';
import { shortLineageId, summarizeSpecies } from '../ui/speciesModel';

function creature(
  id: string,
  speciesId: string,
  lineageId: string,
  lifecycleState: CreatureSnapshot['lifecycleState'] = 'alive'
): CreatureSnapshot {
  return {
    id,
    speciesId,
    lineageId,
    parentId: null,
    traits: { ...DEFAULT_TRAITS },
    x: 0,
    y: 0,
    energy: 100,
    age: 0,
    lifecycleState,
    corpseDecayTicks: lifecycleState === 'alive' ? 0 : 10,
  };
}

describe('species display model', () => {
  it('groups living creatures by species and lineage', () => {
    const summaries = summarizeSpecies([
      creature('1', 'alpha', 'lineage_root'),
      creature('2', 'alpha', 'lineage_branch'),
      creature('3', 'alpha', 'lineage_branch'),
      creature('4', 'beta', 'beta_root'),
      creature('5', 'alpha', 'lineage_root', 'dead'),
    ]);

    expect(summaries.map(({ speciesId, population }) => ({ speciesId, population }))).toEqual([
      { speciesId: 'alpha', population: 3 },
      { speciesId: 'beta', population: 1 },
    ]);
    expect(summaries[0].lineages.map(({ lineageId, population }) => ({ lineageId, population })))
      .toEqual([
        { lineageId: 'lineage_branch', population: 2 },
        { lineageId: 'lineage_root', population: 1 },
      ]);
  });

  it('uses deterministic alphabetical tie-breaking', () => {
    const summaries = summarizeSpecies([
      creature('1', 'zeta', 'zeta_root'),
      creature('2', 'alpha', 'alpha_root'),
    ]);

    expect(summaries.map((item) => item.speciesId)).toEqual(['alpha', 'zeta']);
  });

  it('shortens generated lineage IDs without changing root IDs', () => {
    expect(shortLineageId('lineage_12345678_abcdef')).toBe('12345678');
    expect(shortLineageId('herbivore_001')).toBe('herbivore_001');
  });
});
