import { describe, expect, it } from 'vitest';
import {
  appendEcosystemHistory,
  createEcosystemHistorySample,
  MAX_HISTORY_SAMPLES,
} from '../simulation/ecosystemHistory';
import type { Creature } from '../simulation/creature';

const alive = (speciesId: string, lineageId: string) => ({
  speciesId,
  lineageId,
  lifecycleState: 'alive' as const,
});

describe('bounded ecosystem history', () => {
  it('creates stable species ordering and cumulative evolution totals', () => {
    const sample = createEcosystemHistorySample(
      10,
      [alive('zebra', 'z-root'), alive('ant', 'a-root'), alive('ant', 'a-branch')] as Creature[],
      [
        { type: 'birth', tick: 2 },
        { type: 'death', tick: 4 },
        { type: 'mutation', tick: 6 },
      ]
    );

    expect(sample).toEqual({
      tick: 10,
      population: 3,
      speciesPopulations: [
        { speciesId: 'ant', population: 2 },
        { speciesId: 'zebra', population: 1 },
      ],
      lineageCount: 3,
      births: 1,
      deaths: 1,
      mutations: 1,
    });
  });

  it('samples on its interval without duplicating ticks', () => {
    const zero = createEcosystemHistorySample(0, [], []);
    const five = createEcosystemHistorySample(5, [], []);
    const ten = createEcosystemHistorySample(10, [], []);
    expect(appendEcosystemHistory([zero], 10, five).history).toEqual([zero]);
    const appended = appendEcosystemHistory([zero], 10, ten);
    expect(appended.history.map((sample) => sample.tick)).toEqual([0, 10]);
    expect(appendEcosystemHistory(appended.history, 10, ten).history).toEqual(appended.history);
  });

  it('compacts deterministically while retaining full-span coverage', () => {
    const run = () => {
      let history = [createEcosystemHistorySample(0, [], [])];
      let interval = 1;
      for (let tick = 1; tick <= 12000; tick++) {
        const result = appendEcosystemHistory(
          history,
          interval,
          createEcosystemHistorySample(tick, [], [])
        );
        history = result.history;
        interval = result.interval;
      }
      return { history, interval };
    };
    const first = run();

    expect(first.history.length).toBeLessThanOrEqual(MAX_HISTORY_SAMPLES);
    expect(first.interval).toBeGreaterThan(1);
    expect(first.history[0].tick).toBe(0);
    expect(first.history[first.history.length - 1].tick).toBeGreaterThan(11000);
    expect(run()).toEqual(first);
  });
});
