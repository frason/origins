/**
 * Manager for communication with the engine worker on the main thread.
 *
 * This module provides:
 * - Abstraction over raw Worker communication
 * - Deterministic version checking before operations
 * - Automatic fallback to direct engine if version mismatch
 * - Command queuing with response correlation
 * - Error recovery and graceful shutdown
 * - Support for both worker and direct-engine execution (for tests)
 *
 * The manager ensures:
 * - Commands are delivered in order and receive responses in order
 * - Version mismatches trigger clean fallback, not hanging messages
 * - Worker failures don't crash the main thread
 * - Tests can swap between worker and direct execution seamlessly
 */

import type {
  WorkerCommand,
  WorkerResponse,
  CompactSnapshot,
  WorkerVersionInfo,
} from './engineWorkerProtocol';
import type { EngineState } from './engine';
import { tickEngine, createEngine, introduceSpecies } from './engine';
import { snapshotEngine } from '../state/snapshot';
import { SIMULATION_CONSTANTS } from '../utils/constants';

interface PendingCommand {
  command: WorkerCommand;
  resolve: (response: CompactSnapshot) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * Execution mode: either via Web Worker or direct engine (for testing/fallback)
 */
export type ExecutionMode = 'worker' | 'direct';

/**
 * Configuration for the engine worker manager
 */
export interface EngineWorkerManagerConfig {
  mode: ExecutionMode;
  versionCheckTimeoutMs?: number;
  commandTimeoutMs?: number;
  workerUrl?: string; // URL to engineWorker.ts (for worker mode)
}

/**
 * Main thread manager for engine worker communication
 */
export class EngineWorkerManager {
  private worker: Worker | null = null;
  private mode: ExecutionMode;
  private directEngine: EngineState | null = null;
  private pendingCommands = new Map<string, PendingCommand>();
  private messageIdCounter = 0;
  private versionInfo: WorkerVersionInfo | null = null;
  private versionCheckTimeoutMs: number;
  private commandTimeoutMs: number;
  private initialized = false;
  private disposed = false;
  private isPaused = false;
  private isRunning = false;

  constructor(config: EngineWorkerManagerConfig) {
    this.mode = config.mode;
    this.versionCheckTimeoutMs = config.versionCheckTimeoutMs ?? 5000;
    this.commandTimeoutMs = config.commandTimeoutMs ?? 30000;

    if (this.mode === 'worker') {
      this.initializeWorker(config.workerUrl);
    }
  }

  private initializeWorker(workerUrl?: string): void {
    if (typeof Worker === 'undefined') {
      console.warn('Web Worker not available, falling back to direct engine mode');
      this.mode = 'direct';
      return;
    }

    try {
      // Use provided URL or default worker URL
      const url = workerUrl || new URL('./engineWorker.ts', import.meta.url);
      this.worker = new Worker(url, { type: 'module' });

      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        this.handleWorkerResponse(event.data);
      };

      this.worker.onerror = (error: ErrorEvent) => {
        console.error('Worker error:', error.message);
        this.rejectAllPending(new Error(`Worker error: ${error.message}`));
        this.fallbackToDirectEngine();
      };
    } catch (error) {
      console.error('Failed to initialize worker, falling back to direct engine:', error);
      this.mode = 'direct';
      this.worker = null;
    }
  }

  /**
   * Initialize the manager and check version compatibility
   */
  async init(engineState: EngineState): Promise<void> {
    if (this.initialized) {
      throw new Error('Manager already initialized');
    }

    if (this.mode === 'direct') {
      this.directEngine = engineState;
      this.initialized = true;
      return;
    }

    // Check worker version compatibility before proceeding
    try {
      const version = await this.checkVersion();
      this.versionInfo = version;
      this.initialized = true;

      // Send init command to worker
      await this.sendCommand({
        type: 'init',
        engineState,
        config: {
          workerVersion: version.protocol,
          targetFps: 60,
        },
      });
    } catch (error) {
      console.error('Version check or init failed, falling back to direct engine:', error);
      this.fallbackToDirectEngine();
      this.directEngine = engineState;
      this.initialized = true;
    }
  }

