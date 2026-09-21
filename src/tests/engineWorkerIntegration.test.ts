/**
 * Integration tests for the engine worker's direct mode (issue #287).
 *
 * engineWorker.ts exports processCommand/workerState/createSnapshot precisely
 * so tests can drive the exact command path a real Worker runs, without a
 * thread ("direct mode"). These tests pin that every snapshot reports the
 * worker's ACTUAL isRunning/isPaused state — never hardcoded values — across
 * init -> tick -> pause -> resume -> reset -> replay, plus the command
 * routing of the single onmessage handler.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  WorkerCommand,
  WorkerResponse,
  CompactSnapshot,
} from '../simulation/engineWorkerProtocol';
import { createEngine } from '../simulation/engine';
import { buildStarterCreatures } from '../simulation/starterWorld';

const SEED = 20260921;
const WIDTH = 24;
const HEIGHT = 24;

/** Build a small but real starter ecosystem (replay-safe, fixed seed). */
function makeEngine(seed: number = SEED) {
  const creatures = buildStarterCreatures(seed, WIDTH, HEIGHT);
  return createEngine(seed, creatures, WIDTH, HEIGHT);
}

/** A well-formed init command per the protocol's InitCommand shape. */
function initCommand(engineState: ReturnType<typeof makeEngine>): WorkerCommand {
  return {
    type: 'init',
    engineState,
    config: { workerVersion: '1.0.0', targetFps: 60 },
  };
}

