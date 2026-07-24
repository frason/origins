import { Creature } from './creature';
import type { EngineState } from './engine';
import { World } from './world';

export const ENGINE_SAVE_VERSION = 1;

export interface PersistedEngineState {
  version: number;
  state: Omit<EngineState, 'world' | 'creatures'> & {
    world: ReturnType<World['toJSON']>;
    creatures: ReturnType<Creature['toJSON']>[];
    creatureIdCounter: number;
  };
}

/** Create a JSON-safe, versioned save payload without changing live state. */
export function serializeEngineState(state: EngineState): string {
  const payload: PersistedEngineState = {
    version: ENGINE_SAVE_VERSION,
    state: {
      ...state,
      world: state.world.toJSON(),
      creatures: state.creatures.map((creature) => creature.toJSON()),
      creatureIdCounter: Creature.getIdCounter(),
      history: state.history.map((sample) => ({ ...sample })),
      events: state.events.map((event) => ({ ...event })),
      speciesProfiles: state.speciesProfiles.map((profile) => ({ ...profile, founderTraits: { ...profile.founderTraits } })),
      incipientSpecies: state.incipientSpecies.map((candidate) => ({ ...candidate, founderTraits: { ...candidate.founderTraits } })),
    },
  };
  return JSON.stringify(payload);
}

/** Restore a compatible engine save and reject corrupt or future versions safely. */
export function deserializeEngineState(value: string): EngineState {
  let payload: PersistedEngineState;
  try {
    payload = JSON.parse(value) as PersistedEngineState;
  } catch {
    throw new Error('Saved world is not valid JSON');
  }
  if (!payload || payload.version !== ENGINE_SAVE_VERSION || !payload.state) {
    throw new Error('Saved world uses an unsupported version');
  }
  const saved = payload.state;
  if (!Number.isInteger(saved.tick) || !Number.isInteger(saved.seed) || !Array.isArray(saved.creatures) ||
      !Array.isArray(saved.events) || !Array.isArray(saved.history) || !Array.isArray(saved.speciesProfiles) ||
      !Array.isArray(saved.incipientSpecies) || !saved.constants) {
    throw new Error('Saved world is missing required simulation state');
  }
  const creatures = saved.creatures.map((creature) => Creature.fromJSON(creature));
  if (Number.isInteger(saved.creatureIdCounter)) {
    Creature.setIdCounter(saved.creatureIdCounter);
  } else {
    Creature.syncIdCounter(creatures);
  }
  return {
    world: World.fromJSON(saved.world), creatures, tick: saved.tick, seed: saved.seed,
    events: saved.events, constants: saved.constants, history: saved.history,
    historyInterval: saved.historyInterval, speciesProfiles: saved.speciesProfiles,
    incipientSpecies: saved.incipientSpecies,
  };
}
