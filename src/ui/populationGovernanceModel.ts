import type { WorldSnapshot } from '../state/store';

type CreatureView = WorldSnapshot['creatures'][number];

export interface PopulationGovernanceSummary {
  living: number;
  safetyLimit: number;
  safetyUtilization: number;
  locallyRestrained: number;
  populationLabel: string;
  breedingLabel: string;
  atSafetyLimit: boolean;
}

/**
 * Explain the distinction between ecological pressure and the deterministic
 * performance guard. This derives display state only; it never governs births.
 */
export function buildPopulationGovernanceSummary(
  creatures: readonly CreatureView[],
  configuredSafetyLimit: number
): PopulationGovernanceSummary {
  const safetyLimit = Math.max(1, Math.floor(configuredSafetyLimit));
  let living = 0;
  let locallyRestrained = 0;
  for (const creature of creatures) {
    if (creature.lifecycleState !== 'alive') continue;
    living++;
    if ((creature.reproductionPressureMultiplier ?? 1) > 1) locallyRestrained++;
  }
  const atSafetyLimit = living >= safetyLimit;
  return {
    living,
    safetyLimit,
    safetyUtilization: living / safetyLimit,
    locallyRestrained,
    populationLabel: `${living.toLocaleString()} / ${safetyLimit.toLocaleString()}`,
    breedingLabel: atSafetyLimit
      ? 'Births await turnover'
      : locallyRestrained > 0
        ? `${locallyRestrained.toLocaleString()} locally restrained`
        : 'Low local pressure',
    atSafetyLimit,
  };
}
