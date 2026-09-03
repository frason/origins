import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createFreshObservatoryState,
  loadObservatoryState,
  saveObservatoryState,
  dismissOnboarding,
  completeObjective,
  skipObjective,
} from '../ui/observatoryObjectives';

const mockStorage = new Map<string, string>();

function mockGetItem(key: string) {
  return mockStorage.get(key) || null;
}

function mockSetItem(key: string, value: string) {
  mockStorage.set(key, value);
}

/**
 * Integration tests for observatory state persistence
 *
 * These tests verify the complete flow:
 * 1. First visit: fresh state created
 * 2. Player dismisses onboarding, starts objectives
 * 3. Reload: saved state loaded, progress resumed
 * 4. Multiple reloads: state persists
 * 5. Skipping objectives: resumption still works
 */
describe('Observatory integration: persistence and resumption', () => {
  beforeEach(() => {
    mockStorage.clear();
    globalThis.localStorage = {
      getItem: mockGetItem,
      setItem: mockSetItem,
    } as Storage;
  });

  afterEach(() => {
    mockStorage.clear();
  });

  it('complete first-time player flow: onboard → observe → reload → resume', () => {
    // 1. FIRST VISIT: App mount (simulating App.tsx useEffect)
    let state = loadObservatoryState(); // Should create fresh
    expect(state.isOnboarded).toBe(false);
    expect(state.currentObjective).toBe('observe');

    // 2. FirstRunOnboarding: Player sees welcome dialog and dismisses it
    state = dismissOnboarding(state);
    saveObservatoryState(state);
    expect(state.isOnboarded).toBe(true);

    // 3. ObservatoryGuide: Player watches ecosystem for 50 ticks
    state = completeObjective(state, 'observe', 50);
    saveObservatoryState(state);
    expect(state.currentObjective).toBe('inspect');

    // 4. RELOAD: Player closes tab and returns
    const reloadedState = loadObservatoryState(); // Should load saved state
    expect(reloadedState.isOnboarded).toBe(true); // Won't show FirstRunOnboarding
    expect(reloadedState.currentObjective).toBe('inspect'); // Resumes at inspect
    expect(reloadedState.objectives.observe.isCompleted).toBe(true);

    // 5. Continue objectives
    let state2 = completeObjective(reloadedState, 'inspect', 100);
    saveObservatoryState(state2);

    // 6. SECOND RELOAD
    const reloadedState2 = loadObservatoryState();
    expect(reloadedState2.currentObjective).toBe('intervene');
    expect(reloadedState2.objectives.observe.isCompleted).toBe(true);
    expect(reloadedState2.objectives.inspect.isCompleted).toBe(true);
  });

  it('player can skip objectives and resume', () => {
    let state = loadObservatoryState();
    state = dismissOnboarding(state);

    // Skip observe
    state = skipObjective(state, 'observe', 10);
    saveObservatoryState(state);
    expect(state.currentObjective).toBe('inspect');

    // Reload: should still be at inspect
    const reloadedState = loadObservatoryState();
    expect(reloadedState.currentObjective).toBe('inspect');
    expect(reloadedState.objectives.observe.isSkipped).toBe(true);
  });

  it('handles mixed completion and skipping', () => {
    let state = loadObservatoryState();
    state = dismissOnboarding(state);

    // Complete observe
    state = completeObjective(state, 'observe', 50);
    saveObservatoryState(state);

    // Skip inspect
    state = skipObjective(state, 'inspect', 100);
    saveObservatoryState(state);
    expect(state.currentObjective).toBe('intervene');

    // Reload and verify
    const reloadedState = loadObservatoryState();
    expect(reloadedState.objectives.observe.isCompleted).toBe(true);
    expect(reloadedState.objectives.inspect.isSkipped).toBe(true);
    expect(reloadedState.currentObjective).toBe('intervene');
  });

  it('multiple reload cycles preserve all progress', () => {
    // Cycle 1: complete observe
    let state = loadObservatoryState();
    state = dismissOnboarding(state);
    state = completeObjective(state, 'observe', 50);
    saveObservatoryState(state);

    // Reload 1
    state = loadObservatoryState();
    expect(state.objectives.observe.isCompleted).toBe(true);

    // Cycle 2: complete inspect
    state = completeObjective(state, 'inspect', 100);
    saveObservatoryState(state);

    // Reload 2
    state = loadObservatoryState();
    expect(state.objectives.observe.isCompleted).toBe(true);
    expect(state.objectives.inspect.isCompleted).toBe(true);

    // Cycle 3: complete intervene
    state = completeObjective(state, 'intervene', 150);
    saveObservatoryState(state);

    // Reload 3
    state = loadObservatoryState();
    expect(state.objectives.intervene.isCompleted).toBe(true);
    expect(state.currentObjective).toBe('evaluate');

    // Cycle 4: complete evaluate
    state = completeObjective(state, 'evaluate', 200);
    saveObservatoryState(state);

    // Final reload: all completed
    state = loadObservatoryState();
    expect(state.allCompleted).toBe(true);
    expect(state.currentObjective).toBeNull();
  });

  it('does not overwrite progress with fresh state on reload', () => {
    // Simulate a bug scenario: if `loadObservatoryState()` wasn't called,
    // this would create fresh state on reload, losing progress.

    // First: setup progress
    let state = loadObservatoryState();
    state = dismissOnboarding(state);
    state = completeObjective(state, 'observe', 50);
    state = completeObjective(state, 'inspect', 100);
    saveObservatoryState(state);

    // Reload: verify saved state is NOT overwritten
    const reloadedState = loadObservatoryState();
    expect(reloadedState.objectives.observe.isCompleted).toBe(true);
    expect(reloadedState.objectives.inspect.isCompleted).toBe(true);
    // NOT reset to initial state:
    expect(reloadedState.objectives.intervene.isCompleted).toBe(false);
    expect(reloadedState.currentObjective).toBe('intervene');
  });

  it('preserves tick completion data across reloads', () => {
    let state = loadObservatoryState();
    state = dismissOnboarding(state);

    state = completeObjective(state, 'observe', 47);
    expect(state.objectives.observe.completedAtTick).toBe(47);
    saveObservatoryState(state);

    const reloadedState = loadObservatoryState();
    expect(reloadedState.objectives.observe.completedAtTick).toBe(47);
  });
});
