export type HealthTone = 'danger' | 'warning' | 'stable' | 'healthy';

export interface BadgeState {
  label: string;
  tone: HealthTone;
}

export function getBiodiversityState(speciesCount: number): BadgeState {
  if (speciesCount >= 5) return { label: `${speciesCount} species`, tone: 'healthy' };
  if (speciesCount >= 2) return { label: `${speciesCount} species`, tone: 'warning' };
  return { label: `${Math.max(0, speciesCount)} species`, tone: 'danger' };
}

export function getEcosystemHealth({
  speciesCount,
  totalPopulation,
  totalBiomass,
  tick,
  previousPopulation,
}: {
  speciesCount: number;
  totalPopulation: number;
  totalBiomass: number;
  tick: number;
  previousPopulation: number;
}): BadgeState {
  const isDropping =
    previousPopulation > 0 && totalPopulation < previousPopulation * 0.9;

  if (totalPopulation === 0 || totalBiomass === 0) {
    return { label: 'Collapsing', tone: 'danger' };
  }
  if (isDropping || speciesCount <= 2) {
    return { label: 'At Risk', tone: 'warning' };
  }
  if (speciesCount >= 5 && tick > 100) {
    return { label: 'Thriving', tone: 'healthy' };
  }
  return { label: 'Stable', tone: 'stable' };
}
