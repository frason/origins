import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  BP_ONE,
  PHASE_ONE,
  SEASON_CURVE_CONSTANTS,
  SINE_QUARTER_TABLE,
  daylightBP,
  insolationBP,
  latitudeToPhase,
  seasonalTempBP,
  sineBP,
  snowCoverBP,
  sinLatitudeBP,
  tiltFactorBP,
  yearFractionToPhase,
} from '../simulation/seasonCurves';

const YEAR_FRACTIONS = Array.from({ length: 40 }, (_, i) => i / 40);
const BASE_TEMP = 5000;
const EARTH_TILT = 23.5;

describe('sine table', () => {
  it('quarter table is frozen, has 257 entries, and spans 0..10000', () => {
    expect(SINE_QUARTER_TABLE).toHaveLength(257);
    expect(SINE_QUARTER_TABLE[0]).toBe(0);
    expect(SINE_QUARTER_TABLE[256]).toBe(BP_ONE);
    expect(Object.isFrozen(SINE_QUARTER_TABLE)).toBe(true);
    for (let i = 1; i < SINE_QUARTER_TABLE.length; i++) {
      expect(SINE_QUARTER_TABLE[i]).toBeGreaterThanOrEqual(SINE_QUARTER_TABLE[i - 1]);
    }
  });

  it('hits exact cardinal points of the circle', () => {
    expect(sineBP(0)).toBe(0);
    expect(sineBP(PHASE_ONE / 4)).toBe(BP_ONE);
    expect(sineBP(PHASE_ONE / 2)).toBe(0);
    expect(sineBP((3 * PHASE_ONE) / 4)).toBe(-BP_ONE);
  });

  it('stays within 2 basis points of the true sine (reference check, tests only)', () => {
    for (let phase = 0; phase < PHASE_ONE; phase += 97) {
      const truth = 10000 * Math.sin((2 * Math.PI * phase) / PHASE_ONE);
      expect(Math.abs(sineBP(phase) - truth)).toBeLessThanOrEqual(2);
    }
  });

  it('is exactly odd: sin(-x) = -sin(x) on the integer grid', () => {
    for (let phase = 1; phase < PHASE_ONE / 2; phase += 331) {
      expect(sineBP(PHASE_ONE - phase)).toBe(-sineBP(phase));
    }
  });

  it('rejects non-integer or out-of-range phases', () => {
    expect(() => sineBP(1.5)).toThrow(RangeError);
    expect(() => sineBP(-1)).toThrow(RangeError);
    expect(() => sineBP(PHASE_ONE)).toThrow(RangeError);
  });
});

describe('fixed-point conversions', () => {
  it('year fraction maps to phase with integer output', () => {
    expect(yearFractionToPhase(0)).toBe(0);
    expect(yearFractionToPhase(0.25)).toBe(PHASE_ONE / 4);
    expect(Number.isInteger(yearFractionToPhase(0.3333))).toBe(true);
    expect(() => yearFractionToPhase(1)).toThrow(RangeError);
    expect(() => yearFractionToPhase(-0.1)).toThrow(RangeError);
  });

  it('latitude phase uses magnitude, so north and south share a phase', () => {
    expect(latitudeToPhase(45)).toBe(latitudeToPhase(-45));
    expect(latitudeToPhase(0)).toBe(0);
    expect(() => latitudeToPhase(91)).toThrow(RangeError);
    expect(() => latitudeToPhase(Number.NaN)).toThrow(RangeError);
  });

  it('tilt factor is 1.0 at 23.5 degrees and 0 at zero tilt', () => {
    expect(tiltFactorBP(EARTH_TILT)).toBe(BP_ONE);
    expect(tiltFactorBP(0)).toBe(0);
    expect(() => tiltFactorBP(31)).toThrow(RangeError);
    expect(() => tiltFactorBP(-1)).toThrow(RangeError);
  });

  it('sin of latitude is 0 at the equator and odd in latitude', () => {
    expect(sinLatitudeBP(0)).toBe(0);
    expect(sinLatitudeBP(30)).toBe(-sinLatitudeBP(-30));
    expect(sinLatitudeBP(90)).toBe(BP_ONE);
  });
});

