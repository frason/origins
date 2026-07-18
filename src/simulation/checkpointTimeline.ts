export const CHECKPOINT_INTERVAL = 10;
export const MAX_CHECKPOINTS = 30;

export interface SimulationCheckpoint<T> {
  tick: number;
  state: T;
}

/** Capture immutable engine states at fixed intervals under a strict memory bound. */
export function captureCheckpoint<T extends { tick: number }>(
  checkpoints: SimulationCheckpoint<T>[],
  state: T,
  interval = CHECKPOINT_INTERVAL,
  limit = MAX_CHECKPOINTS
): SimulationCheckpoint<T>[] {
  if (state.tick % interval !== 0) return checkpoints;
  const next = [
    ...checkpoints.filter((checkpoint) => checkpoint.tick !== state.tick),
    { tick: state.tick, state },
  ].sort((a, b) => a.tick - b.tick);
  return next.slice(-Math.max(1, limit));
}

export interface CheckpointRestore<T> {
  state: T;
  checkpoints: SimulationCheckpoint<T>[];
}

/** Restore an exact state and discard checkpoints from the future it replaces. */
export function restoreCheckpoint<T>(
  checkpoints: SimulationCheckpoint<T>[],
  tick: number
): CheckpointRestore<T> | null {
  const checkpoint = checkpoints.find((item) => item.tick === tick);
  if (!checkpoint) return null;
  return {
    state: checkpoint.state,
    checkpoints: checkpoints.filter((item) => item.tick <= tick),
  };
}
