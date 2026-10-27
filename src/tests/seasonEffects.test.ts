import { describe, it, expect } from 'vitest';
import {
  SEASON_EFFECTS,
  GROWTH_MULTIPLIER_MAX,
  GROWTH_MULTIPLIER_MIN,
  seasonalEvaporationMultiplier,
  seasonalGrowthMultiplier,
  type SeasonEffectTable,
} from '../simulation/seasonEffects';
import { calculateProducerGrowth, growProducers } from '../simulation/producer';
import { World } from '../simulation/world';
import { PRODUCER_GROWTH_RATE } from '../utils/constants';

const FULL_DAY = { daylightBP: 10000, seasonalTempBP: 10000, snowCoverBP: 0 };

function sampleGrid(): Array<{ daylightBP: number; seasonalTempBP: number; snowCoverBP: number }> {
  const out = [];
  for (let d = 0; d <= 10000; d += 2500) {
    for (let t = 0; t <= 10000; t += 2500) {
      for (let s = 0; s <= 10000; s += 2500) {
        out.push({ daylightBP: d, seasonalTempBP: t, snowCoverBP: s });
      }
    }
  }
  return out;
}

describe('seasonalGrowthMultiplier', () => {
  it('is 1 at full daylight, warm temperature and no snow', () => {
    expect(seasonalGrowthMultiplier(FULL_DAY)).toBe(1);
  });

  it('is dormant (exactly 0) once snow cover reaches the dormancy threshold', () => {
    const threshold = SEASON_EFFECTS.growthDormantAtSnowBP;
    expect(seasonalGrowthMultiplier({ ...FULL_DAY, snowCoverBP: threshold })).toBe(0);
    expect(seasonalGrowthMultiplier({ ...FULL_DAY, snowCoverBP: 10000 })).toBe(0);
    expect(seasonalGrowthMultiplier({ ...FULL_DAY, snowCoverBP: threshold - 1 })).toBeGreaterThan(0);
  });

  it('keeps the non-daylight share of growth when daylight is zero', () => {
    const w = SEASON_EFFECTS.growthDaylightWeight;
    expect(seasonalGrowthMultiplier({ ...FULL_DAY, daylightBP: 0 })).toBeCloseTo(1 - w, 6);
  });

  it('ramps down linearly below the cold floor and reaches 0 at temperature 0', () => {
    const floor = SEASON_EFFECTS.growthColdFloorBP;
    const half = seasonalGrowthMultiplier({ ...FULL_DAY, seasonalTempBP: floor / 2 });
    expect(half).toBeCloseTo(0.5, 6);
    expect(seasonalGrowthMultiplier({ ...FULL_DAY, seasonalTempBP: 0 })).toBe(0);
    expect(seasonalGrowthMultiplier({ ...FULL_DAY, seasonalTempBP: floor })).toBe(1);
  });

  it('stays within [min, max] and is deterministic over a sample grid', () => {
    for (const input of sampleGrid()) {
      const a = seasonalGrowthMultiplier(input);
      const b = seasonalGrowthMultiplier(input);
      expect(a).toBe(b);
      expect(a).toBeGreaterThanOrEqual(GROWTH_MULTIPLIER_MIN);
      expect(a).toBeLessThanOrEqual(GROWTH_MULTIPLIER_MAX);
    }
  });

  it('rejects non-integer or out-of-range basis-point inputs', () => {
    expect(() => seasonalGrowthMultiplier({ ...FULL_DAY, daylightBP: 10001 })).toThrow(RangeError);
    expect(() => seasonalGrowthMultiplier({ ...FULL_DAY, snowCoverBP: 0.5 })).toThrow(RangeError);
    expect(() => seasonalGrowthMultiplier({ ...FULL_DAY, seasonalTempBP: -1 })).toThrow(RangeError);
  });
});

