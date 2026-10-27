/**
 * Seasonal multipliers for producer growth and water evaporation (docs/design-seasons.md, #353).
 *
 * Every effect is a multiplier applied to an existing base value. Inputs are the integer
 * basis-point signals from seasonCurves.ts, so the results are a pure function of
 * (tick, latitude, config) with no RNG and no wall-clock time. Multipliers are rounded to 1e-6
 * before use so that replay is portable.
 *
 * Season names are never inputs; these functions read continuous curve values only.
 */

import {
  BP_ONE,
  daylightBP,
  seasonalTempBP,
  snowCoverBP,
} from './seasonCurves';
import {
  assertValidSeasonConfig,
  calendarAt,
  latitudeDegForRow,
  type SeasonConfig,
} from './seasons';

/** Precision used when rounding a multiplier before it leaves this module. */
const MULTIPLIER_PRECISION = 1e6;

/**
 * Tunable seasonal effect constants (design "Seasonal effects as data-table constants").
 * Thresholds that are compared against basis-point signals are stored in BP.
 */
export interface SeasonEffectTable {
  /** Share of producer growth that tracks daylight; the remainder is season-independent. */
  growthDaylightWeight: number;
  /** Snow cover (BP) at or above which producers are dormant: growth multiplier is 0. */
  growthDormantAtSnowBP: number;
  /** Seasonal temperature (BP) below which growth ramps linearly down to 0 at temperature 0. */
  growthColdFloorBP: number;
  /** Strength of the temperature effect on evaporation at the temperature extremes. */
  evapTempSensitivity: number;
  /** Lower clamp on the evaporation multiplier. */
  evapMinScale: number;
  /** Upper clamp on the evaporation multiplier. */
  evapMaxScale: number;
}

/** Default seasonal effect table (proposed defaults from the design; 0.85 and 0.18 as BP). */
export const SEASON_EFFECTS: Readonly<SeasonEffectTable> = Object.freeze({
  growthDaylightWeight: 0.6,
  growthDormantAtSnowBP: 8500,
  growthColdFloorBP: 1800,
  evapTempSensitivity: 0.5,
  evapMinScale: 0.4,
  evapMaxScale: 1.6,
});

/** Growth multiplier is bounded to [0, 1]: seasons only suppress growth, never boost it. */
export const GROWTH_MULTIPLIER_MIN = 0;
export const GROWTH_MULTIPLIER_MAX = 1;

export interface SeasonalGrowthInput {
  /** Daylight fraction in BP, from daylightBP(). */
  daylightBP: number;
  /** Seasonal temperature in BP, from seasonalTempBP(). */
  seasonalTempBP: number;
  /** Snow cover in BP, from snowCoverBP(). */
  snowCoverBP: number;
}

function assertBP(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > BP_ONE) {
    throw new RangeError(`${name} must be an integer in [0, ${BP_ONE}], got ${value}`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundMultiplier(value: number): number {
  return Math.round(value * MULTIPLIER_PRECISION) / MULTIPLIER_PRECISION;
}

/**
 * Producer growth multiplier for one cell and season, in [0, 1].
 *
 * - Dormancy: snow cover at or above `growthDormantAtSnowBP` returns exactly 0. Existing biomass
 *   is untouched by growth; it is not decayed here.
 * - Daylight: `(1 - w) + w · daylight`, with w = growthDaylightWeight.
 * - Cold: below `growthColdFloorBP` the multiplier ramps linearly to 0 at temperature 0.
 *
 * Callers with seasons disabled must not pass a multiplier; growth defaults to 1, which is
 * the pre-season behaviour.
 */
export function seasonalGrowthMultiplier(
  input: SeasonalGrowthInput,
  table: Readonly<SeasonEffectTable> = SEASON_EFFECTS,
): number {
  assertBP('daylightBP', input.daylightBP);
  assertBP('seasonalTempBP', input.seasonalTempBP);
  assertBP('snowCoverBP', input.snowCoverBP);

  if (input.snowCoverBP >= table.growthDormantAtSnowBP) return 0;

  const w = table.growthDaylightWeight;
  const daylightFactor = (1 - w) + w * (input.daylightBP / BP_ONE);

  const coldFactor = input.seasonalTempBP >= table.growthColdFloorBP
    ? 1
    : input.seasonalTempBP / table.growthColdFloorBP;

  return roundMultiplier(
    clamp(daylightFactor * coldFactor, GROWTH_MULTIPLIER_MIN, GROWTH_MULTIPLIER_MAX),
  );
}

/**
 * Evaporation multiplier from seasonal temperature (BP). Equator-neutral at 5000 BP:
 * `1 + evapTempSensitivity · (temp - 0.5) / 0.5`, clamped to [evapMinScale, evapMaxScale].
 *
 * Used per cell by applySeasonalEvaporation() when seasons are enabled.
 */
export function seasonalEvaporationMultiplier(
  seasonalTempBP: number,
  table: Readonly<SeasonEffectTable> = SEASON_EFFECTS,
): number {
  assertBP('seasonalTempBP', seasonalTempBP);
  const tempNorm = (seasonalTempBP - BP_ONE / 2) / (BP_ONE / 2); // [-1, 1]
  const raw = 1 + table.evapTempSensitivity * tempNorm;
  return roundMultiplier(clamp(raw, table.evapMinScale, table.evapMaxScale));
}

/** Per-cell seasonal growth multiplier: receives grid x, row y and the cell's static terrain. */
export type SeasonalGrowthAt = (x: number, y: number, cell: { temperature: number }) => number;

export function temperatureToBP(temperature: number): number {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(temperature) ? temperature : 0));
  return Math.round(clamped * BP_ONE);
}

