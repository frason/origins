export const TRACE_TOXICITY_THRESHOLD = 0.25;
export const SEVERE_TOXICITY_THRESHOLD = 2;
export const MAX_VISIBLE_TOXICITY = 10;

export type ToxicitySeverity = 'clear' | 'trace' | 'elevated' | 'severe';
export type CorpseDecayStage = 'fresh' | 'peak-miasma' | 'late-decay';

export interface MiasmaSource {
  x: number;
  y: number;
  lifecycleState: 'alive' | 'dead' | 'corpse';
  corpseDecayTicks: number;
}

/** Persistent exposure makes successful reproduction progressively more demanding. */
export function getToxinAdjustedReproductionThreshold(
  baseThreshold: number,
  exposure: number
): number {
  return baseThreshold * (1 + Math.min(1, Math.max(0, exposure)) * 0.2);
}

export function getCorpseDecayStage(
  remainingTicks: number,
  durationTicks: number
): { stage: CorpseDecayStage; label: string; hazardMultiplier: number } {
  const progress = 1 - Math.max(0, remainingTicks) / Math.max(1, durationTicks);
  if (progress < 1 / 3) {
    return { stage: 'fresh', label: 'Fresh', hazardMultiplier: 0.4 };
  }
  if (progress < 2 / 3) {
    return { stage: 'peak-miasma', label: 'Peak miasma', hazardMultiplier: 1.5 };
  }
  return { stage: 'late-decay', label: 'Late decay', hazardMultiplier: 0.6 };
}

/**
 * Measure local mutation pressure from active corpses without conflating it
 * with accumulated toxicity. Peak decay contributes the strongest pressure;
 * distance and completed decomposition remove the effect deterministically.
 */
export function getLocalMiasmaMutationPressure(
  x: number,
  y: number,
  sources: MiasmaSource[],
  radius: number,
  decayDurationTicks: number
): number {
  const boundedRadius = Math.max(0, Math.floor(radius));
  let pressure = 0;
  for (const source of sources) {
    if (
      source.lifecycleState === 'alive'
      || source.corpseDecayTicks <= 0
    ) continue;
    const distance = Math.hypot(source.x - x, source.y - y);
    if (distance > boundedRadius) continue;
    const falloff = boundedRadius === 0
      ? 1
      : 1 - distance / (boundedRadius + 1);
    const stage = getCorpseDecayStage(
      source.corpseDecayTicks,
      decayDurationTicks
    );
    pressure += (stage.hazardMultiplier / 1.5) * falloff;
  }
  return Math.min(1, Math.max(0, pressure));
}

/** Convert local miasma pressure into a bounded per-birth mutation chance. */
export function getMiasmaAdjustedMutationRate(
  baseMutationRate: number,
  pressure: number
): number {
  const base = Math.min(1, Math.max(0, baseMutationRate));
  const boundedPressure = Math.min(1, Math.max(0, pressure));
  // Corpse hotspots make ordinary worlds meaningfully more exploratory without
  // compounding worlds that already opt into a high global mutation rate.
  const hotspotTarget = 0.2;
  return Math.max(
    base,
    Math.min(0.6, base + Math.max(0, hotspotTarget - base) * boundedPressure)
  );
}

export interface ToxicityHazard {
  severity: ToxicitySeverity;
  label: string;
  overlayOpacity: number;
  creatureEnergyCost: number;
  producerGrowthMultiplier: number;
}

/** Shared toxicity thresholds for ecology, rendering, and explanations. */
export function getToxicityHazard(toxicity: number): ToxicityHazard {
  const bounded = Math.max(0, Number.isFinite(toxicity) ? toxicity : 0);
  const producerGrowthMultiplier = 1 / (1 + bounded);
  if (bounded <= 0) {
    return {
      severity: 'clear', label: 'Clear', overlayOpacity: 0,
      creatureEnergyCost: 0, producerGrowthMultiplier,
    };
  }
  if (bounded < TRACE_TOXICITY_THRESHOLD) {
    return {
      severity: 'trace', label: 'Trace residue', overlayOpacity: 0,
      creatureEnergyCost: 0, producerGrowthMultiplier,
    };
  }
  const creatureEnergyCost = Math.min(
    0.5,
    (bounded - TRACE_TOXICITY_THRESHOLD) * 0.08
  );
  if (bounded < SEVERE_TOXICITY_THRESHOLD) {
    const progress = (bounded - TRACE_TOXICITY_THRESHOLD)
      / (SEVERE_TOXICITY_THRESHOLD - TRACE_TOXICITY_THRESHOLD);
    return {
      severity: 'elevated', label: 'Elevated hazard',
      overlayOpacity: 0.08 + progress * 0.2,
      creatureEnergyCost, producerGrowthMultiplier,
    };
  }
  const progress = Math.min(
    1,
    (bounded - SEVERE_TOXICITY_THRESHOLD)
      / (MAX_VISIBLE_TOXICITY - SEVERE_TOXICITY_THRESHOLD)
  );
  return {
    severity: 'severe', label: 'Severe contamination',
    overlayOpacity: 0.28 + progress * 0.44,
    creatureEnergyCost, producerGrowthMultiplier,
  };
}
