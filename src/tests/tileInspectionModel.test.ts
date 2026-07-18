import { describe, expect, it } from 'vitest';
import type { CreatureSnapshot } from '../state/store';
import { DEFAULT_TRAITS } from '../utils/traits';
import { buildTileLineageSummaries } from '../ui/tileInspectionModel';

function creature(id: string, energy: number, size: number, metabolism: number): CreatureSnapshot {
  return {
    id, speciesId: 'grazer', lineageId: 'grazer-root', parentId: null,
    traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', size, metabolism },
    x: 2, y: 3, energy, age: 10, lifecycleState: 'alive', corpseDecayTicks: 0,
  };
}

describe('tile lineage inspection model', () => {
  it('groups occupants and explains observed food and energy context', () => {
    const summaries = buildTileLineageSummaries(
      [creature('one', 80, 0.5, 1), creature('two', 120, 0.5, 1)],
      0,
      40
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      population: 2,
      averageEnergy: 100,
      averageAge: 10,
      metabolicLoad: 0.5,
      strategy: 'herbivore',
    });
    expect(summaries[0].localContext).toContain('producer biomass offers food');
    expect(summaries[0].localContext).toContain('below-baseline energy use');
  });

  it('does not present corpses as food for a herbivore', () => {
    const [summary] = buildTileLineageSummaries([creature('one', 80, 2, 1)], 3, 0);
    expect(summary.localContext).not.toContain('scavenging');
    expect(summary.localContext).toContain('high energy demand');
  });
});
