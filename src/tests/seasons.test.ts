import { describe, it, expect } from 'vitest';
import {
  calendarAt,
  DEFAULT_SEASON_CONFIG,
  LEGACY_SEASON_CONFIG,
  MAX_YEAR_LENGTH_TICKS,
  MIN_SEASON_TICKS,
  hemisphereForLatitude,
  hemisphereYearFraction,
  latitudeDegForRow,
  seasonNameAt,
  validateSeasonConfig,
  assertValidSeasonConfig,
  type SeasonConfig,
} from '../simulation/seasons';

const cfg = (overrides: Partial<SeasonConfig> = {}): SeasonConfig => ({
  ...DEFAULT_SEASON_CONFIG,
  ...overrides,
});

describe('SeasonConfig defaults', () => {
  it('uses a 960-tick year, 23.5 degree tilt, 45 degree grid latitude, enabled for new worlds', () => {
    expect(DEFAULT_SEASON_CONFIG).toEqual({
      enabled: true,
      yearLengthTicks: 960,
      axialTiltDeg: 23.5,
      phaseOffsetTicks: 0,
      gridMaxLatitudeDeg: 45,
    });
  });

  it('defaults validate cleanly', () => {
    expect(validateSeasonConfig(DEFAULT_SEASON_CONFIG)).toEqual([]);
  });

  it('legacy saves default to disabled with otherwise identical fields', () => {
    expect(LEGACY_SEASON_CONFIG.enabled).toBe(false);
    expect({ ...LEGACY_SEASON_CONFIG, enabled: true }).toEqual(DEFAULT_SEASON_CONFIG);
  });
});

describe('validateSeasonConfig', () => {
  it('rejects non-integer and too-short year lengths', () => {
    expect(validateSeasonConfig(cfg({ yearLengthTicks: 960.5 }))).not.toEqual([]);
    expect(validateSeasonConfig(cfg({ yearLengthTicks: 4 * MIN_SEASON_TICKS - 1 }))).not.toEqual([]);
    expect(validateSeasonConfig(cfg({ yearLengthTicks: 4 * MIN_SEASON_TICKS }))).toEqual([]);
  });

  it('rejects year lengths above the maximum', () => {
    expect(validateSeasonConfig(cfg({ yearLengthTicks: MAX_YEAR_LENGTH_TICKS + 1 }))).not.toEqual([]);
    expect(validateSeasonConfig(cfg({ yearLengthTicks: MAX_YEAR_LENGTH_TICKS }))).toEqual([]);
  });

  it('bounds axial tilt to 0..30 degrees', () => {
    expect(validateSeasonConfig(cfg({ axialTiltDeg: -0.1 }))).not.toEqual([]);
    expect(validateSeasonConfig(cfg({ axialTiltDeg: 30.1 }))).not.toEqual([]);
    expect(validateSeasonConfig(cfg({ axialTiltDeg: NaN }))).not.toEqual([]);
    expect(validateSeasonConfig(cfg({ axialTiltDeg: 0 }))).toEqual([]);
    expect(validateSeasonConfig(cfg({ axialTiltDeg: 30 }))).toEqual([]);
  });

  it('requires phase offset to be an integer in [0, yearLengthTicks)', () => {
    expect(validateSeasonConfig(cfg({ phaseOffsetTicks: 1.5 }))).not.toEqual([]);
    expect(validateSeasonConfig(cfg({ phaseOffsetTicks: -1 }))).not.toEqual([]);
    expect(validateSeasonConfig(cfg({ phaseOffsetTicks: 960 }))).not.toEqual([]);
    expect(validateSeasonConfig(cfg({ phaseOffsetTicks: 959 }))).toEqual([]);
  });

  it('bounds grid max latitude to 0..90 degrees', () => {
    expect(validateSeasonConfig(cfg({ gridMaxLatitudeDeg: -1 }))).not.toEqual([]);
    expect(validateSeasonConfig(cfg({ gridMaxLatitudeDeg: 90.5 }))).not.toEqual([]);
    expect(validateSeasonConfig(cfg({ gridMaxLatitudeDeg: 90 }))).toEqual([]);
  });

  it('rejects a non-boolean enabled flag', () => {
    expect(validateSeasonConfig(cfg({ enabled: 1 as unknown as boolean }))).not.toEqual([]);
  });

  it('assertValidSeasonConfig throws a RangeError on invalid input', () => {
    expect(() => assertValidSeasonConfig(cfg({ yearLengthTicks: 3 }))).toThrow(RangeError);
    expect(() => assertValidSeasonConfig(DEFAULT_SEASON_CONFIG)).not.toThrow();
  });
});

