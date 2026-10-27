/**
 * Pure view-models for the seasons UI (docs/design-seasons.md "UI needs", child issue #356).
 *
 * Every number shown to the player is derived from the same pure functions the simulation uses
 * (calendarAt, seasonCurves, seasonEffects, seasonResponses), so the forecast cannot disagree
 * with what the engine will do. Nothing here stores state or reads wall-clock time.
 */

import {
  BP_ONE,
  daylightBP,
  seasonalTempBP,
  snowCoverBP,
} from '../simulation/seasonCurves';
import { seasonalEvaporationMultiplier, seasonalGrowthMultiplier } from '../simulation/seasonEffects';
import { breedingQuartileIndex, breedingWindowMultiplier, seasonalMetabolismMultiplier } from '../simulation/seasonResponses';
import {
  calendarAt,
  hemisphereForLatitude,
  latitudeDegForRow,
  seasonNameAt,
  type Hemisphere,
  type SeasonConfig,
  type SeasonName,
} from '../simulation/seasons';

/** Multipliers the forecast reports. All are relative to the pre-season baseline of 1. */
export interface SeasonMultipliers {
  growth: number;
  metabolism: number;
  breeding: number;
}

/** Predicted change (next boundary minus now) for each multiplier. */
export interface SeasonMultiplierChanges {
  growth: number;
  metabolism: number;
  breeding: number;
}

export interface SeasonForecast {
  hemisphere: Hemisphere;
  currentSeason: SeasonName | null;
  /** Next season that begins at `nextBoundaryTick`; null on the equator. */
  nextSeason: SeasonName | null;
  nextBoundaryTick: number | null;
  ticksUntilBoundary: number | null;
  current: SeasonMultipliers;
  next: SeasonMultipliers | null;
  changes: SeasonMultiplierChanges | null;
}

export interface CalendarBarModel {
  year: number;
  dayOfYear: number;
  yearLengthTicks: number;
  /** Progress through the year, 0..100. */
  progressPct: number;
  northSeason: SeasonName | null;
  southSeason: SeasonName | null;
  cursorHemisphere: Hemisphere | null;
}

export interface TileSeasonReadout {
  latitudeDeg: number;
  hemisphere: Hemisphere;
  seasonsEnabled: boolean;
  /** Seasonal values are null when seasons are disabled. */
  daylightBP: number | null;
  seasonalTempBP: number | null;
  snowCoverBP: number | null;
  evaporationMultiplier: number | null;
}

/** Same rounding the simulation uses for basis-point conversion of a 0..1 temperature. */
export function temperatureToBP(temperature: number): number {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(temperature) ? temperature : 0));
  return Math.round(clamped * BP_ONE);
}