describe('seasonalEvaporationMultiplier (bounded)', () => {
  it('is 1 at the 0.5 temperature midpoint (equator-neutral)', () => {
    expect(seasonalEvaporationMultiplier(5000)).toBe(1);
  });

  it('matches the design formula at the extremes with default sensitivity', () => {
    // 1 + 0.5 · (±1) = 1.5 or 0.5, both inside [0.4, 1.6].
    expect(seasonalEvaporationMultiplier(10000)).toBeCloseTo(1.5, 6);
    expect(seasonalEvaporationMultiplier(0)).toBeCloseTo(0.5, 6);
  });

  it('is monotone non-decreasing in seasonal temperature', () => {
    let prev = -Infinity;
    for (let t = 0; t <= 10000; t += 250) {
      const m = seasonalEvaporationMultiplier(t);
      expect(m).toBeGreaterThanOrEqual(prev);
      prev = m;
    }
  });

  it('clamps to [evapMinScale, evapMaxScale] even with extreme sensitivity', () => {
    const extreme: SeasonEffectTable = { ...SEASON_EFFECTS, evapTempSensitivity: 50 };
    expect(seasonalEvaporationMultiplier(10000, extreme)).toBe(SEASON_EFFECTS.evapMaxScale);
    expect(seasonalEvaporationMultiplier(0, extreme)).toBe(SEASON_EFFECTS.evapMinScale);

    const negative: SeasonEffectTable = { ...SEASON_EFFECTS, evapTempSensitivity: -50 };
    expect(seasonalEvaporationMultiplier(0, negative)).toBe(SEASON_EFFECTS.evapMaxScale);
    expect(seasonalEvaporationMultiplier(10000, negative)).toBe(SEASON_EFFECTS.evapMinScale);
  });

  it('stays within default bounds across every temperature', () => {
    for (let t = 0; t <= 10000; t += 1) {
      const m = seasonalEvaporationMultiplier(t);
      expect(m).toBeGreaterThanOrEqual(SEASON_EFFECTS.evapMinScale);
      expect(m).toBeLessThanOrEqual(SEASON_EFFECTS.evapMaxScale);
    }
  });
});

describe('producer growth with seasonal multiplier', () => {
  const coldCell = () => {
    const world = new World(1, 1);
    world.setCell(0, 0, {
      biome: 'grassland',
      producerArchetype: 'ground-cover',
      energy: 10,
      producerBiomass: 0,
    });
    return world.getCell(0, 0);
  };

  it('default multiplier of 1 matches the pre-season result exactly', () => {
    const cell = coldCell();
    const implicit = calculateProducerGrowth(cell, 'solar', PRODUCER_GROWTH_RATE);
    const explicit = calculateProducerGrowth(cell, 'solar', PRODUCER_GROWTH_RATE, false, false, 1);
    expect(explicit).toEqual(implicit);
  });

  it('scales growth linearly by the multiplier', () => {
    const cell = coldCell();
    const base = calculateProducerGrowth(cell, 'solar', PRODUCER_GROWTH_RATE).growth;
    expect(base).toBeGreaterThan(0);
    const half = calculateProducerGrowth(cell, 'solar', PRODUCER_GROWTH_RATE, false, false, 0.5);
    expect(half.growth).toBeCloseTo(base * 0.5, 10);
  });

  it('dormancy (multiplier 0) keeps existing biomass unchanged', () => {
    const world = new World(1, 1);
    world.setCell(0, 0, {
      biome: 'grassland',
      producerArchetype: 'ground-cover',
      energy: 10,
      producerBiomass: 42,
    });
    const dormantMult = seasonalGrowthMultiplier({
      daylightBP: 0,
      seasonalTempBP: 0,
      snowCoverBP: 10000,
    });
    expect(dormantMult).toBe(0);

    const result = calculateProducerGrowth(
      world.getCell(0, 0), 'solar', PRODUCER_GROWTH_RATE, false, false, dormantMult
    );
    expect(result.growth).toBe(0);
    expect(result.nextBiomass).toBe(42);

    growProducers(world, 'solar', PRODUCER_GROWTH_RATE, false, false, dormantMult);
    expect(world.getCell(0, 0).producerBiomass).toBe(42);
  });

  it('rejects negative or non-finite multipliers', () => {
    const cell = coldCell();
    expect(() => calculateProducerGrowth(cell, 'solar', PRODUCER_GROWTH_RATE, false, false, -1))
      .toThrow(RangeError);
    expect(() => calculateProducerGrowth(cell, 'solar', PRODUCER_GROWTH_RATE, false, false, NaN))
      .toThrow(RangeError);
  });
});
