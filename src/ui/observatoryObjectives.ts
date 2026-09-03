/**
 * Observatory Objectives System
 *
 * First-run guided play loop teaching players to:
 * 1. Observe - Watch the ecosystem for interesting trends/changes
 * 2. Inspect - Click a tile or species to understand local conditions
 * 3. Intervene - Make one God Mode intervention to test cause and effect
 * 4. Evaluate - Review the intervention's impact
 *
 * The system tracks progress through localStorage for persistence.
 * All checks are deterministic: same world seed + same player actions = same progression.
 */

export type ObjectiveType = 'observe' | 'inspect' | 'intervene' | 'evaluate';

export interface ObjectiveState {
  id: ObjectiveType;
  title: string;
  description: string;
  hint: string;
  isCompleted: boolean;
  isSkipped: boolean;
  completedAtTick?: number;
}

export interface ObservatoryState {
  isOnboarded: boolean; // User dismissed the welcome dialog
  objectives: Record<ObjectiveType, ObjectiveState>;
  currentObjective: ObjectiveType | null; // Which objective to prompt for now
  allCompleted: boolean;
  lastUpdateTick: number;
}

const OBJECTIVE_DEFAULTS: Record<ObjectiveType, Omit<ObjectiveState, 'isCompleted' | 'isSkipped'>> = {
  observe: {
    id: 'observe',
    title: 'Observe a Trend',
    description: 'Watch the ecosystem change in real time. Look for population shifts, species interactions, or resource patterns. You will use these observations as evidence of cause and effect.',
    hint: 'Watch the colored dots (creatures) and the green areas (plant food). Notice how populations grow and shrink.',
  },
  inspect: {
    id: 'inspect',
    title: 'Inspect a Tile',
    description: 'Click on a grid tile or a species in the left panel to see detailed information about that location or lineage.',
    hint: 'Click on a colored area in the world or a species name on the left to open the tile info panel.',
  },
  intervene: {
    id: 'intervene',
    title: 'Make an Intervention',
    description: 'Use God Mode to adjust world settings. Try a small change and predict what will happen. You can replay with the same seed later to verify cause and effect.',
    hint: 'Open the Control Panel on the right, then find "God Mode / Intervention" to adjust a setting.',
  },
  evaluate: {
    id: 'evaluate',
    title: 'Evaluate the Result',
    description: 'Review how your intervention affected the ecosystem. The Intervention Impact panel shows evidence of what changed. Compare before and after to see the cause-and-effect relationship.',
    hint: 'Check the Intervention Impact panel (middle-right) to see population changes, energy shifts, and other metrics that show the impact of your adjustment.',
  },
};

/**
 * Create fresh observatory state for a new player
 */
export function createFreshObservatoryState(): ObservatoryState {
  return {
    isOnboarded: false,
    objectives: Object.entries(OBJECTIVE_DEFAULTS).reduce(
      (acc, [key, defaults]) => {
        acc[key as ObjectiveType] = {
          ...defaults,
          isCompleted: false,
          isSkipped: false,
        };
        return acc;
      },
      {} as Record<ObjectiveType, ObjectiveState>
    ),
    currentObjective: 'observe',
    allCompleted: false,
    lastUpdateTick: 0,
  };
}

/**
 * Progress to the next incomplete objective
 */
export function advanceToNextObjective(state: ObservatoryState): ObservatoryState {
  const objectives: ObjectiveType[] = ['observe', 'inspect', 'intervene', 'evaluate'];

  for (const obj of objectives) {
    if (!state.objectives[obj].isCompleted && !state.objectives[obj].isSkipped) {
      return { ...state, currentObjective: obj };
    }
  }

  // All completed or skipped
  return {
    ...state,
    currentObjective: null,
    allCompleted: true,
  };
}

/**
 * Mark an objective as completed
 */
export function completeObjective(
  state: ObservatoryState,
  objectiveId: ObjectiveType,
  tick: number
): ObservatoryState {
  const updated = {
    ...state,
    objectives: {
      ...state.objectives,
      [objectiveId]: {
        ...state.objectives[objectiveId],
        isCompleted: true,
        completedAtTick: tick,
      },
    },
    lastUpdateTick: tick,
  };
  return advanceToNextObjective(updated);
}

/**
 * Skip the current objective (user chooses to skip)
 */
export function skipObjective(
  state: ObservatoryState,
  objectiveId: ObjectiveType,
  tick: number
): ObservatoryState {
  const updated = {
    ...state,
    objectives: {
      ...state.objectives,
      [objectiveId]: {
        ...state.objectives[objectiveId],
        isSkipped: true,
      },
    },
    lastUpdateTick: tick,
  };
  return advanceToNextObjective(updated);
}

/**
 * Mark the welcome onboarding dialog as dismissed
 */
export function dismissOnboarding(state: ObservatoryState): ObservatoryState {
  return {
    ...state,
    isOnboarded: true,
  };
}

/**
 * Load observatory state from localStorage
 * Returns fresh state if not found or invalid
 */
export function loadObservatoryState(): ObservatoryState {
  try {
    const stored = localStorage.getItem('origins_observatory_state');
    if (stored) {
      return JSON.parse(stored) as ObservatoryState;
    }
  } catch {
    // Corrupt data, fall back to fresh
  }
  return createFreshObservatoryState();
}

/**
 * Save observatory state to localStorage
 */
export function saveObservatoryState(state: ObservatoryState): void {
  try {
    localStorage.setItem('origins_observatory_state', JSON.stringify(state));
  } catch {
    // Storage full or unavailable, silently fail
  }
}

/**
 * Check if we should auto-pause on this tick
 * Triggers at meaningful moments: first creature move, first species death, etc.
 */
export function shouldAutoPauseForObservation(
  tick: number,
  previousTick: number,
  creatureCount: number,
  previousCreatureCount: number,
  totalDeaths: number,
  previousTotalDeaths: number
): boolean {
  // Don't pause too frequently
  if (tick - previousTick < 10) return false;

  // Pause when first creatures appear
  if (previousCreatureCount === 0 && creatureCount > 0) return true;

  // Pause when a significant population change occurs
  const populationDelta = Math.abs(creatureCount - previousCreatureCount);
  if (previousCreatureCount > 0 && populationDelta > previousCreatureCount * 0.2) return true;

  // Pause on first extinction or significant death event
  if (totalDeaths > previousTotalDeaths && totalDeaths <= 5) return true;

  return false;
}
