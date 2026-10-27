import { describe, it, expect } from 'vitest';
import { createEngine, tickEngine, type EngineState } from '../simulation/engine';
import {
  SEASON_EVAPORATION_BASE_RATE,
  SEASON_EFFECTS,
  applySeasonalEvaporation,
  createSeasonalEvaporationAt,
  evaporatedDepth,
} from '../simulation/seasonEffects';
import { DEFAULT_SEASON_CONFIG, type SeasonConfig } from '../simulation/seasons';
import { serializeEngineState } from '../simulation/enginePersistence';

const W = 20;
const H = 20;
const SEED = 4242;
const YEAR = DEFAULT_SEASON_CONFIG.yearLengthTicks; // 960

const enabled = (phaseOffsetTicks: number): SeasonConfig => ({
  ...DEFAULT_SEASON_CONFIG,
  enabled: true,
  phaseOffsetTicks,
});

function startState(seasonConfig?: SeasonConfig): EngineState {
  return createEngine(SEED, [], W, H, {}, seasonConfig);
}

/** Puts standing water in a cell so the evaporation step has something to act on. */
function withWater(state: EngineState, x: number, y: number, depth: number): EngineState {
  state.world.setCell(x, y, { waterDepth: depth });
  return state;
}

describe('evaporatedDepth: bounded per-tick evaporation (#353)', () => {
  it('never returns a negative depth or more than the input depth', () => {
    const multipliers = [0, SEASON_EFFECTS.evapMinScale, 1, SEASON_EFFECTS.evapMaxScale];
    const depths = [0, 1e-9, 0.01, 0.5, 1, 1000];
    for (const m of multipliers) {
      for (const d of depths) {
        const next = evaporatedDepth(d, m);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThanOrEqual(d);
      }
    }
  });

  it('loses at most evapMaxScale × base rate of depth in one tick', () => {
    const maxFraction = SEASON_EFFECTS.evapMaxScale * SEASON_EVAPORATION_BASE_RATE;
    const depth = 2;
    const next = evaporatedDepth(depth, SEASON_EFFECTS.evapMaxScale);
    expect(depth - next).toBeLessThanOrEqual(depth * maxFraction + 1e-12);
    expect(next).toBeGreaterThan(0);
  });

  it('a zero multiplier (no evaporation) keeps depth, and dry cells stay dry', () => {
    expect(evaporatedDepth(0.7, 0)).toBe(0.7);
    expect(evaporatedDepth(0, 1.6)).toBe(0);
  });

  it('a higher multiplier loses more water than a lower one', () => {
    expect(evaporatedDepth(1, 1.6)).toBeLessThan(evaporatedDepth(1, 0.4));
  });

  it('rejects invalid multipliers', () => {
    expect(() => evaporatedDepth(1, -0.1)).toThrow(RangeError);
    expect(() => evaporatedDepth(1, Number.NaN)).toThrow(RangeError);
  });
});

describe('seasonal evaporation multiplier per cell (#353)', () => {
  it('is undefined when seasons are disabled', () => {
    expect(createSeasonalEvaporationAt({ ...DEFAULT_SEASON_CONFIG, enabled: false }, 0, H)).toBeUndefined();
  });

  it('stays within the clamp [evapMinScale, evapMaxScale] for every row', () => {
    const at = createSeasonalEvaporationAt(enabled(0), 0, H)!;
    const world = startState().world;
    for (let y = 0; y < H; y++) {
      const m = at(0, y, world.getCell(0, y));
      expect(m).toBeGreaterThanOrEqual(SEASON_EFFECTS.evapMinScale);
      expect(m).toBeLessThanOrEqual(SEASON_EFFECTS.evapMaxScale);
    }
  });

  it('evaporates faster in the northern summer than the northern winter', () => {
    // Row 0 is +45°N. yearFraction 0.25 is its summer; 0.75 is its winter.
    const summer = createSeasonalEvaporationAt(enabled(YEAR / 4), 0, H)!;
    const winter = createSeasonalEvaporationAt(enabled((YEAR * 3) / 4), 0, H)!;
    const cell = { temperature: 0.5 };
    expect(summer(0, 0, cell)).toBeGreaterThan(winter(0, 0, cell));
  });
});

describe('evaporation in the engine tick (#353)', () => {
  it('leaves waterDepth untouched when seasons are absent or disabled', () => {
    const legacy = tickEngine(withWater(startState(), 3, 3, 1));
    const disabled = tickEngine(withWater(startState({ ...DEFAULT_SEASON_CONFIG, enabled: false }), 3, 3, 1));
    expect(disabled.world.getCell(3, 3).waterDepth).toBe(1);
    expect(legacy.world.getCell(3, 3).waterDepth).toBe(1);
    expect(serializeEngineState({ ...disabled, seasonConfig: undefined })).toBe(serializeEngineState(legacy));
  });

  it('reduces standing water when seasons are enabled, and never below zero', () => {
    const before = 1;
    const after = tickEngine(withWater(startState(enabled(YEAR / 4)), 3, 3, before));
    const depth = after.world.getCell(3, 3).waterDepth;
    expect(depth).toBeLessThan(before);
    expect(depth).toBeGreaterThanOrEqual(0);
  });

  it('evaporates more water in the northern summer than in the northern winter', () => {
    const summer = tickEngine(withWater(startState(enabled(YEAR / 4)), 3, 0, 1));
    const winter = tickEngine(withWater(startState(enabled((YEAR * 3) / 4)), 3, 0, 1));
    expect(summer.world.getCell(3, 0).waterDepth).toBeLessThan(winter.world.getCell(3, 0).waterDepth);
  });

  it('keeps dry cells dry', () => {
    const next = tickEngine(withWater(startState(enabled(YEAR / 4)), 3, 3, 0));
    expect(next.world.getCell(3, 3).waterDepth).toBe(0);
  });

  it('is deterministic: same seed and config give identical snapshots', () => {
    const a = tickEngine(withWater(startState(enabled(YEAR / 4)), 3, 3, 1));
    const b = tickEngine(withWater(startState(enabled(YEAR / 4)), 3, 3, 1));
    expect(serializeEngineState(a)).toBe(serializeEngineState(b));
  });

  it('a multi-tick run only ever shrinks standing water (bounded, monotone)', () => {
    let state = withWater(startState(enabled(0)), 3, 3, 1);
    let previous = 1;
    for (let i = 0; i < 25; i++) {
      state = tickEngine(state);
      const depth = state.world.getCell(3, 3).waterDepth;
      expect(depth).toBeLessThanOrEqual(previous);
      expect(depth).toBeGreaterThanOrEqual(0);
      previous = depth;
    }
  });

  it('applySeasonalEvaporation touches only wet cells', () => {
    const world = startState().world;
    world.setCell(2, 2, { waterDepth: 0.5 });
    world.setCell(4, 4, { waterDepth: 0 });
    const at = createSeasonalEvaporationAt(enabled(0), 0, H)!;
    applySeasonalEvaporation(world, at);
    expect(world.getCell(2, 2).waterDepth).toBeLessThan(0.5);
    expect(world.getCell(2, 2).waterDepth).toBeGreaterThan(0);
    expect(world.getCell(4, 4).waterDepth).toBe(0);
  });
});
