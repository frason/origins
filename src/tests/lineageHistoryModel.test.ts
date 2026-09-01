import { describe, expect, it } from 'vitest';
import type { CreatureSnapshot, EventSnapshot } from '../state/store';
import { DEFAULT_TRAITS } from '../utils/traits';
import {
  buildLineageHistories,
  formatTraitChange,
  formatMutationContext,
  resolveFollowedLineages,
} from '../ui/lineageHistoryModel';

function living(lineageId: string): CreatureSnapshot {
  return {
    id: `creature-${lineageId}`,
    speciesId: 'grazer',
    lineageId,
    parentId: null,
    traits: { ...DEFAULT_TRAITS },
    x: 0,
    y: 0,
    energy: 100,
    age: 1,
    lifecycleState: 'alive',
    corpseDecayTicks: 0,
  };
}

const events: EventSnapshot[] = [
  {
    type: 'mutation',
    tick: 10,
    speciesId: 'grazer',
    parentLineageId: 'grazer_root',
    lineageId: 'branch_a',
    traitChanges: [{ trait: 'speed', before: 1, after: 1.2 }],
  },
  {
    type: 'mutation',
    tick: 20,
    speciesId: 'grazer',
    parentLineageId: 'branch_a',
    lineageId: 'branch_b',
    traitChanges: [{ trait: 'energyStrategy', before: 'herbivore', after: 'omnivore' }],
  },
];

describe('lineage history model', () => {
  it('reconstructs ancestry depth and keeps extinct branches', () => {
    const [history] = buildLineageHistories([living('grazer_root'), living('branch_b')], events);

    expect(history.lineages.map(({ lineageId, depth, status }) => ({ lineageId, depth, status })))
      .toEqual([
        { lineageId: 'grazer_root', depth: 0, status: 'living' },
        { lineageId: 'branch_a', depth: 1, status: 'extinct' },
        { lineageId: 'branch_b', depth: 2, status: 'living' },
      ]);
  });

  it('preserves first-seen ticks and structured trait differences', () => {
    const [history] = buildLineageHistories([living('branch_b')], events);
    const branch = history.lineages.find((lineage) => lineage.lineageId === 'branch_b');

    expect(branch).toMatchObject({ firstSeenTick: 20, parentLineageId: 'branch_a' });
    expect(branch?.traitChanges).toEqual([
      { trait: 'energyStrategy', before: 'herbivore', after: 'omnivore' },
    ]);
    expect(formatTraitChange(branch!.traitChanges[0])).toBe(
      'energy strategy: herbivore → omnivore'
    );
  });

  it('replays identical history from identical state', () => {
    const creatures = [living('grazer_root'), living('branch_b')];
    expect(buildLineageHistories(creatures, events)).toEqual(
      buildLineageHistories(creatures, events)
    );
  });

  it('resolves followed living, extinct, and missing lineages in bookmark order', () => {
    const histories = buildLineageHistories([living('grazer_root'), living('branch_b')], events);
    const followed = [
      { speciesId: 'grazer', lineageId: 'branch_b' },
      { speciesId: 'grazer', lineageId: 'branch_a' },
      { speciesId: 'lost-species', lineageId: 'lost-root' },
    ];
    const resolved = resolveFollowedLineages(histories, followed);

    expect(resolved.map(({ lineageId, population, status, firstSeenTick, depth }) => ({
      lineageId,
      population,
      status,
      firstSeenTick,
      depth,
    }))).toEqual([
      { lineageId: 'branch_b', population: 1, status: 'living', firstSeenTick: 20, depth: 2 },
      { lineageId: 'branch_a', population: 0, status: 'extinct', firstSeenTick: 10, depth: 1 },
      { lineageId: 'lost-root', population: 0, status: 'extinct', firstSeenTick: null, depth: null },
    ]);
    expect(resolveFollowedLineages(histories, followed)).toEqual(resolved);
  });

  it('formats mutation context with toxicity-driven pressure and rate in lineage history', () => {
    // Test Gap 3: verify formatMutationContext surfaces toxicity-driven mutation cause
    const noMutation = formatMutationContext(0, 0.12);
    const baseline = formatMutationContext(0, 0.12);
    const lowPressure = formatMutationContext(0.15, 0.14);
    const mediumPressure = formatMutationContext(0.2, 0.16);
    const highPressure = formatMutationContext(0.8, 0.2);

    // No pressure → baseline label
    expect(noMutation).toContain('Baseline');
    expect(noMutation).toContain('12%');

    // Low to medium pressure → "Miasma nearby"
    expect(lowPressure).toContain('Miasma nearby');
    expect(lowPressure).toContain('15%');

    expect(mediumPressure).toContain('Miasma nearby');
    expect(mediumPressure).toContain('20%');

    // High pressure (≥0.75) → "Peak miasma"
    expect(highPressure).toContain('Peak miasma');
    expect(highPressure).toContain('80%');

    // Verify rate is always shown
    expect(lowPressure).toContain('Rate: 14%');
    expect(mediumPressure).toContain('Rate: 16%');

    // Null case when pressure or rate undefined
    expect(formatMutationContext(undefined, 0.12)).toBeNull();
    expect(formatMutationContext(0.5, undefined)).toBeNull();
  });
});
