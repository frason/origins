/**
 * Web Worker implementation for authoritative simulation engine.
 *
 * This worker runs on a separate thread and executes all simulation ticks.
 * It maintains engine state, processes commands sequentially, and sends
 * compact snapshots to the main thread for rendering.
 *
 * Key responsibilities:
 * - Execute deterministic ticks independently
 * - Maintain internal engine state
 * - Process commands in order (pause, reset, replay, introduce species, etc.)
 * - Send compact snapshots for rendering
 * - Recover from errors gracefully
 *
 * Usage:
 * - Import as a web worker: new Worker(new URL('./engineWorker.ts', import.meta.url), { type: 'module' })
 * - Or use WebPack/Vite worker syntax: new Worker('./engineWorker.ts', { type: 'module' })
 */

import type {
  WorkerCommand,
  WorkerResponse,
  CompactSnapshot,
  WorkerInternalState,
  WorkerVersionInfo,
} from './engineWorkerProtocol';
import type { EngineState } from './engine';
import { tickEngine, createEngine, introduceSpecies } from './engine';
import { snapshotEngine } from '../state/snapshot';
import { SIMULATION_CONSTANTS } from '../utils/constants';

const WORKER_VERSION: WorkerVersionInfo = {
  protocol: '1.0.0',
  engineVersion: '1.0.0',
  rngVersion: 1,
};

/**
 * Worker state: tracks initialization, pause state, and engine instance
 */
let state: WorkerInternalState = {
  initialized: false,
  paused: false,
  ticksProcessed: 0,
  lastSnapshotTick: 0,
  lastCommandTick: 0,
  commandQueue: [],
  engineState: null,
  isRunning: false,
};

/**
 * Send a snapshot back to the main thread
 */
function sendSnapshot(snapshot: CompactSnapshot, checkpoint?: EngineState) {
  const response: WorkerResponse = {
    snapshot,
    checkpoint,
  };
  postMessage(response);
}

/**
 * Create a compact snapshot from current engine state
 */
function createSnapshot(engineState: EngineState): CompactSnapshot {
  const worldSnapshot = snapshotEngine(engineState);
  return {
    tick: engineState.tick,
    seed: engineState.seed,
    worldSnapshot,
    isRunning: state.isRunning,
    isPaused: state.paused,
    constants: engineState.constants,
    events: engineState.events,
    lastAdaptationObservations: engineState.lastAdaptationObservations,
  };
}

/**
 * Process a single command sequentially
 */
function processCommand(command: WorkerCommand): void {
  if (!state.engineState) {
    throw new Error('Worker not initialized. Call init command first.');
  }

  try {
    switch (command.type) {
      case 'init': {
        state.engineState = command.engineState;
        state.initialized = true;
        state.paused = false;
        state.isRunning = false;
        state.ticksProcessed = 0;
        state.lastSnapshotTick = command.engineState.tick;
        const snapshot = createSnapshot(state.engineState);
        sendSnapshot(snapshot);
        break;
      }

      case 'tick': {
        if (!state.paused && state.isRunning) {
          for (let i = 0; i < command.count; i++) {
            state.engineState = tickEngine(
              state.engineState,
              command.constantOverrides
            );
            state.ticksProcessed++;
          }
        }
        const snapshot = createSnapshot(state.engineState);
        sendSnapshot(snapshot);
        break;
      }

      case 'pause': {
        state.paused = true;
        state.isRunning = false;
        const snapshot = createSnapshot(state.engineState);
        sendSnapshot(snapshot);
        break;
      }

      case 'resume': {
        state.paused = false;
        state.isRunning = true;
        const snapshot = createSnapshot(state.engineState);
        sendSnapshot(snapshot);
        break;
      }

      case 'reset': {
        state.engineState = command.engineState;
        state.paused = false;
        state.isRunning = false;
        state.ticksProcessed = 0;
        state.lastSnapshotTick = command.engineState.tick;
        const snapshot = createSnapshot(state.engineState);
        sendSnapshot(snapshot);
        break;
      }

      case 'replay': {
        state.engineState = command.engineState;
        state.paused = false;
        state.isRunning = false;
        // Execute ticks deterministically
        for (let i = 0; i < command.ticks; i++) {
          state.engineState = tickEngine(state.engineState);
        }
        state.ticksProcessed = command.ticks;
        const snapshot = createSnapshot(state.engineState);
        sendSnapshot(snapshot);
        break;
      }

      case 'speed': {
        // Speed change is mainly a UI-side concern
        // Worker just acknowledges it
        const snapshot = createSnapshot(state.engineState);
        sendSnapshot(snapshot);
        break;
      }

      case 'introduce-species': {
        const result = introduceSpecies(
          state.engineState,
          command.strategy,
          command.origin,
          command.requestedName,
          command.traitOverrides
        );
        state.engineState = result.state;
        const snapshot = createSnapshot(state.engineState);
        sendSnapshot(snapshot);
        break;
      }

      case 'checkpoint': {
        const snapshot = createSnapshot(state.engineState);
        sendSnapshot(snapshot, state.engineState);
        break;
      }

      default:
        throw new Error(`Unknown command type: ${(command as any).type}`);
    }
  } catch (error) {
    const errorSnapshot: CompactSnapshot = {
      tick: state.engineState?.tick ?? -1,
      seed: state.engineState?.seed ?? -1,
      worldSnapshot: state.engineState
        ? snapshotEngine(state.engineState)
        : { width: 0, height: 0, cells: [], creatures: [], events: [] },
      isRunning: false,
      isPaused: true,
      constants: state.engineState?.constants ?? SIMULATION_CONSTANTS,
      events: state.engineState?.events ?? [],
      lastAdaptationObservations: [],
      error: {
        code: 'COMMAND_PROCESSING_ERROR',
        message: String(error),
        tick: state.engineState?.tick ?? -1,
      },
    };
    sendSnapshot(errorSnapshot);
    console.error('Worker command error:', error);
  }
}

/**
 * Main message handler for commands from main thread
 */
onmessage = (event: MessageEvent<WorkerCommand>) => {
  try {
    const command = event.data;
    if (!command || !command.type) {
      throw new Error('Invalid command: missing type');
    }

    state.lastCommandTick = state.engineState?.tick ?? 0;
    state.commandQueue.push({
      id: `${Date.now()}-${Math.random()}`,
      command,
      enqueuedAt: Date.now(),
    });

    // Process commands sequentially (FIFO)
    // This ensures deterministic ordering regardless of network timing
    while (state.commandQueue.length > 0) {
      const item = state.commandQueue.shift();
      if (item) {
        processCommand(item.command);
      }
    }
  } catch (error) {
    console.error('Worker fatal error:', error);
    postMessage({
      snapshot: {
        tick: -1,
        seed: -1,
        worldSnapshot: { width: 0, height: 0, cells: [], creatures: [], events: [] },
        isRunning: false,
        isPaused: true,
        constants: SIMULATION_CONSTANTS,
        events: [],
        lastAdaptationObservations: [],
        error: {
          code: 'WORKER_FATAL_ERROR',
          message: String(error),
          tick: -1,
        },
      },
    });
  }
};

/**
 * Respond to version check requests
 */
onmessage = (event: MessageEvent) => {
  if (event.data?.type === 'version-check') {
    postMessage({ type: 'version-response', version: WORKER_VERSION });
  }
};

// Export for testing: allow direct engine access without worker
export { processCommand, state as workerState, createSnapshot };
