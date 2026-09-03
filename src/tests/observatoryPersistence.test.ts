import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createFreshObservatoryState,
  loadObservatoryState,
  saveObservatoryState,
  completeObjective,
  dismissOnboarding,
} from '../ui/observatoryObjectives';

// Mock localStorage for testing
const mockStorage = new Map<string, string>();

function mockGetItem(key: string) {
  return mockStorage.get(key) || null;
}

function mockSetItem(key: string, value: string) {
  mockStorage.set(key, value);
}

describe('Observatory state persistence and resumption', () => {
  beforeEach(() => {
    mockStorage.clear();
    // Override localStorage for tests
    (global as any).localStorage = {
      getItem: mockGetItem,
      setItem: mockSetItem,
    };
  });

  afterEach(() => {
    mockStorage.clear();
  });

  it('should create fresh state on first visit', () => {
    const state = loadObservatoryState();
    expect(state.isOnboarded).toBe(false);
    expect(state.currentObjective).toBe('observe');
    expect(state.allCompleted).toBe(false);
  });

  it('should persist state across reloads', () => {
    // First visit: create fresh state
    const freshState = createFreshObservatoryState();
    saveObservatoryState(freshState);

    // Simulate app reload: load from storage
    const loadedState = loadObservatoryState();
    expect(loadedState).toEqual(freshState);
  });

  it('should resume progress mid-flow after reload', () => {
    // First session: start with fresh state
    let state = createFreshObservatoryState();
    saveObservatoryState(state);

    // Player completes "observe" objective
    state = completeObjective(state, 'observe', 100);
    saveObservatoryState(state);

    // Simulate reload: load from storage
    const reloadedState = loadObservatoryState();
    expect(reloadedState.objectives.observe.isCompleted).toBe(true);
    expect(reloadedState.currentObjective).toBe('inspect');
  });

  it('should preserve onboarded flag across reloads', () => {
    // Player dismisses onboarding
    let state = createFreshObservatoryState();
    state = dismissOnboarding(state);
    saveObservatoryState(state);

    // Reload
    const reloadedState = loadObservatoryState();
    expect(reloadedState.isOnboarded).toBe(true);
  });

  it('should handle multiple objectives completion', () => {
    let state = createFreshObservatoryState();

    state = completeObjective(state, 'observe', 50);
    expect(state.currentObjective).toBe('inspect');

    state = completeObjective(state, 'inspect', 100);
    expect(state.currentObjective).toBe('intervene');

    state = completeObjective(state, 'intervene', 150);
    expect(state.currentObjective).toBe('evaluate');

    state = completeObjective(state, 'evaluate', 200);
    expect(state.currentObjective).toBeNull();
    expect(state.allCompleted).toBe(true);

    // Save and reload
    saveObservatoryState(state);
    const reloadedState = loadObservatoryState();
    expect(reloadedState.allCompleted).toBe(true);
  });

  it('should allow resumption after dismissing onboarding mid-objectives', () => {
    // Scenario: Player sees FirstRunOnboarding, dismisses it, starts objectives
    let state = createFreshObservatoryState();
    state = dismissOnboarding(state); // FirstRunOnboarding calls this
    saveObservatoryState(state);

    // Simulate first part of session: watch for 50 ticks
    const reloadedState1 = loadObservatoryState();
    let state1 = completeObjective(reloadedState1, 'observe', 50);
    saveObservatoryState(state1);

    // Player reloads before finishing
    const reloadedState2 = loadObservatoryState();
    expect(reloadedState2.isOnboarded).toBe(true);
    expect(reloadedState2.currentObjective).toBe('inspect');
    expect(reloadedState2.objectives.observe.isCompleted).toBe(true);
  });

  it('should not show guide after completion', () => {
    let state = createFreshObservatoryState();
    state = dismissOnboarding(state);

    // Complete all objectives
    state = completeObjective(state, 'observe', 50);
    state = completeObjective(state, 'inspect', 100);
    state = completeObjective(state, 'intervene', 150);
    state = completeObjective(state, 'evaluate', 200);

    saveObservatoryState(state);

    // Reload: guide should not render because allCompleted=true
    const reloadedState = loadObservatoryState();
    expect(reloadedState.allCompleted).toBe(true);
    expect(reloadedState.currentObjective).toBeNull();
  });
});