describe('equator stability', () => {
  it('insolation and daylight are exactly 0.5 at every time', () => {
    for (const yf of YEAR_FRACTIONS) {
      expect(insolationBP(0, yf, EARTH_TILT)).toBe(5000);
      expect(daylightBP(0, yf, EARTH_TILT)).toBe(5000);
    }
  });

  it('seasonal temperature and snow cover never change over the year', () => {
    const temps = YEAR_FRACTIONS.map((yf) => seasonalTempBP(BASE_TEMP, 0, yf, EARTH_TILT));
    const snows = YEAR_FRACTIONS.map((yf) => snowCoverBP(BASE_TEMP, 0, yf, EARTH_TILT));
    expect(new Set(temps)).toEqual(new Set([BASE_TEMP]));
    expect(new Set(snows).size).toBe(1);
  });
});

describe('hemisphere opposition', () => {
  it('north and south insolation sum to exactly 1.0 at every time', () => {
    for (const yf of YEAR_FRACTIONS) {
      const north = insolationBP(45, yf, EARTH_TILT);
      const south = insolationBP(-45, yf, EARTH_TILT);
      expect(north + south).toBe(BP_ONE);
    }
  });

  it('north and south daylight sum to exactly 1.0 at every time', () => {
    for (const yf of YEAR_FRACTIONS) {
      expect(daylightBP(30, yf, EARTH_TILT) + daylightBP(-30, yf, EARTH_TILT)).toBe(BP_ONE);
    }
  });

  it('north summer (yf 0.25) is above 0.5 and south summer is below, and vice versa at winter', () => {
    expect(insolationBP(45, 0.25, EARTH_TILT)).toBeGreaterThan(5000);
    expect(insolationBP(-45, 0.25, EARTH_TILT)).toBeLessThan(5000);
    expect(insolationBP(45, 0.75, EARTH_TILT)).toBeLessThan(5000);
    expect(insolationBP(-45, 0.75, EARTH_TILT)).toBeGreaterThan(5000);
  });

  it('seasonal temperature anomalies are exact opposites in each hemisphere', () => {
    for (const yf of YEAR_FRACTIONS) {
      const northDelta = seasonalTempBP(BASE_TEMP, 40, yf, EARTH_TILT) - BASE_TEMP;
      const southDelta = seasonalTempBP(BASE_TEMP, -40, yf, EARTH_TILT) - BASE_TEMP;
      expect(northDelta + southDelta).toBe(0);
    }
  });

  it('snow is more prevalent in the winter hemisphere at the same base temperature', () => {
    const northWinter = snowCoverBP(2500, 50, 0.75, EARTH_TILT);
    const northSummer = snowCoverBP(2500, 50, 0.25, EARTH_TILT);
    const southWinter = snowCoverBP(2500, -50, 0.25, EARTH_TILT);
    expect(northWinter).toBeGreaterThan(northSummer);
    expect(southWinter).toBeGreaterThan(northSummer);
  });
});

describe('zero tilt gives no seasons', () => {
  it('insolation, daylight and temperature are constant everywhere and over time', () => {
    for (const lat of [-90, -45, -10, 0, 10, 45, 90]) {
      for (const yf of YEAR_FRACTIONS) {
        expect(insolationBP(lat, yf, 0)).toBe(5000);
        expect(daylightBP(lat, yf, 0)).toBe(5000);
        expect(seasonalTempBP(BASE_TEMP, lat, yf, 0)).toBe(BASE_TEMP);
      }
    }
  });
});

