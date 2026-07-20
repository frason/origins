export const TRACE_TOXICITY_THRESHOLD = 0.25;
export const SEVERE_TOXICITY_THRESHOLD = 2;
export const MAX_VISIBLE_TOXICITY = 10;

export type ToxicitySeverity = 'clear' | 'trace' | 'elevated' | 'severe';

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
