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
  throughTick: number;
  initialSettings: Partial<SimulationConstants>;
  actions: (SettingsRecipeAction | IntroductionRecipeAction)[];
}

/** Reconstruct starting settings by walking structured setting interventions backward. */
export function buildWorldRecipe(world: WorldSnapshot | null): WorldRecipe | null {
  if (
    !world || typeof world.seed !== 'number' ||
    typeof world.tick !== 'number' || !world.constants
  ) return null;
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

  return { version: 1, seed: world.seed, throughTick: world.tick, initialSettings, actions };
}

export function serializeWorldRecipe(world: WorldSnapshot | null): string | null {
  const recipe = buildWorldRecipe(world);
  return recipe ? JSON.stringify(recipe, null, 2) : null;
}

export type WorldRecipeParseResult =
  | { recipe: WorldRecipe; error: null }
  | { recipe: null; error: string };

const strategies: EnergyStrategy[] = ['herbivore', 'carnivore', 'omnivore', 'scavenger'];
const constantKeys = new Set(Object.keys(SIMULATION_CONSTANTS));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSettings(value: unknown): Partial<SimulationConstants> | null {
  if (!isRecord(value)) return null;
  const settings: Partial<SimulationConstants> = {};
  for (const [key, setting] of Object.entries(value)) {
    if (!constantKeys.has(key) || typeof setting !== 'number' || !Number.isFinite(setting)) {
      return null;
    }
    settings[key as keyof SimulationConstants] = setting;
  }
  return settings;
}

/** Parse untrusted pasted text without mutating simulation state. */
export function parseWorldRecipe(text: string): WorldRecipeParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { recipe: null, error: 'Recipe is not valid JSON' };
  }
  if (!isRecord(value) || value.version !== 1) {
    return { recipe: null, error: 'Recipe version is missing or unsupported' };
  }
  if (
    typeof value.seed !== 'number' || !Number.isInteger(value.seed) || value.seed < 0 ||
    value.seed > 2147483647
  ) {
    return { recipe: null, error: 'Recipe seed is outside the supported range' };
  }
  if (
    typeof value.throughTick !== 'number' || !Number.isInteger(value.throughTick) ||
    value.throughTick < 0 || value.throughTick > 100000
  ) {
    return { recipe: null, error: 'Recipe endpoint tick is invalid' };
  }
  const initialSettings = parseSettings(value.initialSettings);
  if (!initialSettings) return { recipe: null, error: 'Recipe starting settings are invalid' };
  if (!Array.isArray(value.actions)) return { recipe: null, error: 'Recipe actions are invalid' };

  const actions: WorldRecipe['actions'] = [];
  let previousTick = -1;
  let settingsSeenAtTick = false;
  const dimensions = { ...SIMULATION_CONSTANTS, ...initialSettings };
  if (
    !Number.isInteger(dimensions.worldWidth) || !Number.isInteger(dimensions.worldHeight) ||
    dimensions.worldWidth < 10 || dimensions.worldWidth > 200 ||
    dimensions.worldHeight < 10 || dimensions.worldHeight > 200
  ) {
    return { recipe: null, error: 'Recipe world dimensions are unsupported' };
  }
  for (const raw of value.actions) {
    if (!isRecord(raw) || typeof raw.tick !== 'number' || !Number.isInteger(raw.tick)) {
      return { recipe: null, error: 'A recipe action has an invalid tick' };
    }
    if (raw.tick < previousTick || raw.tick < 0 || raw.tick > value.throughTick) {
      return { recipe: null, error: 'Recipe actions must be ordered within the recorded timeline' };
    }
    if (raw.tick !== previousTick) settingsSeenAtTick = false;

    if (raw.type === 'settings') {
      if (raw.tick >= value.throughTick) {
        return { recipe: null, error: 'A settings action occurs after the final simulated tick' };
      }
      const values = parseSettings(raw.values);
      if (
        !values || Object.keys(values).length === 0 ||
        values.worldWidth !== undefined || values.worldHeight !== undefined
      ) {
        return { recipe: null, error: 'A settings action has invalid values' };
      }
      actions.push({ type: 'settings', tick: raw.tick, values });
      settingsSeenAtTick = true;
    } else if (raw.type === 'introduce-species') {
      if (settingsSeenAtTick) {
        return { recipe: null, error: 'Species introductions must precede settings at the same tick' };
      }
      const origin = raw.origin;
      if (
        !strategies.includes(raw.strategy as EnergyStrategy) ||
        typeof raw.speciesId !== 'string' || raw.speciesId.length === 0 ||
        raw.founderCount !== 3 || !isRecord(origin) ||
        typeof origin.x !== 'number' || !Number.isInteger(origin.x) ||
        typeof origin.y !== 'number' || !Number.isInteger(origin.y) ||
        origin.x < 0 || origin.x >= dimensions.worldWidth ||
        origin.y < 0 || origin.y >= dimensions.worldHeight
      ) {
        return { recipe: null, error: 'A species introduction has invalid inputs' };
      }
      actions.push({
        type: 'introduce-species',
        tick: raw.tick,
        strategy: raw.strategy as EnergyStrategy,
        origin: { x: origin.x, y: origin.y },
        speciesId: raw.speciesId,
        founderCount: 3,
      });
    } else {
      return { recipe: null, error: 'Recipe contains an unsupported action' };
    }
    previousTick = raw.tick;
  }

  return {
    recipe: {
      version: 1,
      seed: value.seed,
      throughTick: value.throughTick,
      initialSettings,
      actions,
    },
    error: null,
  };
}
