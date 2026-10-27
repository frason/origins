/**
 * Creature seasonal responses: breeding windows, cold metabolism, dormancy and a migration
 * bias (docs/design-seasons.md, child issue #354).
 *
 * Every response is a pure function of its inputs (season curve values in basis points, a
 * year fraction and a hemisphere). No RNG, no wall-clock time, no per-tick state.
 *
 * Gating: when `SeasonConfig.enabled` is false every function returns its neutral value
 * (multiplier 1, bias 0), so disabled seasons are byte-identical to pre-season behaviour.
 *
 * Creatures never read season names. Breeding windows are keyed by quartile index (0-3) of the
 * hemisphere-adjusted year fraction; names are display-only and never used here.
 */

import type { Hemisphere, SeasonConfig } from './seasons';
import { hemisphereYearFraction } from './seasons';
import { BP_ONE } from './seasonCurves';
import { SEASON_EFFECTS } from './seasonEffects';

/** Precision used when rounding a multiplier before it leaves this module. */
const MULTIPLIER_PRECISION = 1e6;

/**
 * Tunable creature response constants (design "Seasonal effects as data-table constants",
 * Metabolism and Reproduction rows). Proposed defaults from the design.
 */
export interface SeasonResponseTable {
  /** Extra metabolic cost at seasonal temperature 0 (linear; 0 extra at temperature 1). */
  metabolismColdScale: number;
  /** Multiplier on metabolism while dormant (snow cover at or above SEASON_EFFECTS.growthDormantAtSnowBP). */
  dormantMetabolismScale: number;
  /** Seasonal temperature (BP) below which creatures do not breed. */
  reproductionColdFloorBP: number;
  /** Breeding multiplier by quartile index of the hemisphere-adjusted year fraction. */
  breedingWindow: readonly [number, number, number, number];
  /** Cold-stress strength for the migration bias (0 = no bias). */
  migrationColdBiasWeight: number;
}

/**
 * Quartile order matches seasons.ts NORTH_SEASON_NAMES: 0 winter, 1 spring, 2 summer, 3 autumn.
 * Design defaults: spring and summer 1.0, autumn 0.6, winter 0.2.
 */
export const SEASON_RESPONSES: Readonly<SeasonResponseTable> = Object.freeze({
  metabolismColdScale: 0.3,
  dormantMetabolismScale: 0.35,
  reproductionColdFloorBP: 2500,
  breedingWindow: Object.freeze([0.2, 1.0, 1.0, 0.6]) as readonly [number, number, number, number],
  migrationColdBiasWeight: 1.0,
});

/** Gate shared by every response: only `enabled` matters. */
type SeasonGate = Pick<SeasonConfig, 'enabled'>;

function assertBP(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > BP_ONE) {
    throw new RangeError(`${name} must be an integer in [0, ${BP_ONE}], got ${value}`);
  }
}

