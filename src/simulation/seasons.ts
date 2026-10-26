/**
 * Seasonal calendar and season configuration (docs/design-seasons.md, child issue #350).
 *
 * Seasons are a pure function of (tick, latitude, config). Nothing here stores per-tick state,
 * draws randomness, or reads wall-clock time. Season names are display-only derivations and
 * must never be used as simulation input.
 */

/** Smallest allowed season length in ticks; a year must hold at least four seasons of this. */
export const MIN_SEASON_TICKS = 10;

/** Upper bound on the year length. Generous for V1 (1M+ tick runs are a V4 goal). */
export const MAX_YEAR_LENGTH_TICKS = 1_000_000;

/** Axial tilt range in degrees (design: 0–30, Earth-like default 23.5). */
export const MIN_AXIAL_TILT_DEG = 0;
export const MAX_AXIAL_TILT_DEG = 30;

/** Latitude of the grid's top and bottom rows in degrees (design default 45). */
export const MIN_GRID_MAX_LATITUDE_DEG = 0;
export const MAX_GRID_MAX_LATITUDE_DEG = 90;

export interface SeasonConfig {
  /** false = pre-season behaviour, byte-identical. */
  enabled: boolean;
  /** Integer, >= 4 * MIN_SEASON_TICKS, <= MAX_YEAR_LENGTH_TICKS. */
  yearLengthTicks: number;
  /** Degrees, 0..30. Scales the amplitude of hemispheric swings. */
  axialTiltDeg: number;
  /** Integer in [0, yearLengthTicks). Shifts the calendar origin. */
  phaseOffsetTicks: number;
  /** Degrees, 0..90. Latitude of row 0 (north) and the last row (south). */
  gridMaxLatitudeDeg: number;
}

export interface CalendarState {
  /** floor((tick + phaseOffsetTicks) / yearLengthTicks) */
  year: number;
  /** (tick + phaseOffsetTicks) mod yearLengthTicks, integer in [0, yearLengthTicks) */
  dayOfYear: number;
  /** dayOfYear / yearLengthTicks, in [0, 1) */
  yearFraction: number;
}

export type Hemisphere = 'north' | 'south' | 'equator';

export type SeasonName = 'winter' | 'spring' | 'summer' | 'autumn';

/** Default for new worlds (design open question 4). */
export const DEFAULT_SEASON_CONFIG: Readonly<SeasonConfig> = Object.freeze({
  enabled: true,
  yearLengthTicks: 960,
  axialTiltDeg: 23.5,
  phaseOffsetTicks: 0,
  gridMaxLatitudeDeg: 45,
});

/** Config for loaded legacy saves that carry no season block (design: old saves stay identical). */
export const LEGACY_SEASON_CONFIG: Readonly<SeasonConfig> = Object.freeze({
  ...DEFAULT_SEASON_CONFIG,
  enabled: false,
});

/**
 * Returns a list of validation errors; an empty array means the config is valid.
 */
export function validateSeasonConfig(cfg: SeasonConfig): string[] {
  const errors: string[] = [];

  if (typeof cfg.enabled !== 'boolean') {
    errors.push('enabled must be a boolean');
  }

  const year = cfg.yearLengthTicks;
  if (!Number.isInteger(year)) {
    errors.push('yearLengthTicks must be an integer');
  } else {
    if (year < 4 * MIN_SEASON_TICKS) {
      errors.push(`yearLengthTicks must be >= ${4 * MIN_SEASON_TICKS}`);
    }
    if (year > MAX_YEAR_LENGTH_TICKS) {
      errors.push(`yearLengthTicks must be <= ${MAX_YEAR_LENGTH_TICKS}`);
    }
  }

  const tilt = cfg.axialTiltDeg;
  if (typeof tilt !== 'number' || !Number.isFinite(tilt)) {
    errors.push('axialTiltDeg must be a finite number');
  } else if (tilt < MIN_AXIAL_TILT_DEG || tilt > MAX_AXIAL_TILT_DEG) {
    errors.push(`axialTiltDeg must be within [${MIN_AXIAL_TILT_DEG}, ${MAX_AXIAL_TILT_DEG}]`);
  }

  const offset = cfg.phaseOffsetTicks;
  if (!Number.isInteger(offset)) {
    errors.push('phaseOffsetTicks must be an integer');
  } else if (Number.isInteger(year) && year >= 1 && (offset < 0 || offset >= year)) {
    errors.push('phaseOffsetTicks must be within [0, yearLengthTicks)');
  }

  const maxLat = cfg.gridMaxLatitudeDeg;
  if (typeof maxLat !== 'number' || !Number.isFinite(maxLat)) {
    errors.push('gridMaxLatitudeDeg must be a finite number');
  } else if (maxLat < MIN_GRID_MAX_LATITUDE_DEG || maxLat > MAX_GRID_MAX_LATITUDE_DEG) {
    errors.push(
      `gridMaxLatitudeDeg must be within [${MIN_GRID_MAX_LATITUDE_DEG}, ${MAX_GRID_MAX_LATITUDE_DEG}]`,
    );
  }

  return errors;
}

