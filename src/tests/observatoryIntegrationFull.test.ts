import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createFreshObservatoryState,
  dismissOnboarding,
  skipObjective,
  completeObjective,
  saveObservatoryState,
  loadObservatoryState,
} from '../ui/observatoryObjectives';

/**
 * Full integration test that simulates Karen's reported issue:
 * Player dismisses onboarding, works on objectives, reloads page,
 * and the guide should resume from where they left off.
 */
describe('Observatory Full Integration - Karen Issue Verification', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should allow guide to resume after player dismisses onboarding and reloads', () => {
    // === FIRST SESSION: INITIAL VISIT ===
    // 1. App loads with fresh state
    let state = loadObservatoryState();
    expect(state.isOnboarded).toBe(false);

    // 2. FirstRunOnboarding is dismissed (player clicks "Start simulation")
    state = dismissOnboarding(state);
    saveObservatoryState(state);
    // FirstRunOnboarding also sets legacy flag
    localStorage.setItem('origins_onboarding_dismissed', 'true');

    expect(state.isOnboarded).toBe(true);
    expect(state.currentObjective).toBe('observe');

    // Check that FirstRunOnboarding render condition returns null now
    const firstRunCondition =
      localStorage.getItem('origins_onboarding_dismissed') !== null ||
      state.isOnboarded === true;
    expect(firstRunCondition).toBe(true);

    // 3. Simulation starts, player watches for a bit and "observe" is completed
    state = completeObjective(state, 'observe', 75);
    saveObservatoryState(state);

    // Check that ObservatoryGuide should render
    const guideRenderCondition =
      state !== null &&
      state.isOnboarded === true &&
      state.allCompleted === false &&
      state.currentObjective !== null;
    expect(guideRenderCondition).toBe(true);
    expect(state.currentObjective).toBe('inspect');

    // === PAGE RELOAD ===
    // New "app session" - simulate full app reinitialization
    localStorage.clear();
    localStorage.setItem('origins_observatory_state', JSON.stringify(state));
    localStorage.setItem('origins_onboarding_dismissed', 'true');

    // App initializes (as if useEffect runs)
    const reloadedState = loadObservatoryState();

    // === CRITICAL CHECKS ===
    // The guide should still work - player should be able to continue
    expect(reloadedState.isOnboarded).toBe(true);
    expect(reloadedState.objectives.observe.isCompleted).toBe(true);
    expect(reloadedState.currentObjective).toBe('inspect');

    // Check guide render condition after reload
    const guideRenderConditionAfterReload =
      reloadedState !== null &&
      reloadedState.isOnboarded === true &&
      reloadedState.allCompleted === false &&
      reloadedState.currentObjective !== null;
    expect(guideRenderConditionAfterReload).toBe(true);
  });

  it('should restore guide even if all objectives were not completed', () => {
    // === FIRST SESSION ===
    let state = createFreshObservatoryState();
    state = dismissOnboarding(state);

    // Complete observe
    state = completeObjective(state, 'observe', 75);
    // Skip inspect (next objective becomes intervene)
    state = skipObjective(state, 'inspect', 100);

    // Save state
    saveObservatoryState(state);
    localStorage.setItem('origins_onboarding_dismissed', 'true');

    // Verify guide should show for intervene
    expect(state.isOnboarded).toBe(true);
    expect(state.currentObjective).toBe('intervene');
    expect(state.allCompleted).toBe(false);

    // === RELOAD ===
    const reloaded = loadObservatoryState();

    // === VERIFY RESUMPTION ===
    expect(reloaded.isOnboarded).toBe(true);
    expect(reloaded.objectives.observe.isCompleted).toBe(true);
    expect(reloaded.objectives.inspect.isSkipped).toBe(true);
    expect(reloaded.currentObjective).toBe('intervene');

    // Guide should definitely render with intervene objective
    const shouldGuideRender =
      reloaded !== null &&
      reloaded.isOnboarded === true &&
      reloaded.allCompleted === false &&
      reloaded.currentObjective !== null;
    expect(shouldGuideRender).toBe(true);
  });

  it('should NOT show guide if all objectives are completed', () => {
    // === COMPLETE ALL OBJECTIVES ===
    let state = createFreshObservatoryState();
    state = dismissOnboarding(state);
    state = completeObjective(state, 'observe', 75);
    state = completeObjective(state, 'inspect', 100);
    state = completeObjective(state, 'intervene', 150);
    state = completeObjective(state, 'evaluate', 200);

    // Verify all are complete
    expect(state.allCompleted).toBe(true);
    expect(state.currentObjective).toBeNull();

    // Guide should NOT render
    const guideRenderCondition =
      state !== null &&
      state.isOnboarded === true &&
      state.allCompleted === false &&
      state.currentObjective !== null;
    expect(guideRenderCondition).toBe(false);

    // Save and reload
    saveObservatoryState(state);
    const reloaded = loadObservatoryState();

    // Should still be complete after reload
    expect(reloaded.allCompleted).toBe(true);
    const reloadedGuideRenderCondition =
      reloaded !== null &&
      reloaded.isOnboarded === true &&
      reloaded.allCompleted === false &&
      reloaded.currentObjective !== null;
    expect(reloadedGuideRenderCondition).toBe(false);
  });

  it('should handle corruption in localStorage gracefully', () => {
    // Save some state
    const state = createFreshObservatoryState();
    const onboarded = dismissOnboarding(state);
    saveObservatoryState(onboarded);

    // Corrupt the localStorage by setting invalid JSON
    localStorage.setItem('origins_observatory_state', 'CORRUPT_DATA{{{');

    // Should fall back to fresh state
    const loaded = loadObservatoryState();
    expect(loaded).toBeTruthy();
    expect(loaded.isOnboarded).toBe(false);
    expect(loaded.currentObjective).toBe('observe');
  });
});
