import { SIMULATION_CONSTANTS, type SimulationConstants } from '../utils/constants';
import type { WorldRecipe } from '../ui/worldRecipe';
import { buildDemoEngine } from './demoWorld';
import { introduceSpecies, tickEngine, type EngineState } from './engine';

export interface RecipeReplaySession {
  recipe: WorldRecipe;
  state: EngineState;
  constants: SimulationConstants;
  actionIndex: number;
  complete: boolean;
}

export function createRecipeReplay(recipe: WorldRecipe): RecipeReplaySession {
  const constants = { ...SIMULATION_CONSTANTS, ...recipe.initialSettings };
  return {
    recipe,
    state: buildDemoEngine(recipe.seed, constants),
    constants,
    actionIndex: 0,
    complete: false,
  };
}

function applyActionsAtCurrentTick(session: RecipeReplaySession): RecipeReplaySession {
  let { state, constants, actionIndex } = session;
  while (
    actionIndex < session.recipe.actions.length &&
    session.recipe.actions[actionIndex].tick === state.tick
  ) {
    const action = session.recipe.actions[actionIndex];
    if (action.type === 'introduce-species') {
      const result = introduceSpecies(state, action.strategy, action.origin);
      if (result.speciesId !== action.speciesId || result.creatureIds.length !== action.founderCount) {
        throw new Error(`Recipe species identity diverged at tick ${state.tick}`);
      }
      state = result.state;
    } else {
      constants = { ...constants, ...action.values };
    }
    actionIndex++;
  }
  return { ...session, state, constants, actionIndex };
}

/** Advance one recorded tick, applying every action scheduled at its exact boundary. */
export function advanceRecipeReplay(session: RecipeReplaySession): RecipeReplaySession {
  if (session.complete) return session;
  let next = applyActionsAtCurrentTick(session);
  if (next.state.tick < next.recipe.throughTick) {
    next = { ...next, state: tickEngine(next.state, next.constants) };
    if (next.state.tick === next.recipe.throughTick) next = applyActionsAtCurrentTick(next);
  }
  const complete =
    next.state.tick === next.recipe.throughTick &&
    next.actionIndex === next.recipe.actions.length;
  if (!complete && next.state.tick >= next.recipe.throughTick) {
    throw new Error('Recipe actions extend beyond the recorded endpoint');
  }
  return { ...next, complete };
}
