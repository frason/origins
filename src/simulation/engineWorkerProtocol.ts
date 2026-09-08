/**
 * Protocol definitions for engine worker communication.
 *
 * The worker protocol uses a command-response pattern with compact snapshots.
 * All messages are JSON-serializable to support structured cloning.
 * Deterministic ordering is preserved by processing commands sequentially
 * regardless of network timing.
 */

import type { EngineState } from './engine';
import type { WorldSnapshot } from '../state/store';
import type { SimulationConstants } from '../utils/constants';
import type { EnergyStrategy } from '../utils/traits';
import type { FounderTraitOverrides } from './founderTraits';
import type { SimEvent } from './events';

/**
 * Compact snapshot sent from worker to main thread.
 * Contains only data needed for rendering and UI updates.
 */
export interface CompactSnapshot {
  tick: number;
  seed: number;
  worldSnapshot: WorldSnapshot;
  isRunning: boolean;
  isPaused: boolean;
  constants: SimulationConstants;
  events: SimEvent[];
  lastAdaptationObservations: any[]; // AdaptationObservation[]
  error?: {
    code: string;
    message: string;
    tick: number;
  };
}

/**
 * Command sent from main thread to worker.
 * Includes init, tick, pause, resume, reset, replay, speed, and intervention commands.
 */
export type WorkerCommand =
  | InitCommand
  | TickCommand
  | PauseCommand
  | ResumeCommand
  | ResetCommand
  | ReplayCommand
  | SpeedCommand
  | IntroduceSpeciesCommand
  | CheckpointCommand;

/**
 * Initialize worker with engine state and configuration
 */
export interface InitCommand {
  type: 'init';
  engineState: EngineState;
  config: {
    workerVersion: string;
    targetFps: number;
  };
}

/**
 * Execute N ticks of the simulation
 */
export interface TickCommand {
  type: 'tick';
  count: number;
  constantOverrides?: Partial<SimulationConstants>;
}

/**
 * Pause simulation (worker continues to be ready for commands)
 */
export interface PauseCommand {
  type: 'pause';
}

/**
 * Resume simulation ticking
 */
export interface ResumeCommand {
  type: 'resume';
}

/**
 * Reset to a specific checkpoint
 */
export interface ResetCommand {
  type: 'reset';
  engineState: EngineState;
}

/**
 * Replay from a checkpoint, executing N ticks deterministically
 */
export interface ReplayCommand {
  type: 'replay';
  engineState: EngineState;
  ticks: number;
}

/**
 * Change simulation speed (ticks per frame)
 */
export interface SpeedCommand {
  type: 'speed';
  ticksPerFrame: number;
}

/**
 * Introduce a new species (requires RNG determinism)
 */
export interface IntroduceSpeciesCommand {
  type: 'introduce-species';
  strategy: EnergyStrategy;
  origin: { x: number; y: number };
  requestedName?: string;
  traitOverrides?: FounderTraitOverrides;
}

/**
 * Capture a checkpoint snapshot (for save/resume)
 */
export interface CheckpointCommand {
  type: 'checkpoint';
}

/**
 * Response from worker: a compact snapshot with state update
 */
export interface WorkerResponse {
  commandId?: string;
  snapshot: CompactSnapshot;
  checkpoint?: EngineState; // Full state if requested via checkpoint command
}

/**
 * Version info for compatibility checking
 */
export interface WorkerVersionInfo {
  protocol: string; // "1.0.0" format
  engineVersion: string;
  rngVersion: number;
}

/**
 * Worker state for recovery and debugging
 */
export interface WorkerInternalState {
  initialized: boolean;
  paused: boolean;
  ticksProcessed: number;
  lastSnapshotTick: number;
  lastCommandTick: number;
  commandQueue: Array<{ id: string; command: WorkerCommand; enqueuedAt: number }>;
  engineState: EngineState | null;
  isRunning: boolean;
}
