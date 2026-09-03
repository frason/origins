import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createFreshObservatoryState,
  dismissOnboarding,
  saveObservatoryState,
  loadObservatoryState,
  completeObjective
} from '../ui/observatoryObjectives';

/**
 * Integration test: Simulate the app initialization flow as it would
 * happen in App.tsx when the component mounts.
 *
 * This tests the scenario Karen identified: ensure that observatory state
 * is actually loaded from localStorage and persists across app reloads.
 */
describe('Observatory State App Initialization Flow', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes with fresh state on first visit', () => {
    // Simulate App.tsx initialization when localStorage is empty
    const loadedState = loadObservatoryState();

    // Should create fresh state
    expect(loadedState.isOnboarded).toBe(false);
    expect(loadedState.currentObjective).toBe('observe');
  });

  it('loads saved state after FirstRunOnboarding is dismissed', () => {
    // === FIRST VISIT SIMULATION ===
    // 1. App initializes with fresh state
    let appState = loadObservatoryState();
    expect(appState.isOnboarded).toBe(false);

    // 2. FirstRunOnboarding dismisses and saves state
    const onboarded = dismissOnboarding(appState);
    saveObservatoryState(onboarded);

    // 3. FirstRunOnboarding also sets legacy flag (line 32 in FirstRunOnboarding.tsx)
    localStorage.setItem('origins_onboarding_dismissed', 'true');

    // === SIMULATE PAGE RELOAD ===
    // App mounts again and initializes
    const reloadedState = loadObservatoryState();

    // CRITICAL: Should load the saved state with isOnboarded=true
    // NOT create a fresh state with isOnboarded=false
    expect(reloadedState.isOnboarded).toBe(true);
    expect(reloadedState.currentObjective).toBe('observe');
  });

  it('resumes incomplete objectives after reload (full scenario)', () => {
    // === FIRST SESSION ===
    // Player completes observe objective
    let state = createFreshObservatoryState();
    const onboarded = dismissOnboarding(state);
    state = completeObjective(onboarded, 'observe', 50);
    saveObservatoryState(state);
    localStorage.setItem('origins_onboarding_dismissed', 'true');

    // Player's current objective should be inspect
    expect(state.currentObjective).toBe('inspect');
    expect(state.objectives.observe.isCompleted).toBe(true);

    // === PAGE RELOAD (before completing all objectives) ===
    const reloadedState = loadObservatoryState();

    // CRITICAL: Should preserve completion state and current objective
    expect(reloadedState.isOnboarded).toBe(true);
    expect(reloadedState.objectives.observe.isCompleted).toBe(true);
    expect(reloadedState.currentObjective).toBe('inspect');
    expect(reloadedState.allCompleted).toBe(false);

    // === SECOND SESSION CONTINUES ===
    // Player can now inspect and complete that objective
    let state2 = completeObjective(reloadedState, 'inspect', 100);
    expect(state2.currentObjective).toBe('intervene');
    expect(state2.objectives.inspect.isCompleted).toBe(true);

    // Save before reloading again
    saveObservatoryState(state2);

    // === ANOTHER RELOAD ===
    const reloadedState2 = loadObservatoryState();
    expect(reloadedState2.isOnboarded).toBe(true);
    expect(reloadedState2.objectives.observe.isCompleted).toBe(true);
    expect(reloadedState2.objectives.inspect.isCompleted).toBe(true);
    expect(reloadedState2.currentObjective).toBe('intervene');
  });

  it('guides render condition: after onboarding and in progress', () => {
    // Setup: First session completed, state saved with isOnboarded=true
    const fresh = createFreshObservatoryState();
    const onboarded = dismissOnboarding(fresh);
    saveObservatoryState(onboarded);
    localStorage.setItem('origins_onboarding_dismissed', 'true');

    // === RELOAD ===
    const loadedState = loadObservatoryState();

    // Check ObservatoryGuide render conditions
    const shouldRender =
      loadedState !== null &&
      loadedState.isOnboarded === true &&
      loadedState.allCompleted === false &&
      loadedState.currentObjective !== null;

    expect(shouldRender).toBe(true);
    expect(loadedState.currentObjective).toBe('observe');
  });
});
