import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  type ObjectiveType,
  type ObservatoryState,
  createFreshObservatoryState,
  advanceToNextObjective,
  completeObjective,
  skipObjective,
  dismissOnboarding,
  shouldAutoPauseForObservation,
  loadObservatoryState,
  saveObservatoryState,
} from '../ui/observatoryObjectives';

describe('observatoryObjectives', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('createFreshObservatoryState', () => {
    it('creates a fresh state with all objectives incomplete', () => {
      const state = createFreshObservatoryState();

      expect(state.isOnboarded).toBe(false);
      expect(state.currentObjective).toBe('observe');
      expect(state.allCompleted).toBe(false);
      expect(state.lastUpdateTick).toBe(0);

      // All objectives should be incomplete
      expect(state.objectives.observe.isCompleted).toBe(false);
      expect(state.objectives.inspect.isCompleted).toBe(false);
      expect(state.objectives.intervene.isCompleted).toBe(false);
      expect(state.objectives.evaluate.isCompleted).toBe(false);

      // None should be skipped
      expect(state.objectives.observe.isSkipped).toBe(false);
      expect(state.objectives.inspect.isSkipped).toBe(false);
      expect(state.objectives.intervene.isSkipped).toBe(false);
      expect(state.objectives.evaluate.isSkipped).toBe(false);
    });

    it('creates objectives with proper titles and hints', () => {
      const state = createFreshObservatoryState();

      expect(state.objectives.observe.title).toBe('Observe a Trend');
      expect(state.objectives.inspect.title).toBe('Inspect a Tile');
      expect(state.objectives.intervene.title).toBe('Make an Intervention');
      expect(state.objectives.evaluate.title).toBe('Evaluate the Result');

      // Hints should be present
      expect(state.objectives.observe.hint).toBeTruthy();
      expect(state.objectives.inspect.hint).toBeTruthy();
      expect(state.objectives.intervene.hint).toBeTruthy();
      expect(state.objectives.evaluate.hint).toBeTruthy();
    });
  });

  describe('completeObjective', () => {
    it('marks an objective as completed and advances to next', () => {
      let state = createFreshObservatoryState();
      expect(state.currentObjective).toBe('observe');

      state = completeObjective(state, 'observe', 50);
      expect(state.objectives.observe.isCompleted).toBe(true);
      expect(state.objectives.observe.completedAtTick).toBe(50);
      expect(state.currentObjective).toBe('inspect');
    });

    it('advances through all objectives in order', () => {
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
    });

    it('updates lastUpdateTick', () => {
      let state = createFreshObservatoryState();
      state = completeObjective(state, 'observe', 75);
      expect(state.lastUpdateTick).toBe(75);
    });
  });

  describe('skipObjective', () => {
    it('marks an objective as skipped and advances to next', () => {
      let state = createFreshObservatoryState();
      state = skipObjective(state, 'observe', 50);

      expect(state.objectives.observe.isSkipped).toBe(true);
      expect(state.currentObjective).toBe('inspect');
    });

    it('can skip multiple objectives', () => {
      let state = createFreshObservatoryState();
      state = skipObjective(state, 'observe', 50);
      state = skipObjective(state, 'inspect', 60);
      state = skipObjective(state, 'intervene', 70);

      expect(state.currentObjective).toBe('evaluate');
      expect(state.allCompleted).toBe(false); // Not completed, just skipped to last
    });

    it('completes when all objectives are skipped', () => {
      let state = createFreshObservatoryState();
      state = skipObjective(state, 'observe', 50);
      state = skipObjective(state, 'inspect', 60);
      state = skipObjective(state, 'intervene', 70);
      state = skipObjective(state, 'evaluate', 80);

      expect(state.currentObjective).toBeNull();
      expect(state.allCompleted).toBe(true);
    });
  });

  describe('advanceToNextObjective', () => {
    it('finds the next incomplete objective', () => {
      const state = createFreshObservatoryState();
      const updated = {
        ...state,
        objectives: {
          ...state.objectives,
          observe: { ...state.objectives.observe, isCompleted: true },
        },
      };

      const result = advanceToNextObjective(updated);
      expect(result.currentObjective).toBe('inspect');
    });

    it('skips skipped objectives', () => {
      const state = createFreshObservatoryState();
      const updated = {
        ...state,
        objectives: {
          ...state.objectives,
          observe: { ...state.objectives.observe, isSkipped: true },
          inspect: { ...state.objectives.inspect, isSkipped: true },
        },
      };

      const result = advanceToNextObjective(updated);
      expect(result.currentObjective).toBe('intervene');
    });

    it('returns null when all objectives are done', () => {
      const state = createFreshObservatoryState();
      const updated = {
        ...state,
        objectives: {
          observe: { ...state.objectives.observe, isCompleted: true },
          inspect: { ...state.objectives.inspect, isCompleted: true },
          intervene: { ...state.objectives.intervene, isCompleted: true },
          evaluate: { ...state.objectives.evaluate, isCompleted: true },
        },
      };

      const result = advanceToNextObjective(updated);
      expect(result.currentObjective).toBeNull();
      expect(result.allCompleted).toBe(true);
    });
  });

  describe('dismissOnboarding', () => {
    it('marks isOnboarded as true', () => {
      const state = createFreshObservatoryState();
      expect(state.isOnboarded).toBe(false);

      const updated = dismissOnboarding(state);
      expect(updated.isOnboarded).toBe(true);
    });
  });

  describe('shouldAutoPauseForObservation', () => {
    it('pauses when first creatures appear', () => {
      const shouldPause = shouldAutoPauseForObservation(
        15, // tick
        5, // previousTick
        5, // creatureCount
        0, // previousCreatureCount
        0, // totalDeaths
        0 // previousTotalDeaths
      );
      expect(shouldPause).toBe(true);
    });

    it('does not pause on early ticks', () => {
      const shouldPause = shouldAutoPauseForObservation(
        5, // tick
        4, // previousTick (diff = 1, less than 10)
        3, // creatureCount
        3, // previousCreatureCount
        0, // totalDeaths
        0 // previousTotalDeaths
      );
      expect(shouldPause).toBe(false);
    });

    it('pauses on significant population increase', () => {
      const shouldPause = shouldAutoPauseForObservation(
        50, // tick
        40, // previousTick (diff >= 10)
        25, // creatureCount
        20, // previousCreatureCount (25-20 = 5, which is 25% of 20)
        0, // totalDeaths
        0 // previousTotalDeaths
      );
      expect(shouldPause).toBe(true);
    });

    it('pauses on first extinction', () => {
      const shouldPause = shouldAutoPauseForObservation(
        50, // tick
        40, // previousTick
        10, // creatureCount
        10, // previousCreatureCount
        1, // totalDeaths
        0 // previousTotalDeaths
      );
      expect(shouldPause).toBe(true);
    });

    it('does not pause on many deaths', () => {
      const shouldPause = shouldAutoPauseForObservation(
        150, // tick
        140, // previousTick
        100, // creatureCount (stable population, no significant change)
        100, // previousCreatureCount (100 - 100 = 0, no delta)
        20, // totalDeaths
        10 // previousTotalDeaths
      );
      expect(shouldPause).toBe(false); // totalDeaths (20) > 5, so no pause
    });
  });

  describe('localStorage persistence', () => {
    it('saves and loads observatory state', () => {
      const state = createFreshObservatoryState();
      const updated = completeObjective(state, 'observe', 50);

      saveObservatoryState(updated);
      const loaded = loadObservatoryState();

      expect(loaded.objectives.observe.isCompleted).toBe(true);
      expect(loaded.currentObjective).toBe('inspect');
    });

    it('returns fresh state if localStorage is empty', () => {
      const loaded = loadObservatoryState();
      expect(loaded.isOnboarded).toBe(false);
      expect(loaded.currentObjective).toBe('observe');
    });

    it('returns fresh state if localStorage is corrupt', () => {
      localStorage.setItem('origins_observatory_state', 'not valid json');
      const loaded = loadObservatoryState();
      expect(loaded.isOnboarded).toBe(false);
      expect(loaded.currentObjective).toBe('observe');
    });
  });

  describe('deterministic progression', () => {
    it('progresses deterministically through objectives', () => {
      // Simulate a player completing the objectives in order
      let state = createFreshObservatoryState();
      const ticks = [50, 100, 150, 200];
      const objectives: ObjectiveType[] = ['observe', 'inspect', 'intervene', 'evaluate'];

      objectives.forEach((obj, index) => {
        state = completeObjective(state, obj, ticks[index]);
      });

      expect(state.objectives.observe.completedAtTick).toBe(50);
      expect(state.objectives.inspect.completedAtTick).toBe(100);
      expect(state.objectives.intervene.completedAtTick).toBe(150);
      expect(state.objectives.evaluate.completedAtTick).toBe(200);
      expect(state.allCompleted).toBe(true);
    });

    it('produces same progression with same inputs', () => {
      // Verify that same inputs always produce same outputs
      const state1 = createFreshObservatoryState();
      let result1 = completeObjective(state1, 'observe', 50);
      result1 = completeObjective(result1, 'inspect', 100);

      const state2 = createFreshObservatoryState();
      let result2 = completeObjective(state2, 'observe', 50);
      result2 = completeObjective(result2, 'inspect', 100);

      expect(result1.currentObjective).toBe(result2.currentObjective);
      expect(result1.objectives.observe.completedAtTick).toBe(result2.objectives.observe.completedAtTick);
    });
  });
});
