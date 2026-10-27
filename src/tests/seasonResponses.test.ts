import { describe, it, expect } from 'vitest';
import {
  SEASON_RESPONSES,
  breedingQuartileIndex,
  breedingWindowMultiplier,
  coldMetabolismMultiplier,
  dormancyMetabolismMultiplier,
  seasonalMetabolismMultiplier,
  seasonalMigrationBias,
} from '../simulation/seasonResponses';
import { SEASON_EFFECTS } from '../simulation/seasonEffects';
import { DEFAULT_SEASON_CONFIG } from '../simulation/seasons';

const ON = { enabled: true };
const OFF = { enabled: false };
const WARM = 7500;
const COLD_FLOOR = SEASON_RESPONSES.reproductionColdFloorBP;

describe('breedingQuartileIndex', () => {
  it('maps north year fraction to quartiles 0-3', () => {
    expect(breedingQuartileIndex(0, 'north')).toBe(0);
    expect(breedingQuartileIndex(0.25, 'north')).toBe(1);
    expect(breedingQuartileIndex(0.5, 'north')).toBe(2);
    expect(breedingQuartileIndex(0.75, 'north')).toBe(3);
    expect(breedingQuartileIndex(0.999, 'north')).toBe(3);
  });

  it('flips the south by half a year', () => {
    expect(breedingQuartileIndex(0, 'south')).toBe(2);
    expect(breedingQuartileIndex(0.5, 'south')).toBe(0);
    expect(breedingQuartileIndex(0.25, 'south')).toBe(3);
  });

  it('returns null on the equator and rejects out-of-range fractions', () => {
    expect(breedingQuartileIndex(0.3, 'equator')).toBeNull();
    expect(() => breedingQuartileIndex(1, 'north')).toThrow(RangeError);
    expect(() => breedingQuartileIndex(-0.1, 'north')).toThrow(RangeError);
  });
});

describe('breeding window', () => {
  it('uses design defaults: spring/summer 1.0, autumn 0.6, winter 0.2 (north)', () => {
    const at = (yf: number) =>
      breedingWindowMultiplier({ yearFraction: yf, hemisphere: 'north', seasonalTempBP: WARM }, ON);
    expect(at(0)).toBe(0.2);
    expect(at(0.25)).toBe(1);
    expect(at(0.5)).toBe(1);
    expect(at(0.75)).toBe(0.6);
  });

  it('southern cells breed on the opposite phase', () => {
    const south = (yf: number) =>
      breedingWindowMultiplier({ yearFraction: yf, hemisphere: 'south', seasonalTempBP: WARM }, ON);
    expect(south(0)).toBe(1); // south summer
    expect(south(0.5)).toBe(0.2); // south winter
  });

  it('is neutral (1) on the equator', () => {
    expect(
      breedingWindowMultiplier({ yearFraction: 0.5, hemisphere: 'equator', seasonalTempBP: WARM }, ON),
    ).toBe(1);
  });

  it('is zero below the cold floor, regardless of window', () => {
    expect(
      breedingWindowMultiplier(
        { yearFraction: 0.3, hemisphere: 'north', seasonalTempBP: COLD_FLOOR - 1 },
        ON,
      ),
    ).toBe(0);
    expect(
      breedingWindowMultiplier({ yearFraction: 0.3, hemisphere: 'north', seasonalTempBP: COLD_FLOOR }, ON),
    ).toBe(1);
  });

  it('returns exactly 1 for every input when seasons are disabled', () => {
    for (const yf of [0, 0.25, 0.5, 0.75]) {
      for (const hemisphere of ['north', 'south', 'equator'] as const) {
        expect(
          breedingWindowMultiplier({ yearFraction: yf, hemisphere, seasonalTempBP: 0 }, OFF),
        ).toBe(1);
      }
    }
  });

  it('is deterministic for identical inputs', () => {
    const input = { yearFraction: 0.6, hemisphere: 'north' as const, seasonalTempBP: 4000 };
    expect(breedingWindowMultiplier(input, ON)).toBe(breedingWindowMultiplier(input, ON));
  });

  it('rejects non-integer or out-of-range temperature', () => {
    expect(() =>
      breedingWindowMultiplier({ yearFraction: 0, hemisphere: 'north', seasonalTempBP: 1.5 }, ON),
    ).toThrow(RangeError);
    expect(() =>
      breedingWindowMultiplier({ yearFraction: 0, hemisphere: 'north', seasonalTempBP: 10001 }, ON),
    ).toThrow(RangeError);
  });
});

