import { describe, it, expect } from 'vitest';
import { createEngine, tickEngine, type EngineState } from '../simulation/engine';
import { calculateProducerGrowth, getNutrientCapacity } from '../simulation/producer';
import { createSeasonalGrowthAt } from '../simulation/seasonEffects';
import { DEFAULT_SEASON_CONFIG, type SeasonConfig } from '../simulation/seasons';
import { deserializeEngineState, serializeEngineState } from '../simulation/enginePersistence';

const W = 20;
const H = 20;
const SEED = 4242;
const YEAR = DEFAULT_SEASON_CONFIG.yearLengthTicks; // 960

const enabled = (phaseOffsetTicks: number): SeasonConfig => ({
  ...DEFAULT_SEASON_CONFIG,
  enabled: true,
  phaseOffsetTicks,
});

/** Engine state at tick 0 with an optional season config (undefined = legacy/no seasons). */
function startState(seasonConfig?: SeasonConfig): EngineState {
  return createEngine(SEED, [], W, H, {}, seasonConfig);
}

function rowBiomass(state: EngineState, y: number): number {
  let total = 0;
  for (let x = 0; x < state.world.width; x++) {
    total += state.world.getCell(x, y).producerBiomass;
  }
  return total;
}

describe('seasonal producer growth in the engine tick (#353)', () => {
  it('leaves the tick byte-identical when seasons are absent or disabled', () => {
    const legacy = tickEngine(startState());
    const disabled = tickEngine(startState({ ...DEFAULT_SEASON_CONFIG, enabled: false }));
    // A disabled config block is carried in state; the simulated content must match exactly.
    expect(serializeEngineState({ ...disabled, seasonConfig: undefined })).toBe(serializeEngineState(legacy));
    expect(legacy.seasonConfig).toBeUndefined();
  });

  it('makes growth differ by season: northern row grows more in its summer than its winter', () => {
    // Tick 0 with phaseOffset 240 is yearFraction 0.25; with 720 it is 0.75.
    // Row 0 is the northern edge (+45°): sin φ > 0, so s = +1 is its summer.
    const summer = tickEngine(startState(enabled(YEAR / 4)));
    const winter = tickEngine(startState(enabled((YEAR * 3) / 4)));
    const northSummer = rowBiomass(summer, 0);
    const northWinter = rowBiomass(winter, 0);
    expect(northSummer).toBeGreaterThan(0);
    expect(northSummer).toBeGreaterThan(northWinter);
  });

  it('reverses the hemispheric pattern in the southern row', () => {
    const summer = tickEngine(startState(enabled(YEAR / 4)));
    const winter = tickEngine(startState(enabled((YEAR * 3) / 4)));
    // Last row is the southern edge (-45°): its summer is yearFraction 0.75.
    expect(rowBiomass(winter, H - 1)).toBeGreaterThan(rowBiomass(summer, H - 1));
  });

  it('is deterministic: same seed and config give identical snapshots', () => {
    const a = tickEngine(startState(enabled(YEAR / 4)));
    const b = tickEngine(startState(enabled(YEAR / 4)));
    expect(serializeEngineState(a)).toBe(serializeEngineState(b));
  });

  it('keeps seasonConfig through save and load so seasons survive a reload', () => {
    const state = startState(enabled(YEAR / 4));
    const restored = deserializeEngineState(serializeEngineState(state));
    expect(restored.seasonConfig).toEqual(enabled(YEAR / 4));
    expect(serializeEngineState(tickEngine(restored))).toBe(serializeEngineState(tickEngine(state)));
  });

  it('builds no per-cell multiplier when disabled and a bounded one when enabled', () => {
    expect(createSeasonalGrowthAt({ ...DEFAULT_SEASON_CONFIG, enabled: false }, 0, H)).toBeUndefined();
    const at = createSeasonalGrowthAt(enabled(0), 0, H);
    expect(at).toBeDefined();
    const world = startState().world;
    for (let y = 0; y < H; y++) {
      const m = at!(0, y, world.getCell(0, y));
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(1);
    }
  });
});

describe('dormancy keeps biomass (#353)', () => {
  it('a zero seasonal multiplier leaves biomass unchanged when nutrients cover maintenance', () => {
    const world = startState().world;
    const base = world.getCell(5, 5);
    const capacity = getNutrientCapacity(base);
    const cell = { ...base, producerBiomass: 10, nutrients: capacity };
    const result = calculateProducerGrowth(cell, 'solar', undefined, true, true, 0);
    expect(result.nextBiomass).toBeCloseTo(10, 12);
    expect(result.growth).toBeCloseTo(0, 12);
  });

  it('the multiplier scales growth linearly and never boosts it above the base', () => {
    const world = startState().world;
    const cell = { ...world.getCell(5, 5), producerBiomass: 1, nutrients: 0 };
    const full = calculateProducerGrowth(cell, 'solar', undefined, true, false, 1).growth;
    const half = calculateProducerGrowth(cell, 'solar', undefined, true, false, 0.5).growth;
    expect(full).toBeGreaterThan(0);
    expect(half).toBeCloseTo(full / 2, 12);
  });
});