function roundDelta(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function multipliersAt(
  tick: number,
  cfg: SeasonConfig,
  latDeg: number,
  baseTempBP: number,
): SeasonMultipliers {
  const { yearFraction } = calendarAt(tick, cfg);
  const hemisphere = hemisphereForLatitude(latDeg);
  const daylight = daylightBP(latDeg, yearFraction, cfg.axialTiltDeg);
  const temp = seasonalTempBP(baseTempBP, latDeg, yearFraction, cfg.axialTiltDeg);
  const snow = snowCoverBP(baseTempBP, latDeg, yearFraction, cfg.axialTiltDeg);
  return {
    growth: seasonalGrowthMultiplier({ daylightBP: daylight, seasonalTempBP: temp, snowCoverBP: snow }),
    metabolism: seasonalMetabolismMultiplier({ seasonalTempBP: temp, snowCoverBP: snow }, cfg),
    breeding: breedingWindowMultiplier({ yearFraction, hemisphere, seasonalTempBP: temp }, cfg),
  };
}

/**
 * First tick after `tick` at which the hemisphere's season quartile changes. Season boundaries
 * are at most ceil(yearLengthTicks / 4) ticks apart, so the scan is bounded by one year.
 * Uses breedingQuartileIndex, the same quartile the simulation keys breeding on.
 */
export function nextSeasonBoundaryTick(
  tick: number,
  cfg: SeasonConfig,
  hemisphere: Hemisphere,
): number | null {
  if (hemisphere === 'equator') return null;
  const startQuartile = breedingQuartileIndex(calendarAt(tick, cfg).yearFraction, hemisphere);
  for (let d = 1; d <= cfg.yearLengthTicks; d++) {
    const t = tick + d;
    if (breedingQuartileIndex(calendarAt(t, cfg).yearFraction, hemisphere) !== startQuartile) {
      return t;
    }
  }
  return null;
}

/**
 * Forecast for a latitude (the selected hemisphere's representative row) and a base cell
 * temperature. Returns null when seasons are disabled.
 */
export function buildSeasonForecast(input: {
  tick: number;
  cfg: SeasonConfig;
  latitudeDeg: number;
  baseTemperatureBP?: number;
}): SeasonForecast | null {
  const { tick, cfg, latitudeDeg } = input;
  if (!cfg.enabled) return null;
  const baseTempBP = input.baseTemperatureBP ?? BP_ONE / 2;
  const hemisphere = hemisphereForLatitude(latitudeDeg);
  const { yearFraction } = calendarAt(tick, cfg);
  const current = multipliersAt(tick, cfg, latitudeDeg, baseTempBP);
  const boundary = nextSeasonBoundaryTick(tick, cfg, hemisphere);

  if (boundary === null) {
    return {
      hemisphere,
      currentSeason: seasonNameAt(yearFraction, hemisphere),
      nextSeason: null,
      nextBoundaryTick: null,
      ticksUntilBoundary: null,
      current,
      next: null,
      changes: null,
    };
  }

  const next = multipliersAt(boundary, cfg, latitudeDeg, baseTempBP);
  return {
    hemisphere,
    currentSeason: seasonNameAt(yearFraction, hemisphere),
    nextSeason: seasonNameAt(calendarAt(boundary, cfg).yearFraction, hemisphere),
    nextBoundaryTick: boundary,
    ticksUntilBoundary: boundary - tick,
    current,
    next,
    changes: {
      growth: roundDelta(next.growth - current.growth),
      metabolism: roundDelta(next.metabolism - current.metabolism),
      breeding: roundDelta(next.breeding - current.breeding),
    },
  };
}

/** Calendar bar model. Caller must validate the config first. */
export function buildCalendarBarModel(
  tick: number,
  cfg: SeasonConfig,
  cursorLatitudeDeg?: number,
): CalendarBarModel {
  const cal = calendarAt(tick, cfg);
  return {
    year: cal.year,
    dayOfYear: cal.dayOfYear,
    yearLengthTicks: cfg.yearLengthTicks,
    progressPct: Math.round(cal.yearFraction * 1000) / 10,
    northSeason: seasonNameAt(cal.yearFraction, 'north'),
    southSeason: seasonNameAt(cal.yearFraction, 'south'),
    cursorHemisphere: cursorLatitudeDeg === undefined ? null : hemisphereForLatitude(cursorLatitudeDeg),
  };
}

/** Tile tooltip readout for grid cell row `y`. Seasonal fields are null when seasons are off. */
export function buildTileSeasonReadout(input: {
  tick: number;
  cfg: SeasonConfig;
  y: number;
  height: number;
  temperature: number;
}): TileSeasonReadout {
  const { tick, cfg, y, height } = input;
  const latitudeDeg = latitudeDegForRow(y, height, cfg.gridMaxLatitudeDeg);
  const hemisphere = hemisphereForLatitude(latitudeDeg);
  if (!cfg.enabled) {
    return {
      latitudeDeg,
      hemisphere,
      seasonsEnabled: false,
      daylightBP: null,
      seasonalTempBP: null,
      snowCoverBP: null,
      evaporationMultiplier: null,
    };
  }
  const { yearFraction } = calendarAt(tick, cfg);
  const baseTempBP = temperatureToBP(input.temperature);
  const temp = seasonalTempBP(baseTempBP, latitudeDeg, yearFraction, cfg.axialTiltDeg);
  return {
    latitudeDeg,
    hemisphere,
    seasonsEnabled: true,
    daylightBP: daylightBP(latitudeDeg, yearFraction, cfg.axialTiltDeg),
    seasonalTempBP: temp,
    snowCoverBP: snowCoverBP(baseTempBP, latitudeDeg, yearFraction, cfg.axialTiltDeg),
    evaporationMultiplier: seasonalEvaporationMultiplier(temp),
  };
}

/** Basis points to a whole-percent label, e.g. 5000 -> "50%". */
export function formatBP(bp: number): string {
  return `${Math.round(bp / (BP_ONE / 100))}%`;
}

/** Multiplier label, e.g. 0.8 -> "×0.80". */
export function formatMultiplier(value: number): string {
  return `×${value.toFixed(2)}`;
}

/** Signed change label, e.g. -0.25 -> "−0.25", 0 -> "±0.00". */
export function formatChange(value: number): string {
  if (value === 0) return '±0.00';
  const abs = Math.abs(value).toFixed(2);
  return value > 0 ? `+${abs}` : `−${abs}`;
}

export function capitalise(name: SeasonName | null): string {
  if (name === null) return 'No seasons';
  return name.charAt(0).toUpperCase() + name.slice(1);
}