describe('calendarAt', () => {
  it('starts at year 0, day 0 at tick 0 with no offset', () => {
    expect(calendarAt(0, cfg())).toEqual({ year: 0, dayOfYear: 0, yearFraction: 0 });
  });

  it('wraps to day 0 of the next year exactly at the year boundary', () => {
    expect(calendarAt(959, cfg())).toEqual({ year: 0, dayOfYear: 959, yearFraction: 959 / 960 });
    expect(calendarAt(960, cfg())).toEqual({ year: 1, dayOfYear: 0, yearFraction: 0 });
    expect(calendarAt(961, cfg())).toEqual({ year: 1, dayOfYear: 1, yearFraction: 1 / 960 });
  });

  it('wraps correctly across many years without drift', () => {
    const c = calendarAt(9600, cfg());
    expect(c.year).toBe(10);
    expect(c.dayOfYear).toBe(0);
    expect(calendarAt(9600 + 240, cfg()).yearFraction).toBe(0.25);
  });

  it('keeps yearFraction in [0, 1) for every tick in several years', () => {
    const c = cfg({ yearLengthTicks: 40 });
    for (let t = 0; t < 400; t++) {
      const s = calendarAt(t, c);
      expect(s.yearFraction).toBeGreaterThanOrEqual(0);
      expect(s.yearFraction).toBeLessThan(1);
      expect(Number.isInteger(s.dayOfYear)).toBe(true);
      expect(s.year * 40 + s.dayOfYear).toBe(t);
    }
  });

  it('applies phase offset to the calendar origin', () => {
    // offset 240 means tick 0 is already the start of spring-quarter (day 240)
    expect(calendarAt(0, cfg({ phaseOffsetTicks: 240 }))).toEqual({
      year: 0,
      dayOfYear: 240,
      yearFraction: 0.25,
    });
    // offset wraps the year: tick 720 with offset 240 is day 0 of year 1
    expect(calendarAt(720, cfg({ phaseOffsetTicks: 240 }))).toEqual({
      year: 1,
      dayOfYear: 0,
      yearFraction: 0,
    });
  });

  it('rejects non-integer or negative ticks', () => {
    expect(() => calendarAt(1.5, cfg())).toThrow(RangeError);
    expect(() => calendarAt(-1, cfg())).toThrow(RangeError);
  });
});

describe('latitude and hemisphere', () => {
  it('row 0 is +max, last row is -max, middle row is the equator', () => {
    expect(latitudeDegForRow(0, 101, 45)).toBe(45);
    expect(latitudeDegForRow(100, 101, 45)).toBe(-45);
    expect(latitudeDegForRow(50, 101, 45)).toBe(0);
  });

  it('classifies hemispheres, with the equator band taking precedence', () => {
    expect(hemisphereForLatitude(30)).toBe('north');
    expect(hemisphereForLatitude(-30)).toBe('south');
    expect(hemisphereForLatitude(0)).toBe('equator');
    expect(hemisphereForLatitude(0.9)).toBe('equator');
    expect(hemisphereForLatitude(-0.9)).toBe('equator');
    expect(hemisphereForLatitude(1)).toBe('north');
  });
});

describe('hemisphere phase offset', () => {
  it('shifts the southern hemisphere by half a year', () => {
    expect(hemisphereYearFraction(0, 'south')).toBe(0.5);
    expect(hemisphereYearFraction(0.5, 'south')).toBe(0);
    expect(hemisphereYearFraction(0.25, 'south')).toBe(0.75);
  });

  it('leaves northern and equatorial fractions unchanged', () => {
    expect(hemisphereYearFraction(0.25, 'north')).toBe(0.25);
    expect(hemisphereYearFraction(0.25, 'equator')).toBe(0.25);
  });

  it('north and south season names oppose at the same tick', () => {
    // north spring is quartile 1 (0.25); south at the same tick is autumn
    expect(seasonNameAt(0.25, 'north')).toBe('spring');
    expect(seasonNameAt(0.25, 'south')).toBe('autumn');
    expect(seasonNameAt(0.75, 'north')).toBe('autumn');
    expect(seasonNameAt(0.75, 'south')).toBe('spring');
    expect(seasonNameAt(0, 'north')).toBe('winter');
    expect(seasonNameAt(0, 'south')).toBe('summer');
  });

  it('returns no season on the equator', () => {
    expect(seasonNameAt(0.25, 'equator')).toBeNull();
  });

  it('wraps season names with the calendar across years', () => {
    const c = cfg();
    expect(seasonNameAt(calendarAt(240 + 960 * 3, c).yearFraction, 'north')).toBe('spring');
  });
});