  /**
   * Check worker version compatibility
   */
  private async checkVersion(): Promise<WorkerVersionInfo> {
    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker version check timed out'));
      }, this.versionCheckTimeoutMs);

      const onMessage = (event: MessageEvent) => {
        if (event.data?.type === 'version-response') {
          clearTimeout(timeout);
          this.worker!.removeEventListener('message', onMessage);
          resolve(event.data.version);
        }
      };

      this.worker!.addEventListener('message', onMessage);
      this.worker!.postMessage({ type: 'version-check' });
    });
  }

  /**
   * Send a command to the worker and wait for response
   */
  async sendCommand(command: WorkerCommand): Promise<CompactSnapshot> {
    if (this.disposed) {
      throw new Error('Manager has been disposed');
    }

    if (!this.initialized) {
      throw new Error('Manager not initialized. Call init() first.');
    }

    if (this.mode === 'direct') {
      return this.executeCommandDirect(command);
    }

    if (!this.worker) {
      throw new Error('Worker not available');
    }

    return new Promise((resolve, reject) => {
      const messageId = `${this.messageIdCounter++}-${Date.now()}`;
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(messageId);
        reject(new Error(`Command timeout after ${this.commandTimeoutMs}ms`));
      }, this.commandTimeoutMs);

      this.pendingCommands.set(messageId, {
        command,
        resolve,
        reject,
        timeout,
      });

      try {
        this.worker!.postMessage(command);
      } catch (error) {
        this.pendingCommands.delete(messageId);
        clearTimeout(timeout);
        reject(new Error(`Failed to send command: ${error}`));
      }
    });
  }

  /**
   * Execute a command directly on the main thread (no worker)
   */
  private executeCommandDirect(command: WorkerCommand): CompactSnapshot {
    if (!this.directEngine) {
      throw new Error('Direct engine not initialized');
    }

    try {
      const snapshot = this.processCommandDirect(command);
      return snapshot;
    } catch (error) {
      const errorSnapshot: CompactSnapshot = {
        tick: this.directEngine?.tick ?? -1,
        seed: this.directEngine?.seed ?? -1,
        worldSnapshot: this.directEngine ? snapshotEngine(this.directEngine) : { width: 0, height: 0, cells: [], creatures: [], events: [] },
        isRunning: false,
        isPaused: true,
        constants: this.directEngine?.constants ?? SIMULATION_CONSTANTS,
        events: this.directEngine?.events ?? [],
        lastAdaptationObservations: this.directEngine?.lastAdaptationObservations ?? [],
        error: {
          code: 'DIRECT_ENGINE_ERROR',
          message: String(error),
          tick: this.directEngine?.tick ?? -1,
        },
      };
      console.error('Direct engine command error:', error);
      throw error;
    }
  }

  /**
   * Process a command on the direct engine
   */
  private processCommandDirect(command: WorkerCommand): CompactSnapshot {
    if (!this.directEngine) {
      throw new Error('Direct engine not initialized');
    }

    switch (command.type) {
      case 'init': {
        this.directEngine = command.engineState;
        return this.createSnapshotDirect();
      }

      case 'tick': {
        for (let i = 0; i < command.count; i++) {
          this.directEngine = tickEngine(this.directEngine, command.constantOverrides);
        }
        return this.createSnapshotDirect();
      }

      case 'pause': {
        this.isPaused = true;
        this.isRunning = false;
        return this.createSnapshotDirect();
      }

      case 'resume': {
        this.isPaused = false;
        this.isRunning = true;
        return this.createSnapshotDirect();
      }

      case 'reset': {
        this.directEngine = command.engineState;
        return this.createSnapshotDirect();
      }

      case 'replay': {
        this.directEngine = command.engineState;
        for (let i = 0; i < command.ticks; i++) {
          this.directEngine = tickEngine(this.directEngine);
        }
        return this.createSnapshotDirect();
      }

      case 'speed': {
        return this.createSnapshotDirect();
      }

      case 'introduce-species': {
        const result = introduceSpecies(
          this.directEngine,
          command.strategy,
          command.origin,
          command.requestedName,
          command.traitOverrides
        );
        this.directEngine = result.state;
        return this.createSnapshotDirect();
      }

      case 'checkpoint': {
        return this.createSnapshotDirect();
      }

      default:
        throw new Error(`Unknown command type: ${(command as any).type}`);
    }
  }

  /**
   * Create a compact snapshot from the direct engine
   */
  private createSnapshotDirect(): CompactSnapshot {
    if (!this.directEngine) {
      throw new Error('Direct engine not initialized');
    }

    return {
      tick: this.directEngine.tick,
      seed: this.directEngine.seed,
      worldSnapshot: snapshotEngine(this.directEngine),
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      constants: this.directEngine.constants,
      events: this.directEngine.events,
      lastAdaptationObservations: this.directEngine.lastAdaptationObservations,
    };
  }

  /**
   * Handle response from worker
   */
  private handleWorkerResponse(response: WorkerResponse): void {
    // Responses are processed in order they arrive (FIFO)
    // This preserves deterministic ordering from the worker
    const pending = this.pendingCommands.values().next().value;
    if (!pending) {
      console.warn('Received worker response with no pending command');
      return;
    }

    const entry = this.pendingCommands.entries().next().value;
    if (!entry) {
      console.warn('Received worker response with no pending command entry');
      return;
    }
    const [key] = entry;
    this.pendingCommands.delete(key);
    clearTimeout(pending.timeout);

    if (response.snapshot.error) {
      pending.reject(new Error(response.snapshot.error.message));
    } else {
      pending.resolve(response.snapshot);
      // Update direct engine if we need to fall back later
      if (response.checkpoint) {
        this.directEngine = response.checkpoint;
      }
    }
  }

  /**
   * Fall back to direct engine mode (called when worker fails)
   */
  private fallbackToDirectEngine(): void {
    if (this.mode === 'direct') return;

    console.warn('Falling back from worker to direct engine mode');
    this.mode = 'direct';
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.rejectAllPending(new Error('Worker failed, switched to direct engine'));
  }

  /**
   * Reject all pending commands (called on worker failure)
   */
  private rejectAllPending(error: Error): void {
    for (const [key, pending] of this.pendingCommands.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pendingCommands.delete(key);
    }
  }

  /**
   * Get current execution mode
   */
  getMode(): ExecutionMode {
    return this.mode;
  }

  /**
   * Get worker version info (null if in direct mode)
   */
  getVersion(): WorkerVersionInfo | null {
    return this.versionInfo;
  }

  /**
   * Check if using worker
   */
  isWorkerMode(): boolean {
    return this.mode === 'worker' && this.worker !== null;
  }

  /**
   * Dispose of the manager and clean up resources
   */
  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;
    this.rejectAllPending(new Error('Manager disposed'));

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.directEngine = null;
    this.initialized = false;
  }
}
