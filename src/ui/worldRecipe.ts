import type { WorldSnapshot } from '../state/store';
import {
  SIMULATION_CONSTANTS,
  type SimulationConstants,
} from '../utils/constants';
import type { EnergyStrategy } from '../utils/traits';

export interface SettingsRecipeAction {
  type: 'settings';
  tick: number;
  values: Partial<SimulationConstants>;
}

export interface IntroductionRecipeAction {
  type: 'introduce-species';
  tick: number;
  strategy: EnergyStrategy;
  origin: { x: number; y: number };
  speciesId: string;
  founderCount: number;
}

export interface WorldRecipe {
  version: 1;
  seed: number;
  initialSettings: Partial<SimulationConstants>;
  actions: (SettingsRecipeAction | IntroductionRecipeAction)[];
}

/** Reconstruct starting settings by walking structured setting interventions backward. */
export function buildWorldRecipe(world: WorldSnapshot | null): WorldRecipe | null {
  if (!world || typeof world.seed !== 'number' || !world.constants) return null;
  const initial: SimulationConstants = { ...world.constants };
  for (let index = world.events.length - 1; index >= 0; index--) {
    for (const change of world.events[index].constantChanges ?? []) {
      initial[change.constant] = change.before;
    }
  }

  const initialSettings: Partial<SimulationConstants> = {};
  for (const key of Object.keys(SIMULATION_CONSTANTS) as (keyof SimulationConstants)[]) {
    if (initial[key] !== SIMULATION_CONSTANTS[key]) initialSettings[key] = initial[key];
  }

  const actions: WorldRecipe['actions'] = [];
  for (const event of world.events) {
    if (event.interventionKind === 'settings-change' && event.constantChanges?.length) {
      const values: Partial<SimulationConstants> = {};
      for (const change of event.constantChanges) values[change.constant] = change.after;
      actions.push({ type: 'settings', tick: event.tick, values });
    }
    if (event.interventionKind === 'species-introduction') {
      if (
        !event.speciesId || !event.introducedStrategy || !event.interventionOrigin ||
        typeof event.founderCount !== 'number'
      ) {
        return null;
      }
      actions.push({
        type: 'introduce-species',
        tick: event.tick,
        strategy: event.introducedStrategy,
        origin: { ...event.interventionOrigin },
        speciesId: event.speciesId,
        founderCount: event.founderCount,
      });
    }
  }

  return { version: 1, seed: world.seed, initialSettings, actions };
}

export function serializeWorldRecipe(world: WorldSnapshot | null): string | null {
  const recipe = buildWorldRecipe(world);
  return recipe ? JSON.stringify(recipe, null, 2) : null;
}
