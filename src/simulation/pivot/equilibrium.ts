/**
 * EquilibriumTracker — Phase 0 equilibrium progress meter
 *
 * Tracks the ecosystem's progress toward equilibrium using:
 * - Order (ecosystem health score >= 50)
 * - Chaos (event intensity score >= 40)
 * - Exploration (mutation/genetic diversity score >= 40)
 * - Replacement ratio (births/deaths: mean 0.95–1.05, coefficient of variation <= 0.10)
 *
 * All four conditions must hold simultaneously over a consecutive 2,000-tick streak.
 * Streak resets on intervention, freezes when paused.
 */

export interface EquilibriumProgress {
  /** Current streak length (0–2000+) */
  streakLength: number;
  /** Are all four conditions currently met? */
  allConditionsMet: boolean;
  /** True only if streak >= 2000 and all conditions currently met */
  readyForCompletion: boolean;
}

export interface Building {
  id: string;
  x: number;
  y: number;
  state: 'operational' | 'dormant' | 'demolished';
  decayTicks: number;
  builtAtTick: number;
}

export class EquilibriumTracker {
  private streakLength = 0;
  private replacementWindow: number[] = [];
  private lastConditionsState = false;

  private readonly WINDOW_SIZE = 2000;
  private readonly ORDER_MIN = 50;
  private readonly CHAOS_MIN = 40;
  private readonly EXPLORATION_MIN = 40;
  private readonly REPLACEMENT_MEAN_MIN = 0.95;
  private readonly REPLACEMENT_MEAN_MAX = 1.05;
  private readonly REPLACEMENT_CV_MAX = 0.10;

  /**
   * Record a tick's metrics and intervention/pause state.
   *
   * @param order Order score (0–100, from ecosystemHealth)
   * @param chaos Chaos score (0–100, from ecosystemHealth)
   * @param exploration Exploration score (0–100, from ecosystemHealth)
   * @param replacementValue Current replacement ratio (births / deaths, or NaN if none)
   * @param wasIntervention True if an InterventionCommand was just applied
   * @param wasPaused True if simulation was paused this tick
   */
  recordTick(
    order: number,
    chaos: number,
    exploration: number,
    replacementValue: number,
    wasIntervention: boolean,
    wasPaused: boolean
  ): void {
    // Rule 1: Intervention resets the streak completely
    if (wasIntervention) {
      this.streakLength = 0;
      this.replacementWindow = [];
      this.lastConditionsState = false;
      return;
    }

    // Rule 2: Pausing freezes the streak (no advance, no reset, no window update)
    if (wasPaused) {
      return;
    }

    // Rule 3: Record replacement value and evaluate conditions
    // Add replacement value to the rolling window
    if (!isNaN(replacementValue)) {
      this.replacementWindow.push(replacementValue);
      if (this.replacementWindow.length > this.WINDOW_SIZE) {
        this.replacementWindow.shift();
      }
    }

    // Check if all four conditions are met at this tick
    const conditionsMet = this.checkAllConditions(order, chaos, exploration);

    // Update streak: increment if conditions met, reset if not
    if (conditionsMet) {
      this.streakLength++;
    } else {
      this.streakLength = 0;
    }

    this.lastConditionsState = conditionsMet;
  }

  /**
   * Get the current equilibrium progress.
   */
  getProgress(): EquilibriumProgress {
    return {
      streakLength: this.streakLength,
      allConditionsMet: this.lastConditionsState,
      readyForCompletion: this.streakLength >= 2000 && this.lastConditionsState,
    };
  }

  /**
   * Serialize the equilibrium tracker state for checkpoints.
   * Returns the internal state needed to restore the tracker after a reload.
   */
  getState() {
    return {
      streakLength: this.streakLength,
      replacementWindow: [...this.replacementWindow], // copy to prevent external mutation
      lastConditionsState: this.lastConditionsState,
    };
  }

  /**
   * Restore the equilibrium tracker state from a serialized checkpoint.
   * @param state Previously saved state from getState()
   */
  setState(state: { streakLength: number; replacementWindow: number[]; lastConditionsState: boolean }) {
    this.streakLength = state.streakLength;
    this.replacementWindow = [...state.replacementWindow]; // copy to prevent external mutation
    this.lastConditionsState = state.lastConditionsState;
  }

  /**
   * Check all four equilibrium conditions simultaneously.
   */
  private checkAllConditions(order: number, chaos: number, exploration: number): boolean {
    // Condition 1: Order >= 50
    if (order < this.ORDER_MIN) {
      return false;
    }

    // Condition 2: Chaos >= 40
    if (chaos < this.CHAOS_MIN) {
      return false;
    }

    // Condition 3: Exploration >= 40
    if (exploration < this.EXPLORATION_MIN) {
      return false;
    }

    // Condition 4: Replacement ratio mean 0.95–1.05 AND CV <= 0.10
    return this.checkReplacementCondition();
  }

  /**
   * Check the replacement ratio condition:
   * mean in [0.95, 1.05] AND coefficient of variation <= 0.10
   */
  private checkReplacementCondition(): boolean {
    // Need at least one sample to calculate statistics
    if (this.replacementWindow.length === 0) {
      return false;
    }

    // Calculate mean
    const mean = this.replacementWindow.reduce((a, b) => a + b, 0) / this.replacementWindow.length;

    // Check mean is in range
    if (mean < this.REPLACEMENT_MEAN_MIN || mean > this.REPLACEMENT_MEAN_MAX) {
      return false;
    }

    // Calculate coefficient of variation
    // CV = stdDev / mean
    const sumSquaredDev = this.replacementWindow.reduce(
      (sum, val) => sum + Math.pow(val - mean, 2),
      0
    );
    const variance = sumSquaredDev / this.replacementWindow.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : Infinity;

    return cv <= this.REPLACEMENT_CV_MAX;
  }
}

/**
 * Check if the world has achieved full equilibrium completion:
 * - All four equilibrium conditions must be met AND streak >= 2000
 * - Every standing building must be in the demolished state (not dormant/operational)
 *
 * The infrastructure-demolished gate ensures the player has fully decommissioned
 * the built environment as part of achieving the equilibrium win condition.
 * If no buildings were ever built, this check is vacuously true.
 *
 * @param progress EquilibriumProgress from tracker.getProgress()
 * @param buildings Array of buildings in the world
 * @returns true only when equilibrium is ready AND all buildings are demolished
 */
export function checkFullCompletion(progress: EquilibriumProgress, buildings: Building[]): boolean {
  // First check: the equilibrium streak must be complete
  if (!progress.readyForCompletion) {
    return false;
  }

  // Second check: all buildings must be demolished
  // If there are no buildings, this is vacuously true
  for (const building of buildings) {
    if (building.state !== 'demolished') {
      return false;
    }
  }

  return true;
}
