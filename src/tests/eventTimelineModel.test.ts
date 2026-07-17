import { describe, expect, it } from 'vitest';
import type { EventSnapshot } from '../state/store';
import { buildEventStories, getPopulationTrend } from '../ui/eventTimelineModel';
import { speciesDisplayName } from '../simulation/speciesNames';

describe('ecosystem event storytelling', () => {
  it('groups same-tick population events by species and orders newest first', () => {
    const events: EventSnapshot[] = [
      { type: 'birth', tick: 10, speciesId: 'grazer', creatureId: 'a' },
      { type: 'birth', tick: 10, speciesId: 'grazer', creatureId: 'b' },
      { type: 'death', tick: 12, speciesId: 'hunter', creatureId: 'c' },
    ];
    const stories = buildEventStories(events);

    expect(stories).toHaveLength(2);
    expect(stories[0]).toMatchObject({ tick: 12, tone: 'loss' });
    expect(stories[1]).toMatchObject({
      tick: 10,
      title: `${speciesDisplayName('grazer')} expanded`,
      detail: '2 births recorded',
    });
  });

  it('keeps individual mutation and extinction stories prominent', () => {
    const stories = buildEventStories([
      { type: 'mutation', tick: 20, speciesId: 'grazer', creatureId: 'm1', detail: 'Aurelia agilis → Aurelia fortis' },
      { type: 'mutation', tick: 20, speciesId: 'grazer', creatureId: 'm2', detail: 'Aurelia agilis → Aurelia minor' },
      { type: 'extinction', tick: 21, speciesId: 'hunter' },
    ]);

    expect(stories).toHaveLength(3);
    expect(stories[0].title).toContain('went extinct');
    expect(stories.filter((story) => story.tone === 'evolution')).toHaveLength(2);
  });

  it('detects recovery when growth follows a declining period', () => {
    const events: EventSnapshot[] = [
      ...Array.from({ length: 5 }, (_, index) => ({ type: 'death' as const, tick: 55 + index })),
      ...Array.from({ length: 6 }, (_, index) => ({ type: 'birth' as const, tick: 80 + index })),
      { type: 'death', tick: 86 } as const,
    ];

    expect(getPopulationTrend(events, 100).label).toBe('Recovering');
  });

  it('bounds the feed and returns identical stories for identical history', () => {
    const events: EventSnapshot[] = Array.from({ length: 12 }, (_, tick) => ({
      type: 'birth',
      tick,
      speciesId: `species-${tick}`,
    }));
    const first = buildEventStories(events, 4);

    expect(first).toHaveLength(4);
    expect(first.map((story) => story.tick)).toEqual([11, 10, 9, 8]);
    expect(buildEventStories(events, 4)).toEqual(first);
  });

  it('explains grouped God Mode changes in plain language', () => {
    const [story] = buildEventStories([{
      type: 'intervention',
      tick: 30,
      constantChanges: [
        { constant: 'baseMetabolism', before: 2, after: 0.5 },
        { constant: 'producerGrowthRate', before: 0.1, after: 0.2 },
      ],
    }]);

    expect(story).toMatchObject({
      tone: 'intervention',
      title: 'God Mode reshaped the world',
    });
    expect(story.detail).toContain('base metabolism 2 → 0.5');
    expect(story.detail).toContain('producer growth rate 0.1 → 0.2');
  });
});