describe('engineWorker direct mode', () => {
  let posted: unknown[];

  beforeEach(() => {
    // Fresh module state per test: the worker keeps singleton state.
    vi.resetModules();
    posted = [];
    vi.spyOn(window, 'postMessage').mockImplementation(((msg: unknown) => {
      posted.push(msg);
    }) as typeof window.postMessage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Load a fresh worker module and run one command, returning its snapshot. */
  async function freshWorker() {
    const mod = await import('../simulation/engineWorker');
    const run = (command: WorkerCommand): CompactSnapshot => {
      const before = posted.length;
      mod.processCommand(command);
      expect(posted.length).toBe(before + 1); // every command answers exactly once
      return (posted[posted.length - 1] as WorkerResponse).snapshot;
    };
    return { run, workerState: mod.workerState };
  }

  it('should pause and resume in direct mode', async () => {
    const { run } = await freshWorker();

    let s = run(initCommand(makeEngine()));
    expect(s.isRunning).toBe(false); // initialized, not yet ticking
    expect(s.isPaused).toBe(false);

    s = run({ type: 'resume' });
    expect(s.isRunning).toBe(true); // running after resume
    expect(s.isPaused).toBe(false);

    s = run({ type: 'tick', count: 3 });
    expect(s.tick).toBe(3); // ticking while running
    expect(s.isRunning).toBe(true);

    s = run({ type: 'pause' });
    expect(s.isPaused).toBe(true); // paused must report paused
    expect(s.isRunning).toBe(false);

    s = run({ type: 'tick', count: 3 });
    expect(s.tick).toBe(3); // ticks are withheld while paused
    expect(s.isPaused).toBe(true);

    s = run({ type: 'resume' });
    expect(s.isRunning).toBe(true); // resume restores running
    expect(s.isPaused).toBe(false);

    s = run({ type: 'tick', count: 3 });
    expect(s.tick).toBe(6); // ticking resumes where it left off
  });

  it('reports real running/paused state through init->tick->pause->resume->reset->replay', async () => {
    const { run } = await freshWorker();
    const engine = makeEngine();

    let s = run(initCommand(engine));
    expect(s).toMatchObject({ tick: 0, isRunning: false, isPaused: false });

    // A tick command before resume is a no-op: state must say why (not running).
    s = run({ type: 'tick', count: 5 });
    expect(s).toMatchObject({ tick: 0, isRunning: false, isPaused: false });

    s = run({ type: 'resume' });
    expect(s).toMatchObject({ isRunning: true, isPaused: false });

    s = run({ type: 'tick', count: 5 });
    expect(s).toMatchObject({ tick: 5, isRunning: true, isPaused: false });

    s = run({ type: 'pause' });
    expect(s).toMatchObject({ tick: 5, isRunning: false, isPaused: true });

    s = run({ type: 'resume' });
    expect(s).toMatchObject({ isRunning: true, isPaused: false });

    s = run({ type: 'tick', count: 2 });
    expect(s).toMatchObject({ tick: 7, isRunning: true, isPaused: false });

    // Reset installs a fresh engine and stops ticking.
    s = run({ type: 'reset', engineState: makeEngine() });
    expect(s).toMatchObject({ tick: 0, isRunning: false, isPaused: false });

    // Replay runs N deterministic ticks from the given state, then stands idle.
    s = run({ type: 'replay', engineState: makeEngine(), ticks: 6 });
    expect(s).toMatchObject({ tick: 6, isRunning: false, isPaused: false });

    // Determinism: replaying the same seed lands on the same tick and world size.
    const again = run({ type: 'replay', engineState: makeEngine(), ticks: 6 });
    expect(again.tick).toBe(6);
    expect(again.worldSnapshot.creatures.length).toBe(s.worldSnapshot.creatures.length);
  });

  it('lets init/reset/replay initialize a cold worker, and rejects the rest', async () => {
    const { run, workerState } = await freshWorker();

    // Before the fix, the "not initialized" guard rejected init itself.
    const s = run(initCommand(makeEngine()));
    expect(workerState.initialized).toBe(true);
    expect(s.tick).toBe(0);

    // reset and replay carry their own engine state and also work cold.
    expect(() => run({ type: 'reset', engineState: makeEngine() })).not.toThrow();
    expect(() => run({ type: 'replay', engineState: makeEngine(), ticks: 2 })).not.toThrow();

    // Commands that need an engine still fail fast on a cold worker.
    vi.resetModules();
    const cold = await import('../simulation/engineWorker');
    expect(() => cold.processCommand({ type: 'tick', count: 1 })).toThrow(/not initialized/i);
    expect(() => cold.processCommand({ type: 'pause' })).toThrow(/not initialized/i);
    expect(() => (cold as any).processCommand({ type: 'speed', ticksPerFrame: 2 })).toThrow(/not initialized/i);
  });

  it('error snapshots report the real running state, not a hardcoded paused one', async () => {
    const { run } = await freshWorker();
    run(initCommand(makeEngine()));
    run({ type: 'resume' }); // worker is RUNNING now

    // An unknown command fails inside the worker but must not lie about state.
    const mod = await import('../simulation/engineWorker');
    expect(() => (mod as any).processCommand({ type: 'bogus-command' })).not.toThrow();
    const response = posted[posted.length - 1] as WorkerResponse;
    expect(response.snapshot.error?.code).toBe('COMMAND_PROCESSING_ERROR');
    expect(response.snapshot.isRunning).toBe(true); // was running when the error hit
    expect(response.snapshot.isPaused).toBe(false);
  });

  it('answers version-check through the single onmessage handler without enqueueing', async () => {
    const mod = await import('../simulation/engineWorker');
    // jsdom does not route dispatchEvent('message') through window.onmessage,
    // so drive the installed handler directly with a real MessageEvent.
    const handler = window.onmessage as (ev: MessageEvent) => void;
    expect(typeof handler).toBe('function');

    handler(new MessageEvent('message', { data: { type: 'version-check' } }));

    expect(posted.length).toBe(1);
    const versionResponse = posted[0] as { type: string; version: { protocol: string } };
    expect(versionResponse.type).toBe('version-response');
    expect(versionResponse.version.protocol).toBe('1.0.0');
    expect(mod.workerState.commandQueue.length).toBe(0); // not enqueued as a command
  });
});