/**
 * Builds the per-cell growth multiplier for one tick, or returns undefined when seasons are
 * disabled (callers then use the pre-season default of 1). The calendar is evaluated once per
 * tick; latitude and seasonal curves are derived per row/cell. Pure: no RNG, no wall-clock time.
 */
export function createSeasonalGrowthAt(
  cfg: SeasonConfig,
  tick: number,
  height: number,
  table: Readonly<SeasonEffectTable> = SEASON_EFFECTS,
): SeasonalGrowthAt | undefined {
  if (!cfg.enabled) return undefined;
  assertValidSeasonConfig(cfg);
  const { yearFraction } = calendarAt(tick, cfg);
  return (_x, y, cell) => {
    const latDeg = latitudeDegForRow(y, height, cfg.gridMaxLatitudeDeg);
    const baseTempBP = temperatureToBP(cell.temperature);
    return seasonalGrowthMultiplier({
      daylightBP: daylightBP(latDeg, yearFraction, cfg.axialTiltDeg),
      seasonalTempBP: seasonalTempBP(baseTempBP, latDeg, yearFraction, cfg.axialTiltDeg),
      snowCoverBP: snowCoverBP(baseTempBP, latDeg, yearFraction, cfg.axialTiltDeg),
    }, table);
  };
}

/**
 * Base per-tick evaporation rate: fraction of a cell's standing water lost per tick at
 * multiplier 1. Proposal constant (#353); the design table does not fix a value. At the
 * default, a tick loses at most 0.08% of depth (multiplier clamped to evapMaxScale 1.6).
 */
export const SEASON_EVAPORATION_BASE_RATE = 0.0005;

/**
 * Standing water left after one tick of evaporation. Pure and bounded: the result is always
 * in [0, depth] for depth >= 0, so evaporation can never create water or drive depth negative.
 */
export function evaporatedDepth(
  depth: number,
  multiplier: number,
  baseRate: number = SEASON_EVAPORATION_BASE_RATE,
): number {
  if (!Number.isFinite(depth) || depth <= 0) return 0;
  if (!Number.isFinite(multiplier) || multiplier < 0) {
    throw new RangeError(`evaporation multiplier must be a finite non-negative number, got ${multiplier}`);
  }
  const fraction = clamp(baseRate * multiplier, 0, 1);
  return depth - depth * fraction;
}

/**
 * Per-cell evaporation multiplier for one tick, or undefined when seasons are disabled.
 * Uses the same seasonal temperature curve as growth, so evaporation is latitude-dependent.
 */
export function createSeasonalEvaporationAt(
  cfg: SeasonConfig,
  tick: number,
  height: number,
  table: Readonly<SeasonEffectTable> = SEASON_EFFECTS,
): SeasonalGrowthAt | undefined {
  if (!cfg.enabled) return undefined;
  assertValidSeasonConfig(cfg);
  const { yearFraction } = calendarAt(tick, cfg);
  return (_x, y, cell) => {
    const latDeg = latitudeDegForRow(y, height, cfg.gridMaxLatitudeDeg);
    const baseTempBP = temperatureToBP(cell.temperature);
    const tempBP = seasonalTempBP(baseTempBP, latDeg, yearFraction, cfg.axialTiltDeg);
    return seasonalEvaporationMultiplier(tempBP, table);
  };
}

/** Minimal cell/world surface needed by applySeasonalEvaporation (keeps the helper testable). */
export interface EvaporationWorld {
  width: number;
  height: number;
  getCell(x: number, y: number): { waterDepth: number; temperature: number };
  setCell(x: number, y: number, cell: { waterDepth: number }): void;
}

/**
 * Applies one tick of seasonal evaporation to every wet cell's waterDepth, in row-major order
 * (same order as growProducers). Deterministic; consumes no RNG. Dry cells are not touched.
 * Only called by the engine when seasons are enabled.
 */
export function applySeasonalEvaporation(world: EvaporationWorld, evaporationAt: SeasonalGrowthAt): void {
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const cell = world.getCell(x, y);
      if (!(cell.waterDepth > 0)) continue;
      const next = evaporatedDepth(cell.waterDepth, evaporationAt(x, y, cell));
      if (next !== cell.waterDepth) world.setCell(x, y, { waterDepth: next });
    }
  }
}
