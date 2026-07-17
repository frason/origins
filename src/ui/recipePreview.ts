import { speciesDisplayName } from '../simulation/speciesNames';
import { SIMULATION_CONSTANTS, type SimulationConstants } from '../utils/constants';
import type { WorldRecipe } from './worldRecipe';

export interface RecipeActionPreview {
  tick: number;
  text: string;
}

export interface RecipePreview {
  seed: number;
  throughTick: number;
  startingSettings: string[];
  actionCount: number;
  actions: RecipeActionPreview[];
  remainingActions: number;
}

function settingLabel(key: keyof SimulationConstants): string {
  return key.replace(/([A-Z])/g, ' $1').toLowerCase();
}

function displayValue(value: number): string {
  return (Math.round(value * 1000) / 1000).toLocaleString();
}

function settingDescriptions(values: Partial<SimulationConstants>, limit = 3): string[] {
  const descriptions: string[] = [];
  const keys = (Object.keys(SIMULATION_CONSTANTS) as (keyof SimulationConstants)[])
    .filter((key) => values[key] !== undefined);
  for (const key of keys.slice(0, limit)) {
    descriptions.push(`${settingLabel(key)} ${displayValue(values[key]!)}`);
  }
  if (keys.length > limit) descriptions.push(`+${keys.length - limit} more settings`);
  return descriptions;
}

/** Produce stable, bounded player-facing text without changing the replay recipe. */
export function buildRecipePreview(recipe: WorldRecipe, actionLimit = 6): RecipePreview {
  const visibleActions = recipe.actions.slice(0, Math.max(0, actionLimit)).map((action) => {
    if (action.type === 'settings') {
      return {
        tick: action.tick,
        text: `Change ${settingDescriptions(action.values).join(' · ')}`,
      };
    }
    return {
      tick: action.tick,
      text: `Introduce ${speciesDisplayName(action.speciesId)} — ${action.founderCount} ${action.strategy} founders near (${action.origin.x}, ${action.origin.y})`,
    };
  });

  return {
    seed: recipe.seed,
    throughTick: recipe.throughTick,
    startingSettings: settingDescriptions(recipe.initialSettings, 5),
    actionCount: recipe.actions.length,
    actions: visibleActions,
    remainingActions: Math.max(0, recipe.actions.length - visibleActions.length),
  };
}