function assertYearFraction(yearFraction: number): void {
  if (!Number.isFinite(yearFraction) || yearFraction < 0 || yearFraction >= 1) {
    throw new RangeError(`yearFraction must be in [0, 1), got ${yearFraction}`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundMultiplier(value: number): number {
  return Math.round(value * MULTIPLIER_PRECISION) / MULTIPLIER_PRECISION;
}

/**
 * Quartile index (0-3) of the hemisphere-adjusted year fraction. Equator has no seasons and
 * returns null.
 */
export function breedingQuartileIndex(yearFraction: number, hemisphere: Hemisphere): number | null {
  assertYearFraction(yearFraction);
  if (hemisphere === 'equator') return null;
  const adjusted = hemisphereYearFraction(yearFraction, hemisphere);
  return Math.min(3, Math.floor(adjusted * 4));
}

/**
 * Breeding-window multiplier in [0, 1] for a cell's hemisphere and year fraction.
 *
 * - Disabled seasons: 1.
 * - Equator (no seasons): 1.
 * - Otherwise the quartile's entry in `breedingWindow`.
 * - Seasonal temperature below `reproductionColdFloorBP`: 0 (no breeding in the cold).
 *
 * Multiplies the base reproduction chance; it never replaces the base rule.
 */
export function breedingWindowMultiplier(
  input: { yearFraction: number; hemisphere: Hemisphere; seasonalTempBP: number },
  cfg: SeasonGate,
  table: Readonly<SeasonResponseTable> = SEASON_RESPONSES,
): number {
  if (!cfg.enabled) return 1;
  assertBP('seasonalTempBP', input.seasonalTempBP);
  if (input.seasonalTempBP < table.reproductionColdFloorBP) return 0;

  const quartile = breedingQuartileIndex(input.yearFraction, input.hemisphere);
  if (quartile === null) return 1;
  return roundMultiplier(clamp(table.breedingWindow[quartile], 0, 1));
}

/**
 * Cold metabolism multiplier, >= 1: `1 + metabolismColdScale · (1 - temp)`.
 * 1.3 at seasonal temperature 0, 1.0 at temperature 1. Disabled seasons: 1.
 */
export function coldMetabolismMultiplier(
  seasonalTempBP: number,
  cfg: SeasonGate,
  table: Readonly<SeasonResponseTable> = SEASON_RESPONSES,
): number {
  if (!cfg.enabled) return 1;
  assertBP('seasonalTempBP', seasonalTempBP);
  const coldness = 1 - seasonalTempBP / BP_ONE;
  return roundMultiplier(1 + table.metabolismColdScale * coldness);
}

/**
 * Dormancy metabolism multiplier: `dormantMetabolismScale` while snow cover is at or above the
 * producer dormancy threshold (SEASON_EFFECTS.growthDormantAtSnowBP, the same snow signal), else 1.
 * Disabled seasons: 1.
 */
export function dormancyMetabolismMultiplier(
  snowCoverBP: number,
  cfg: SeasonGate,
  table: Readonly<SeasonResponseTable> = SEASON_RESPONSES,
): number {
  if (!cfg.enabled) return 1;
  assertBP('snowCoverBP', snowCoverBP);
  return snowCoverBP >= SEASON_EFFECTS.growthDormantAtSnowBP
    ? roundMultiplier(table.dormantMetabolismScale)
    : 1;
}

/**
 * Combined seasonal metabolism multiplier: cold metabolism × dormancy metabolism, rounded.
 * Applied to base metabolic cost only. Disabled seasons: 1.
 */
export function seasonalMetabolismMultiplier(
  input: { seasonalTempBP: number; snowCoverBP: number },
  cfg: SeasonGate,
  table: Readonly<SeasonResponseTable> = SEASON_RESPONSES,
): number {
  if (!cfg.enabled) return 1;
  const cold = coldMetabolismMultiplier(input.seasonalTempBP, cfg, table);
  const dormant = dormancyMetabolismMultiplier(input.snowCoverBP, cfg, table);
  return roundMultiplier(cold * dormant);
}

/**
 * Migration bias in [0, 1]: how strongly a cold-stressed creature should prefer warmer
 * cells. Zero at or above `reproductionColdFloorBP`; rises linearly to
 * `migrationColdBiasWeight` at temperature 0. Disabled seasons: 0.
 *
 * This is a bias only (design Q3 default). Full migration is out of scope and no movement
 * code consumes this value yet.
 */
export function seasonalMigrationBias(
  seasonalTempBP: number,
  cfg: SeasonGate,
  table: Readonly<SeasonResponseTable> = SEASON_RESPONSES,
): number {
  if (!cfg.enabled) return 0;
  assertBP('seasonalTempBP', seasonalTempBP);
  if (seasonalTempBP >= table.reproductionColdFloorBP) return 0;
  const ramp = 1 - seasonalTempBP / table.reproductionColdFloorBP;
  return roundMultiplier(clamp(table.migrationColdBiasWeight * ramp, 0, 1));
}
