import { describe, it, expect } from 'vitest';
import { tickEngine, type EngineState } from '../simulation/engine';
import { buildSeasonsDemoEngine } from '../simulation/demoWorld';
import {
  DEFAULT_SEASON_CONFIG,
  calendarAt,
  hemisphereForLatitude,
  latitudeDegForRow,
  seasonNameAt,
  type Hemisphere,
  type SeasonName,
} from '../simulation/seasons';
import { getProducerTraits } from '../simulation/producerTypes';
import { SIMULATION_CONSTANTS } from '../utils/constants';

// Seeded balance checks for the seasons-enabled demo (#357, docs/design-seasons.md item 7).
// Grid is 20x20: a 100x100 run is too slow for a unit suite, and the seasonal config is size-independent.
//
// Scope: the base demo ecosystem collapses by ~tick 240 even with seasons OFF (tracked in a
// separate research issue), so these tests do NOT assert multi-year survival. The 10-year
// extinction check is a todo until base demo viability is solved.

const W = 20;
const H = 20;
const SEED = 4242;
const YEAR_TICKS = DEFAULT_SEASON_CONFIG.yearLengthTicks; // 960
/** Ticks for the seasonal-signal window (well before the ~tick 240 baseline collapse is relevant). */
const SIGNAL_TICKS = 120;
/** Ticks for the bounded-biomass check (kept short to stay under the suite time budget). */
const BOUND_TICKS = YEAR_TICKS;
/** Ticks for the determinism check. */
const DETERMINISM_TICKS = 240;

/** Hemisphere of each grid row, from the same signed latitude the seasonal curves use. */
const rowHemisphere: Hemisphere[] = Array.from({ length: H }, (_, y) =>
  hemisphereForLatitude(latitudeDegForRow(y, H, DEFAULT_SEASON_CONFIG.gridMaxLatitudeDeg)),
);

interface Sample {
  tick: number;
  alive: Record<'north' | 'south', number>;
  biomass: Record<'north' | 'south', number>;
  seasonNorth: SeasonName | null;
  seasonSouth: SeasonName | null;
  /** Largest ratio of cell producer biomass to that cell's carrying capacity (must stay <= 1). */
  maxCellCapacityRatio: number;
  /** Sum of cell biomass over the whole grid (for determinism comparison). */
  totalBiomass: number;
}

function sample(state: EngineState): Sample {
  const alive = { north: 0, south: 0 };
  for (const c of state.creatures) {
    if (c.lifecycleState !== 'alive') continue;
    const h = rowHemisphere[c.y];
    if (h === 'north') alive.north++;
    else if (h === 'south') alive.south++;
  }
  const biomass = { north: 0, south: 0 };
  let maxRatio = 0;
  let total = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cell = state.world.getCell(x, y);
      const b = cell.producerBiomass;
      total += b;
      const h = rowHemisphere[y];
      if (h === 'north') biomass.north += b;
      else if (h === 'south') biomass.south += b;
      const cap = getProducerTraits(cell.producerArchetype).carryingCapacity;
      if (cap > 0) maxRatio = Math.max(maxRatio, b / cap);
    }
  }
  const cal = calendarAt(state.tick, DEFAULT_SEASON_CONFIG);
  return {
    tick: state.tick,
    alive,
    biomass,
    seasonNorth: seasonNameAt(cal.yearFraction, 'north'),
    seasonSouth: seasonNameAt(cal.yearFraction, 'south'),
    maxCellCapacityRatio: maxRatio,
    totalBiomass: total,
  };
}

function freshEngine(): EngineState {
  const constants = { ...SIMULATION_CONSTANTS, worldWidth: W, worldHeight: H };
  return buildSeasonsDemoEngine(SEED, constants);
}

/** Runs `ticks` steps, returning a sample at tick 0 and every `every` ticks thereafter (and at the end). */
function run(ticks: number, every: number): Sample[] {
  let state = freshEngine();
  const out: Sample[] = [sample(state)];
  for (let t = 1; t <= ticks; t++) {
    state = tickEngine(state);
    if (t % every === 0 || t === ticks) out.push(sample(state));
  }
  return out;
}

describe('seasons demo: seeded balance (#357)', () => {
  it('uses the seasons-enabled default config and covers both hemispheres', () => {
    expect(DEFAULT_SEASON_CONFIG.enabled).toBe(true);
    expect(rowHemisphere).toContain('north');
    expect(rowHemisphere).toContain('south');
  });

  it('seasonal signal: N and S hemispheres show opposite seasons and diverging producer biomass over the first 120 ticks', () => {
    let state = freshEngine();
    const series: Sample[] = [sample(state)];
    for (let t = 1; t <= SIGNAL_TICKS; t++) {
      state = tickEngine(state);
      series.push(sample(state));
    }
    // Only ticks with a living population count, so the check is not vacuous on an empty world.
    const live = series.filter((s) => s.alive.north + s.alive.south > 0);
    expect(live.length, 'ticks with living population in the window').toBeGreaterThanOrEqual(SIGNAL_TICKS);

    // Opposite hemispheres are half a year apart: their season labels must differ on every tick.
    for (const s of live) {
      expect(s.seasonNorth, `north season label at tick ${s.tick}`).not.toBeNull();
      expect(s.seasonSouth, `south season label at tick ${s.tick}`).not.toBeNull();
      expect(s.seasonSouth, `N/S labels at tick ${s.tick}`).not.toBe(s.seasonNorth);
    }
    expect(live[0].seasonNorth).toBe('winter');
    expect(live[0].seasonSouth).toBe('summer');

    // Seasonal producer response must make the hemispheres' biomass diverge, not stay identical.
    const maxDiff = Math.max(...live.map((s) => Math.abs(s.biomass.north - s.biomass.south)));
    expect(maxDiff, 'max |north biomass - south biomass| over window').toBeGreaterThan(0);
  });

  it('producer biomass stays bounded by carrying capacity (checked every 60 ticks over one year)', () => {
    const samples = run(BOUND_TICKS, 60);
    for (const s of samples) {
      expect(s.maxCellCapacityRatio, `cell biomass / capacity at tick ${s.tick}`).toBeLessThanOrEqual(1 + 1e-9);
      expect(s.biomass.north, `north biomass at tick ${s.tick}`).toBeGreaterThanOrEqual(0);
      expect(s.biomass.south, `south biomass at tick ${s.tick}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('is deterministic: two same-seed runs produce identical samples', () => {
    const first = run(DETERMINISM_TICKS, 20);
    const second = run(DETERMINISM_TICKS, 20);
    expect(second).toEqual(first);
  });

  it.todo('no mass extinction across 10 years - blocked on base demo viability, see research issue');
});