describe('cold metabolism', () => {
  it('adds 0.3 at temperature 0 and nothing at temperature 1', () => {
    expect(coldMetabolismMultiplier(0, ON)).toBe(1.3);
    expect(coldMetabolismMultiplier(10000, ON)).toBe(1);
  });

  it('is linear and monotonically non-increasing in temperature', () => {
    expect(coldMetabolismMultiplier(5000, ON)).toBe(1.15);
    let prev = Infinity;
    for (let t = 0; t <= 10000; t += 500) {
      const m = coldMetabolismMultiplier(t, ON);
      expect(m).toBeGreaterThanOrEqual(1);
      expect(m).toBeLessThanOrEqual(prev);
      prev = m;
    }
  });

  it('is exactly 1 when seasons are disabled', () => {
    expect(coldMetabolismMultiplier(0, OFF)).toBe(1);
    expect(coldMetabolismMultiplier(2000, OFF)).toBe(1);
  });

  it('uses the scale from the response table', () => {
    expect(coldMetabolismMultiplier(0, ON, { ...SEASON_RESPONSES, metabolismColdScale: 0.5 })).toBe(1.5);
  });
});

describe('dormancy metabolism', () => {
  it('applies dormantMetabolismScale at the producer dormancy snow threshold', () => {
    const threshold = SEASON_EFFECTS.growthDormantAtSnowBP;
    expect(dormancyMetabolismMultiplier(threshold, ON)).toBe(SEASON_RESPONSES.dormantMetabolismScale);
    expect(dormancyMetabolismMultiplier(10000, ON)).toBe(0.35);
    expect(dormancyMetabolismMultiplier(threshold - 1, ON)).toBe(1);
    expect(dormancyMetabolismMultiplier(0, ON)).toBe(1);
  });

  it('is exactly 1 when seasons are disabled', () => {
    expect(dormancyMetabolismMultiplier(10000, OFF)).toBe(1);
  });
});

describe('combined seasonal metabolism', () => {
  it('multiplies cold and dormancy effects', () => {
    expect(seasonalMetabolismMultiplier({ seasonalTempBP: 0, snowCoverBP: 10000 }, ON)).toBe(
      roundTo6(1.3 * 0.35),
    );
    expect(seasonalMetabolismMultiplier({ seasonalTempBP: 10000, snowCoverBP: 0 }, ON)).toBe(1);
  });

  it('is exactly 1 when seasons are disabled', () => {
    expect(seasonalMetabolismMultiplier({ seasonalTempBP: 0, snowCoverBP: 10000 }, OFF)).toBe(1);
  });
});

describe('migration bias', () => {
  it('is zero at or above the cold floor and rises toward cold', () => {
    expect(seasonalMigrationBias(COLD_FLOOR, ON)).toBe(0);
    expect(seasonalMigrationBias(WARM, ON)).toBe(0);
    expect(seasonalMigrationBias(0, ON)).toBe(1);
    expect(seasonalMigrationBias(COLD_FLOOR / 2, ON)).toBe(0.5);
  });

  it('is zero when seasons are disabled', () => {
    expect(seasonalMigrationBias(0, OFF)).toBe(0);
  });
});

describe('default config gating', () => {
  it('DEFAULT_SEASON_CONFIG is enabled, so responses apply by default for new worlds', () => {
    expect(DEFAULT_SEASON_CONFIG.enabled).toBe(true);
    expect(coldMetabolismMultiplier(0, DEFAULT_SEASON_CONFIG)).toBe(1.3);
  });
});

function roundTo6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}
