import { describe, expect, it } from 'vitest';
import type { CreatureSnapshot, EventSnapshot, FollowedLineage } from '../state/store';
import { DEFAULT_TRAITS } from '../utils/traits';
import { buildFollowedLineageNotices } from '../ui/lineageNoticeModel';

function creature(id: string, speciesId: string, lineageId: string): CreatureSnapshot {
  return {
    id, speciesId, lineageId, parentId: null,
    traits: { ...DEFAULT_TRAITS },
    x: 0, y: 0, energy: 100, age: 1,
    lifecycleState: 'alive', corpseDecayTicks: 0,
  };
}

const followed: FollowedLineage[] = [{ speciesId: 'grazer', lineageId: 'root' }];

describe('followed lineage milestone notices', () => {
  it('announces the latest branch with readable parent and child identities', () => {
    const events: EventSnapshot[] = [{
      type: 'mutation', tick: 12, speciesId: 'grazer',
      parentLineageId: 'root', lineageId: 'swift-branch',
    }];
    const notices = buildFollowedLineageNotices(
      [creature('a', 'grazer', 'root')], events, followed, 20
    );
    expect(notices.find((notice) => notice.type === 'branch')).toMatchObject({
      tick: 12,
      title: expect.stringContaining('formed a new branch'),
      detail: expect.stringContaining('emerged'),
    });
  });

  it('requires zero living members and a structured lineage death for extinction', () => {
    const death: EventSnapshot = {
      type: 'death', tick: 18, speciesId: 'grazer', lineageId: 'root', creatureId: 'last',
    };
    expect(buildFollowedLineageNotices([], [death], followed, 20))
      .toEqual([expect.objectContaining({ type: 'extinction', tick: 18 })]);
    expect(buildFollowedLineageNotices(
      [creature('survivor', 'grazer', 'root')], [death], followed, 20
    ).some((notice) => notice.type === 'extinction')).toBe(false);
    expect(buildFollowedLineageNotices(
      [], [{ type: 'death', tick: 18, speciesId: 'grazer' }], followed, 20
    )).toEqual([]);
  });

  it('reports a rebound only when a birth follows a recent net decline', () => {
    const events: EventSnapshot[] = [
      { type: 'death', tick: 10, speciesId: 'grazer', lineageId: 'root' },
      { type: 'death', tick: 11, speciesId: 'grazer', lineageId: 'root' },
      { type: 'birth', tick: 12, speciesId: 'grazer', lineageId: 'root' },
    ];
    const notices = buildFollowedLineageNotices(
      [creature('newborn', 'grazer', 'root')], events, followed, 13
    );
    expect(notices.find((notice) => notice.type === 'rebound')).toMatchObject({
      tick: 12, detail: 'A new birth followed 2 recent losses',
    });
    expect(buildFollowedLineageNotices(
      [creature('newborn', 'grazer', 'root')], [events[0], events[2]], followed, 13
    ).some((notice) => notice.type === 'rebound')).toBe(false);
  });

  it('marks a lineage dominant only at three members and at least half the population', () => {
    const creatures = [
      creature('g1', 'grazer', 'root'), creature('g2', 'grazer', 'root'),
      creature('g3', 'grazer', 'root'), creature('h1', 'hunter', 'hunter-root'),
      creature('h2', 'hunter', 'hunter-root'),
    ];
    const notice = buildFollowedLineageNotices(creatures, [], followed, 30)
      .find((item) => item.type === 'dominance');
    expect(notice).toMatchObject({
      tick: 30, detail: '60% of living creatures belong to this lineage',
    });
    expect(buildFollowedLineageNotices(creatures.slice(0, 2), [], followed, 30)).toEqual([]);
  });

  it('limits notices newest-first and ignores milestones for unfollowed lineages', () => {
    const events: EventSnapshot[] = [
      { type: 'mutation', tick: 5, speciesId: 'other', parentLineageId: 'root', lineageId: 'x' },
      { type: 'mutation', tick: 10, speciesId: 'grazer', parentLineageId: 'root', lineageId: 'a' },
      { type: 'death', tick: 20, speciesId: 'grazer', lineageId: 'root' },
    ];
    const first = buildFollowedLineageNotices([], events, followed, 25, 1);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ type: 'extinction', tick: 20 });
    expect(buildFollowedLineageNotices([], events, followed, 25, 1)).toEqual(first);
  });
});
