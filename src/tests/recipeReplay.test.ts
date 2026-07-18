import { describe, expect, it } from 'vitest';
import { buildDemoEngine } from '../simulation/demoWorld';
import { introduceSpecies, tickEngine, type EngineState } from '../simulation/engine';
import {
  advanceRecipeReplay,
  createRecipeReplay,
} from '../simulation/recipeReplay';
import type { WorldSnapshot } from '../state/store';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import { buildWorldRecipe, parseWorldRecipe, serializeWorldRecipe } from '../ui/worldRecipe';

const constants = {
  ...SIMULATION_CONSTANTS,
  worldWidth: 20,
  worldHeight: 20,
};

function habitableTile(state: EngineState, skip = 0) {
  let found = 0;
  for (let y = 0; y < state.world.height; y++) {
    for (let x = 0; x < state.world.width; x++) {
      const biome = state.world.getCell(x, y).biome;
      if (biome !== 'ocean' && biome !== 'mountain') {
        if (found === skip) return { x, y };
        found++;
      }
    }
  }
  throw new Error('test world has no habitable tile');
}

function snapshot(state: EngineState): WorldSnapshot {
  const world = state.world.toJSON() as {
    width: number;
    height: number;
    cells: WorldSnapshot['cells'];
  };
  return {
    ...world,
    creatures: state.creatures.map((creature) => ({
      id: creature.id,
      speciesId: creature.speciesId,
      lineageId: creature.lineageId,
      parentId: creature.parentId,
      traits: { ...creature.traits },
      x: creature.x,
      y: creature.y,
      energy: creature.energy,
      age: creature.age,
      lifecycleState: creature.lifecycleState,
      corpseDecayTicks: creature.corpseDecayTicks,
    })),
    events: state.events.map((event) => ({ ...event })),
    seed: state.seed,
    tick: state.tick,
    constants: { ...state.constants },
  };
}

function serialized(state: EngineState) {
  return {
    seed: state.seed,
    tick: state.tick,
    constants: state.constants,
    world: state.world.toJSON(),
    creatures: state.creatures.map((creature) => creature.toJSON()),
    events: state.events,
    history: state.history,
    historyInterval: state.historyInterval,
  };
}

describe('automatic recipe replay', () => {
  it('reaches the exact serialized state and history of the source run', () => {
    let source = buildDemoEngine(2468, constants);
    source = introduceSpecies(source, 'scavenger', habitableTile(source), 'Ash Runners').state;
    const tuned = { ...constants, baseMetabolism: 1, producerGrowthRate: 0.2 };
    source = tickEngine(source, tuned);
    source = tickEngine(source, tuned);
    source = introduceSpecies(source, 'herbivore', habitableTile(source, 10), '').state;
    source = tickEngine(source, tuned);
    source = tickEngine(source, tuned);

    const recipeText = serializeWorldRecipe(snapshot(source))!;
    const parsed = parseWorldRecipe(recipeText);
    expect(parsed.error).toBeNull();
    expect(parsed.recipe).toEqual(buildWorldRecipe(snapshot(source)));

    let replay = createRecipeReplay(parsed.recipe!);
    for (let guard = 0; !replay.complete && guard < 20; guard++) {
      replay = advanceRecipeReplay(replay);
    }

    expect(replay.complete).toBe(true);
    expect(serialized(replay.state)).toEqual(serialized(source));
  });

  it('does not create a replay session from invalid pasted text', () => {
    const parsed = parseWorldRecipe('{"version":1,"seed":-1}');
    expect(parsed.recipe).toBeNull();
    expect(parsed.error).toContain('seed');
  });
});
