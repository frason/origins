import type { EnergyStrategy } from '../utils/traits';

/**
 * Hue encodes what a creature eats, not which species it is.
 *
 * Species used to hash straight to an arbitrary hue, so a carnivore and a
 * herbivore could land on near-identical colours and diet was unreadable on
 * the map. Each strategy now owns a hue band; species vary only *within* their
 * band, so relatives look alike and diet stays legible at a glance.
 *
 * Bands are chosen to survive the terrain behind them: the map is dominated by
 * green biomass, tan arid ground and blue water, so the bands sit away from
 * those and run at high saturation.
 */
const STRATEGY_HUE: Record<EnergyStrategy, number> = {
  carnivore: 358,
  omnivore: 38,
  herbivore: 200,
  scavenger: 288,
};

/** How far a species may drift from its strategy's hue, in degrees. */
const HUE_SPREAD = 15;
const SATURATION = 0.82;
const BASE_LIGHTNESS = 0.55;
const LIGHTNESS_SPREAD = 0.08;

export type Rgb = [number, number, number];

/** Stable 32-bit hash so a species keeps the same shade across ticks and reloads. */
function hashSpeciesId(speciesId: string): number {
  let hash = 0;
  for (let index = 0; index < speciesId.length; index++) {
    hash = (hash << 5) - hash + speciesId.charCodeAt(index);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - c / 2;

  const [r, g, b] =
    hue < 60 ? [c, x, 0]
    : hue < 120 ? [x, c, 0]
    : hue < 180 ? [0, c, x]
    : hue < 240 ? [0, x, c]
    : hue < 300 ? [x, 0, c]
    : [c, 0, x];

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

/** The representative colour for a diet, used by the legend and tile detail. */
export function strategyColor(strategy: EnergyStrategy): Rgb {
  return hslToRgb(STRATEGY_HUE[strategy], SATURATION, BASE_LIGHTNESS);
}

/**
 * A species' colour: its strategy's hue, nudged within the band so species in
 * the same diet are distinguishable without being mistaken for another diet.
 */
export function creatureColor(strategy: EnergyStrategy, speciesId: string): Rgb {
  const hash = hashSpeciesId(speciesId);
  // Map the hash onto [-1, 1] so the drift is symmetric around the base hue.
  const offset = ((hash % 1000) / 999) * 2 - 1;
  const hue = (STRATEGY_HUE[strategy] + offset * HUE_SPREAD + 360) % 360;
  const lightness = BASE_LIGHTNESS
    + (((hash >> 10) % 1000) / 999) * LIGHTNESS_SPREAD * 2
    - LIGHTNESS_SPREAD;
  return hslToRgb(hue, SATURATION, lightness);
}

export function rgbToCss([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/** Legend order: the diets a player meets most often come first. */
export const STRATEGY_LEGEND: ReadonlyArray<{ strategy: EnergyStrategy; label: string }> = [
  { strategy: 'herbivore', label: 'Herbivore' },
  { strategy: 'carnivore', label: 'Carnivore' },
  { strategy: 'omnivore', label: 'Omnivore' },
  { strategy: 'scavenger', label: 'Scavenger' },
];
