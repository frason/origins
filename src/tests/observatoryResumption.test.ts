import { describe, it, expect, beforeEach } from 'vitest';
import {
  createFreshObservatoryState,
  dismissOnboarding,
  saveObservatoryState,
  loadObservatoryState,
  completeObjective
} from '../ui/observatoryObjectives';

describe('Observatory State Persistence - Resumption Scenario', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and restores observatory state across simulated reloads', () => {
    // === FIRST VISIT ===
    // Player starts, sees FirstRunOnboarding
    const fresh = createFreshObservatoryState();
    expect(fresh.isOnboarded).toBe(false);
    expect(fresh.currentObjective).toBe('observe');

    // Player dismisses FirstRunOnboarding, which sets isOnboarded and saves
    const onboarded = dismissOnboarding(fresh);
    saveObservatoryState(onboarded);
    expect(localStorage.getItem('origins_observatory_state')).toBeTruthy();

    // === SIMULATE PAGE RELOAD ===
    // App reinitializes, loads from localStorage
    const reloaded = loadObservatoryState();

    // This should restore the saved state, NOT create fresh
    expect(reloaded.isOnboarded).toBe(true);
    expect(reloaded.currentObjective).toBe('observe');
    expect(reloaded.objectives.observe.isCompleted).toBe(false);
  });

  it('resumes incomplete objectives after reload', () => {
    // First session: complete observe objective
    const fresh = createFreshObservatoryState();
    const onboarded = dismissOnboarding(fresh);
    const updated = completeObjective(onboarded, 'observe', 50);
    saveObservatoryState(updated);

    // === RELOAD ===
    const reloaded = loadObservatoryState();

    // Should still be onboarded
    expect(reloaded.isOnboarded).toBe(true);
    // Observe should be complete
    expect(reloaded.objectives.observe.isCompleted).toBe(true);
    // Should advance to inspect
    expect(reloaded.currentObjective).toBe('inspect');
  });

  it('preserves all objective state including skipped objectives', () => {
    const fresh = createFreshObservatoryState();
    const onboarded = dismissOnboarding(fresh);

    // Complete observe, skip inspect
    let state = completeObjective(onboarded, 'observe', 50);
    // Skip inspect (this should advance to intervene)
    const skipObjective = (s: any, id: string, tick: number) => {
      const updated = {
        ...s,
        objectives: {
          ...s.objectives,
          [id]: {
            ...s.objectives[id],
            isSkipped: true,
          },
        },
        lastUpdateTick: tick,
      };
      // Advance to next
      const objectives: any[] = ['observe', 'inspect', 'intervene', 'evaluate'];
      for (const obj of objectives) {
        if (!updated.objectives[obj].isCompleted && !updated.objectives[obj].isSkipped) {
          return { ...updated, currentObjective: obj };
        }
      }
      return { ...updated, currentObjective: null, allCompleted: true };
    };

    state = skipObjective(state, 'inspect', 60);
    saveObservatoryState(state);

    // === RELOAD ===
    const reloaded = loadObservatoryState();
    expect(reloaded.isOnboarded).toBe(true);
    expect(reloaded.objectives.observe.isCompleted).toBe(true);
    expect(reloaded.objectives.inspect.isSkipped).toBe(true);
    expect(reloaded.currentObjective).toBe('intervene');
  });
});
