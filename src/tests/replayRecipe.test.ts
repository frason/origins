import { describe, expect, it } from 'vitest';
import type { WorldSnapshot } from '../state/store';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import { buildWorldRecipe, serializeWorldRecipe } from '../ui/worldRecipe';

function world(): WorldSnapshot {
  return {
    width: 1,
    height: 1,
    cells: [],
    creatures: [],
    seed: 42,
    constants: {
      ...SIMULATION_CONSTANTS,
      baseMetabolism: 0.75,
      producerGrowthRate: 0.3,
    },
    events: [
      {
        type: 'intervention',
        interventionKind: 'settings-change',
        tick: 10,
        constantChanges: [
          { constant: 'baseMetabolism', before: 2, after: 1 },
        ],
      },
      {
        type: 'intervention',
        interventionKind: 'species-introduction',
        tick: 15,
        speciesId: 'introduced_scavenger_1',
        introducedStrategy: 'scavenger',
        interventionOrigin: { x: 8, y: 9 },
        founderCount: 3,
      },
      {
        type: 'intervention',
        interventionKind: 'settings-change',
        tick: 20,
        constantChanges: [
          { constant: 'baseMetabolism', before: 1, after: 0.75 },
          { constant: 'producerGrowthRate', before: 0.1, after: 0.3 },
        ],
      },
    ],
  };
}

describe('reproducible world recipe', () => {
  it('recovers initial settings and ordered intervention inputs', () => {
    expect(buildWorldRecipe(world())).toEqual({
      version: 1,
      seed: 42,
      initialSettings: {},
      actions: [
        { type: 'settings', tick: 10, values: { baseMetabolism: 1 } },
        {
          type: 'introduce-species',
          tick: 15,
          strategy: 'scavenger',
          origin: { x: 8, y: 9 },
          speciesId: 'introduced_scavenger_1',
          founderCount: 3,
        },
        {
          type: 'settings',
          tick: 20,
          values: { baseMetabolism: 0.75, producerGrowthRate: 0.3 },
        },
      ],
    });
  });

  it('preserves non-default starting settings', () => {
    const state = world();
    state.events = [];
    expect(buildWorldRecipe(state)?.initialSettings).toEqual({
      baseMetabolism: 0.75,
      producerGrowthRate: 0.3,
    });
  });

  it('serializes identical histories to byte-identical text', () => {
    expect(serializeWorldRecipe(world())).toBe(serializeWorldRecipe(world()));
  });

  it('fails safely when replay metadata or structured action inputs are missing', () => {
    const missingSeed = world();
    delete missingSeed.seed;
    expect(buildWorldRecipe(missingSeed)).toBeNull();

    const incompleteAction = world();
    delete incompleteAction.events[1].interventionOrigin;
    expect(buildWorldRecipe(incompleteAction)).toBeNull();
  });
});
