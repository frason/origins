/**
 * Watch Integration
 *
 * Integrates watch evaluation with the simulation engine and UI state.
 * Called after each tick to evaluate watches and generate new alerts.
 */

import type { EngineState } from './engine';
import type { EcosystemWatch, EcosystemAlert } from './watches';
import { evaluateAllWatches, updateWatchAfterAlert } from './watchEngine';
import { speciesDisplayName } from './speciesNames';

/**
 * Evaluate all watches against the current engine state
 * Returns the updated watches (with rate-limiting state) and new alerts
 */
export function evaluateWatchesForTick(
  watches: EcosystemWatch[],
  engineState: EngineState
): {
  updatedWatches: EcosystemWatch[];
  newAlerts: EcosystemAlert[];
} {
  const newAlerts = evaluateAllWatches(watches, engineState, new Map(
    engineState.speciesProfiles.map((p) => [p.id, { name: speciesDisplayName(p.id) }])
  ));

  // Update watches with rate-limiting state after alert generation
  const updatedWatches = watches.map((watch) => {
    const alertForWatch = newAlerts.find((a) => a.watchId === watch.id);
    return alertForWatch ? updateWatchAfterAlert(watch, alertForWatch) : watch;
  });

  return {
    updatedWatches,
    newAlerts,
  };
}
