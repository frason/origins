import { describe, expect, it } from 'vitest';
import { speciesDisplayName } from '../simulation/speciesNames';
import { buildRecipePreview } from '../ui/recipePreview';
import { parseWorldRecipe, type WorldRecipe } from '../ui/worldRecipe';
import { worldNameFromSeed } from '../ui/worldName';

function recipe(): WorldRecipe {
  return {
    version: 1,
    seed: 4242,
    throughTick: 80,
    initialSettings: { baseMetabolism: 1, producerGrowthRate: 0.2 },
    actions: [
      {
        type: 'settings',
        tick: 10,
        values: { defaultMutationRate: 0.15, feedingEfficiency: 0.9 },
      },
      {
        type: 'introduce-species',
        tick: 20,
        strategy: 'scavenger',
        origin: { x: 12, y: 13 },
        speciesId: 'introduced_scavenger_1',
        founderCount: 3,
      },
    ],
  };
}

describe('world recipe preview', () => {
  it('summarizes a no-action default recipe clearly', () => {
    const empty = recipe();
    empty.initialSettings = {};
    empty.actions = [];

    expect(buildRecipePreview(empty)).toEqual({
      worldName: worldNameFromSeed(4242),
      seed: 4242,
      throughTick: 80,
      startingSettings: [],
      actionCount: 0,
      actions: [],
      remainingActions: 0,
    });
  });

  it('describes settings and species introductions in plain language', () => {
    const preview = buildRecipePreview(recipe());

    expect(preview.startingSettings).toEqual([
      'producer growth rate 0.2',
      'base metabolism 1',
    ]);
    expect(preview.actions[0]).toEqual({
      tick: 10,
      text: 'Change feeding efficiency 0.9 · default mutation rate 0.15',
    });
    expect(preview.actions[1].text).toContain(speciesDisplayName('introduced_scavenger_1'));
    expect(preview.actions[1].text).toContain('3 scavenger founders near (12, 13)');
  });

  it('bounds long action lists and reports the hidden remainder deterministically', () => {
    const long = recipe();
    long.actions = Array.from({ length: 9 }, (_, tick) => ({
      type: 'settings' as const,
      tick,
      values: { baseMetabolism: tick + 1 },
    }));
    const first = buildRecipePreview(long, 3);

    expect(first.actions).toHaveLength(3);
    expect(first.remainingActions).toBe(6);
    expect(buildRecipePreview(long, 3)).toEqual(first);
  });

  it('cannot preview invalid recipe text because validation produces no recipe', () => {
    const parsed = parseWorldRecipe('{"version":1,"seed":"wrong"}');
    expect(parsed.recipe).toBeNull();
    expect(parsed.error).toBeTruthy();
  });
});
