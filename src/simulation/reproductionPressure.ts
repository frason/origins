export interface ReproductionPressurePolicy {
  pressureStart: number;
  maximumMultiplier: number;
}

/** Convert visible local scarcity into a bounded reproduction energy requirement. */
export function getReproductionPressureMultiplier(
  pressure: number,
  policy: ReproductionPressurePolicy
): number {
  const boundedPressure = Math.max(0, Math.min(1, Number.isFinite(pressure) ? pressure : 0));
  const pressureStart = Math.max(0, Math.min(1, policy.pressureStart));
  const maximumMultiplier = Math.max(1, policy.maximumMultiplier);
  if (boundedPressure <= pressureStart || pressureStart >= 1) return 1;
  const progress = (boundedPressure - pressureStart) / (1 - pressureStart);
  return 1 + progress * (maximumMultiplier - 1);
}

export function applyReproductionPressure(
  threshold: number,
  pressure: number,
  policy: ReproductionPressurePolicy
): number {
  return threshold * getReproductionPressureMultiplier(pressure, policy);
}
