import { Creature } from './creature';
import type { ResourceLedger } from './pivot/economy';
import type { Scout } from './pivot/scout';
import type { Building } from './pivot/building';
import type { Crisis } from './pivot/crisis';

export const CHECKPOINT_INTERVAL = 10;
export const MAX_CHECKPOINTS = 30;
export const CHECKPOINT_FORMAT_VERSION = 1;

/**
 * Serializable EquilibriumTracker state
 * Captures the internal state needed to restore equilibrium progress after a checkpoint reload
 */
export interface EquilibriumTrackerState {
  streakLength: number;
  replacementWindow: number[];
  lastConditionsState: boolean;
}

/**
 * Phase 0 state snapshot: captures ledger, scout, buildings, crises, world grid, and equilibrium.
 * This is extracted and stored with each checkpoint for persistent Phase 0 ecosystem state.
 */
export interface Phase0State {
  ledger?: {
    energy: number;
    biomass: number;
  };
  scout?: Scout;
  buildings?: Building[];
  crises?: Crisis[];
  worldGrid?: object; // World.toJSON() snapshot
  equilibrium?: EquilibriumTrackerState;
}

/**
 * SimulationCheckpoint: versioned checkpoint with optional Phase 0 state
 */
export interface SimulationCheckpoint<T> {
  version: number; // format version (starting at 1), allows migration on schema change
  tick: number;
  state: T;
  creatureIdCounter?: number;
  phase0?: Phase0State; // optional Phase 0 ecosystem state
}

/** Capture immutable engine states at fixed intervals under a strict memory bound. */
export function captureCheckpoint<T extends { tick: number }>(
  checkpoints: SimulationCheckpoint<T>[],
  state: T,
  interval = CHECKPOINT_INTERVAL,
  limit = MAX_CHECKPOINTS,
  phase0?: Phase0State
): SimulationCheckpoint<T>[] {
  if (state.tick % interval !== 0) return checkpoints;
  const next = [
    ...checkpoints.filter((checkpoint) => checkpoint.tick !== state.tick),
    {
      version: CHECKPOINT_FORMAT_VERSION,
      tick: state.tick,
      state,
      creatureIdCounter: Creature.getIdCounter(),
      phase0,
    },
  ].sort((a, b) => a.tick - b.tick);
  return next.slice(-Math.max(1, limit));
}

export interface CheckpointRestore<T> {
  state: T;
  checkpoints: SimulationCheckpoint<T>[];
}

/**
 * Restore an exact state and discard checkpoints from the future it replaces.
 * Checks version field to detect format mismatches.
 * @throws Error if checkpoint version does not match CHECKPOINT_FORMAT_VERSION
 */
export function restoreCheckpoint<T>(
  checkpoints: SimulationCheckpoint<T>[],
  tick: number
): CheckpointRestore<T> | null {
  const checkpoint = checkpoints.find((item) => item.tick === tick);
  if (!checkpoint) return null;

  // Verify checkpoint format version matches current version
  if (checkpoint.version !== CHECKPOINT_FORMAT_VERSION) {
    throw new Error(
      `Checkpoint format version mismatch: checkpoint is v${checkpoint.version}, but current version is v${CHECKPOINT_FORMAT_VERSION}. ` +
        `Please migrate checkpoint data or use a compatible version of the simulator.`
    );
  }

  const checkpointState = checkpoint.state as T & { creatures?: Array<Pick<Creature, 'id'>> };
  if (checkpoint.creatureIdCounter !== undefined) {
    Creature.setIdCounter(checkpoint.creatureIdCounter);
  } else if (checkpointState.creatures) {
    Creature.syncIdCounter(checkpointState.creatures);
  }
  return {
    state: checkpoint.state,
    checkpoints: checkpoints.filter((item) => item.tick <= tick),
  };
}
