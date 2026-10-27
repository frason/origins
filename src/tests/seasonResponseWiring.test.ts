import { describe, it, expect } from 'vitest';
import { tickEngine, type EngineState } from '../simulation/engine';
import { buildDemoEngine, buildSeasonsDemoEngine } from '../simulation/demoWorld';
import { applyMetabolism } from '../simulation/energy';
import { Creature } from '../simulation/creature';
import { DEFAULT_TRAITS } from '../utils/traits';
import {
  createSeasonalSignalsAt,
  seasonalBreedingAllowed,
  seasonalMetabolismMultiplier,
  seasonalMigrationBias,
  type SeasonalCellSignals,
} from '../simulation/seasonResponses';
import { DEFAULT_SEASON_CONFIG, type SeasonConfig } from '../simulation/seasons';
import { SIMULATION_CONSTANTS } from '../utils/constants';

// Wiring tests for the seasonal creature responses (#354 / epic #121 gap 1).
const ON: SeasonConfig = { ...DEFAULT_SEASON_CONFIG, enabled: true };
const OFF: SeasonConfig = { ...DEFAULT_SEASON_CONFIG, enabled: false };

function signals(over: Partial<SeasonalCellSignals> = {}): SeasonalCellSignals {
  return { seasonalTempBP: 8000, snowCoverBP: 0, yearFraction: 0.4, hemisphere: 'north', ...over };
}

describe('seasonal metabolism reaches the energy step', () => {
  it('a cold multiplier raises the energy cost of applyMetabolism; 1 leaves it unchanged', () => {
    Creature.resetIdCounter();
    const make = () => new Creature({
      speciesId: 'species_1', lineageId: 'lineage_1', parentId: null,
      traits: { ...DEFAULT_TRAITS }, x: 0, y: 0, energy: 100,
    });
    const plain = make();
    const cold = make();
    const seasonalDefault = make();
    applyMetabolism(plain, SIMULATION_CONSTANTS.baseMetabolism);
    applyMetabolism(cold, SIMULATION_CONSTANTS.baseMetabolism, 1.3);
    applyMetabolism(seasonalDefault, SIMULATION_CONSTANTS.baseMetabolism, 1);
    expect(cold.energy).toBeLessThan(plain.energy);
    expect(seasonalDefault.energy).toBe(plain.energy);
  });

  it('seasonalMultiplier defaults to 1 (pre-season behaviour unchanged)', () => {
    expect(SIMULATION_CONSTANTS.baseMetabolism).toBeGreaterThan(0);
    expect(seasonalMetabolismMultiplier({ seasonalTempBP: 8000, snowCoverBP: 0 }, OFF)).toBe(1);
  });

  it('cold and dormancy multipliers are >1 and <1 respectively and only when enabled', () => {
    expect(seasonalMetabolismMultiplier({ seasonalTempBP: 0, snowCoverBP: 0 }, ON)).toBeGreaterThan(1);
    expect(seasonalMetabolismMultiplier({ seasonalTempBP: 10000, snowCoverBP: 9000 }, ON)).toBeLessThan(1);
    expect(seasonalMetabolismMultiplier({ seasonalTempBP: 0, snowCoverBP: 9000 }, OFF)).toBe(1);
  });
});

describe('seasonal breeding window gate', () => {
  it('is always open when seasons are disabled', () => {
    expect(seasonalBreedingAllowed(signals({ seasonalTempBP: 0 }), 'c1', 5, OFF)).toBe(true);
  });

  it('is closed in the cold (below the reproduction cold floor)', () => {
    expect(seasonalBreedingAllowed(signals({ seasonalTempBP: 100 }), 'c1', 5, ON)).toBe(false);
  });

  it('is open in full-window quartiles and deterministic for fractional windows', () => {
    // Quartile 1 (spring) for north at yearFraction 0.3 has window 1.0: always open.
    expect(seasonalBreedingAllowed(signals({ yearFraction: 0.3 }), 'c1', 5, ON)).toBe(true);
    // Quartile 3 (autumn) window 0.6: the same (id, tick) always gives the same answer.
    const autumn = signals({ yearFraction: 0.8 });
    const first = seasonalBreedingAllowed(autumn, 'c-x', 77, ON);
    expect(seasonalBreedingAllowed(autumn, 'c-x', 77, ON)).toBe(first);
  });

  it('fractional windows admit roughly the multiplier share of creatures', () => {
    const autumn = signals({ yearFraction: 0.8 }); // window 0.6
    let open = 0;
    for (let i = 0; i < 2000; i++) {
      if (seasonalBreedingAllowed(autumn, `creature-${i}`, 100, ON)) open++;
    }
    const share = open / 2000;
    expect(share).toBeGreaterThan(0.5);
    expect(share).toBeLessThan(0.7);
  });
});

describe('seasonal migration bias', () => {
  it('is zero when disabled and zero at or above the cold floor', () => {
    expect(seasonalMigrationBias(0, OFF)).toBe(0);
    expect(seasonalMigrationBias(9000, ON)).toBe(0);
    expect(seasonalMigrationBias(0, ON)).toBeGreaterThan(0);
  });

  it('signal helper returns null-free per-cell signals only when enabled', () => {
    expect(createSeasonalSignalsAt(OFF, 0, 20)).toBeUndefined();
    const at = createSeasonalSignalsAt(ON, 0, 20);
    expect(at).toBeDefined();
    const s = at!(0, 0, { temperature: 0.5 });
    expect(s.hemisphere).toBe('north');
    expect(s.seasonalTempBP).toBeGreaterThanOrEqual(0);
  });
});

describe('seasons change a full seeded run (responses are applied, not just defined)', () => {
  const SEED = 4242;
  const constants = { ...SIMULATION_CONSTANTS, worldWidth: 20, worldHeight: 20 };

  function runFor(build: () => EngineState, ticks: number): EngineState {
    let state = build();
    for (let t = 0; t < ticks; t++) state = tickEngine(state);
    return state;
  }

  it('same seed with seasons on vs off diverges in creature energy', () => {
    const on = runFor(() => buildSeasonsDemoEngine(SEED, constants), 200);
    const off = runFor(() => buildDemoEngine(SEED, constants), 200);
    const energyOn = on.creatures.map((c) => c.energy);
    const energyOff = off.creatures.map((c) => c.energy);
    expect(JSON.stringify(energyOn)).not.toBe(JSON.stringify(energyOff));
  });

  it('seasons-on run is deterministic across two same-seed runs', () => {
    const a = runFor(() => buildSeasonsDemoEngine(SEED, constants), 200);
    const b = runFor(() => buildSeasonsDemoEngine(SEED, constants), 200);
    expect(a.creatures.map((c) => [c.id, c.energy, c.x, c.y])).toEqual(
      b.creatures.map((c) => [c.id, c.energy, c.x, c.y]),
    );
  });
});