describe('curve behaviour', () => {
  it('higher tilt produces larger seasonal swings at a fixed latitude', () => {
    const lowTilt = insolationBP(45, 0.25, 10);
    const earthTilt = insolationBP(45, 0.25, EARTH_TILT);
    const maxTilt = insolationBP(45, 0.25, 30);
    expect(lowTilt).toBeLessThan(earthTilt);
    expect(earthTilt).toBeLessThan(maxTilt);
  });

  it('daylight saturates at the poles at the solstices (midnight sun / polar night)', () => {
    expect(daylightBP(90, 0.25, EARTH_TILT)).toBe(BP_ONE);
    expect(daylightBP(90, 0.75, EARTH_TILT)).toBe(0);
    expect(daylightBP(-90, 0.25, EARTH_TILT)).toBe(0);
    expect(daylightBP(-90, 0.75, EARTH_TILT)).toBe(BP_ONE);
  });

  it('temperature delta is bounded by the configured amplitude at tilt 23.5', () => {
    const amp = SEASON_CURVE_CONSTANTS.tempAmplitudeBP;
    for (const yf of YEAR_FRACTIONS) {
      const delta = seasonalTempBP(5000, 90, yf, EARTH_TILT) - 5000;
      expect(Math.abs(delta)).toBeLessThanOrEqual(amp);
    }
  });

  it('snow ramps from full cover in deep cold to none in warmth', () => {
    expect(snowCoverBP(0, 0, 0.5, EARTH_TILT)).toBe(BP_ONE);
    expect(snowCoverBP(BP_ONE, 0, 0.5, EARTH_TILT)).toBe(0);
    const mid = snowCoverBP(SEASON_CURVE_CONSTANTS.freezeThresholdBP - 500, 0, 0.5, EARTH_TILT);
    expect(mid).toBe(5000);
  });

  it('wraps continuously across the year boundary', () => {
    const end = insolationBP(45, 0.999, EARTH_TILT);
    const start = insolationBP(45, 0, EARTH_TILT);
    expect(Math.abs(end - start)).toBeLessThan(50);
  });

  it('returns integer basis points in [0, 10000] for every input', () => {
    for (const lat of [-90, -33.3, 0, 12.5, 90]) {
      for (const yf of YEAR_FRACTIONS) {
        for (const tilt of [0, 10, EARTH_TILT, 30]) {
          for (const v of [
            insolationBP(lat, yf, tilt),
            daylightBP(lat, yf, tilt),
            seasonalTempBP(BASE_TEMP, lat, yf, tilt),
            snowCoverBP(BASE_TEMP, lat, yf, tilt),
          ]) {
            expect(Number.isInteger(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(BP_ONE);
          }
        }
      }
    }
  });
});

describe('determinism and input validation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never calls Math.sin in the simulation path', () => {
    const spy = vi.spyOn(Math, 'sin');
    for (const yf of YEAR_FRACTIONS) {
      insolationBP(33.3, yf, EARTH_TILT);
      daylightBP(-12.1, yf, 17);
      seasonalTempBP(4000, 60, yf, EARTH_TILT);
      snowCoverBP(4000, -60, yf, EARTH_TILT);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('is a pure function: repeated calls return identical values', () => {
    const first = insolationBP(27.5, 0.37, 19);
    for (let i = 0; i < 5; i++) {
      expect(insolationBP(27.5, 0.37, 19)).toBe(first);
    }
  });

  it('rejects invalid inputs', () => {
    expect(() => insolationBP(91, 0.1, EARTH_TILT)).toThrow(RangeError);
    expect(() => insolationBP(0, 1, EARTH_TILT)).toThrow(RangeError);
    expect(() => insolationBP(0, 0.1, 31)).toThrow(RangeError);
    expect(() => seasonalTempBP(1.5, 0, 0.1, EARTH_TILT)).toThrow(RangeError);
    expect(() => seasonalTempBP(5000.5, 0, 0.1, EARTH_TILT)).toThrow(RangeError);
    expect(() => snowCoverBP(-1, 0, 0.1, EARTH_TILT)).toThrow(RangeError);
  });
});