/** Throws a RangeError listing every validation failure. */
export function assertValidSeasonConfig(cfg: SeasonConfig): void {
  const errors = validateSeasonConfig(cfg);
  if (errors.length > 0) {
    throw new RangeError(`Invalid SeasonConfig: ${errors.join('; ')}`);
  }
}

/**
 * Maps a tick to its calendar position. Integer arithmetic on the tick; wraps every
 * yearLengthTicks. The config must already be valid (see validateSeasonConfig).
 * Throws for non-integer or negative ticks.
 */
export function calendarAt(tick: number, cfg: SeasonConfig): CalendarState {
  if (!Number.isInteger(tick) || tick < 0) {
    throw new RangeError(`tick must be a non-negative integer, got ${tick}`);
  }
  const year = cfg.yearLengthTicks;
  if (!Number.isInteger(year) || year < 1) {
    throw new RangeError(`yearLengthTicks must be a positive integer, got ${year}`);
  }
  const t = tick + cfg.phaseOffsetTicks;
  const dayOfYear = t % year;
  return {
    year: Math.floor(t / year),
    dayOfYear,
    yearFraction: dayOfYear / year,
  };
}

/**
 * Signed latitude in degrees for grid row y:
 * gridMaxLatitudeDeg * (1 - 2y / (height - 1)). Row 0 is +max (north), last row is -max (south).
 * A single-row grid is treated as the equator.
 */
export function latitudeDegForRow(y: number, height: number, gridMaxLatitudeDeg: number): number {
  if (!Number.isInteger(y) || y < 0 || !Number.isInteger(height) || y >= height) {
    throw new RangeError(`row ${y} is outside a grid of height ${height}`);
  }
  if (height === 1) return 0;
  return gridMaxLatitudeDeg * (1 - (2 * y) / (height - 1));
}

/**
 * Hemisphere for a signed latitude. |lat| < 1 is the equator (takes precedence),
 * positive is north, negative is south.
 */
export function hemisphereForLatitude(latDeg: number): Hemisphere {
  if (Math.abs(latDeg) < 1) return 'equator';
  return latDeg > 0 ? 'north' : 'south';
}

/**
 * Hemisphere-specific year fraction. The southern hemisphere is offset by half a year, so
 * seasons oppose north/south. Northern and equatorial positions are returned unchanged.
 */
export function hemisphereYearFraction(yearFraction: number, hemisphere: Hemisphere): number {
  if (hemisphere !== 'south') return yearFraction;
  return (yearFraction + 0.5) % 1;
}

const NORTH_SEASON_NAMES: readonly SeasonName[] = ['winter', 'spring', 'summer', 'autumn'];

/**
 * Display-only season name for a position. Quartile of the hemisphere-adjusted year fraction.
 * Returns null on the equator ("no seasons"). Never feed this into the simulation.
 */
export function seasonNameAt(yearFraction: number, hemisphere: Hemisphere): SeasonName | null {
  if (hemisphere === 'equator') return null;
  const adjusted = hemisphereYearFraction(yearFraction, hemisphere);
  const quartile = Math.min(3, Math.floor(adjusted * 4));
  return NORTH_SEASON_NAMES[quartile];
}
