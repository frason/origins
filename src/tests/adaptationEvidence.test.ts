import { describe, it, expect } from 'vitest';
import {
  classifyTraitTrend,
  classifyLineageTrends,
  labelToChangeType,
  pointBiserial,
  pearson,
  DEFAULT_ADAPTATION_THRESHOLDS,
  type TraitCohortWindow,
} from '../simulation/adaptationEvidence';
import {
  AdaptationMetricsTracker,
  type AdaptationObservation,
} from '../simulation/adaptationMetrics';
import { Creature } from '../simulation/creature';
import { createEngine, tickEngine } from '../simulation/engine';
import { DEFAULT_TRAITS } from '../utils/traits';
import type { CreatureSnapshot } from '../state/store';

/** Build one cohort window from raw member tuples (id, value, survived, offspringDelta). */
function window(
  startTick: number,
  endTick: number,
  members: [string, number, boolean, number][],
  discreteFrequency?: Record<string, number>
): TraitCohortWindow {
  const values = members.map((m) => m[1]);
  return {
    startTick,
    endTick,
    cohortSize: members.length,
    traitMean: values.reduce((a, b) => a + b, 0) / values.length,
    traitMin: Math.min(...values),
    traitMax: Math.max(...values),
    members: members
      .map(([id, traitValue, survived, offspringDelta]) => ({
        id,
        traitValue,
        survived,
        offspringDelta,
      }))
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
    discreteFrequency,
  };
}

describe('adaptation evidence correlations', () => {
  it('pointBiserial measures trait-survival association', () => {
    // High values all survive, low values all die -> strong positive r.
    const r = pointBiserial([2, 2, 2, 1, 1, 1], [true, true, true, false, false, false]);
    expect(r).toBeGreaterThan(0.8);
  });

  it('pointBiserial returns 0 with no contrast', () => {
    expect(pointBiserial([1, 2, 3], [true, true, true])).toBe(0);
    expect(pointBiserial([1, 1, 1], [true, false, true])).toBe(0);
  });

  it('pearson returns 0 for constant samples', () => {
    expect(pearson([1, 1, 1], [1, 2, 3])).toBe(0);
  });
});

describe('classifyTraitTrend — documented thresholds', () => {
  const t = DEFAULT_ADAPTATION_THRESHOLDS;

  it('labels insufficient-evidence when history is too short', () => {
    const verdict = classifyTraitTrend([
      window(0, 10, [['a', 1, true, 0], ['b', 2, true, 0], ['c', 3, false, 0],
        ['d', 1, true, 0], ['e', 2, false, 0], ['f', 3, true, 0]]),
      window(10, 20, [['a', 1, true, 0], ['b', 2, true, 0], ['c', 3, false, 0],
        ['d', 1, true, 0], ['e', 2, false, 0], ['f', 3, true, 0]]),
    ]);
    expect(verdict.label).toBe('insufficient-evidence');
    expect(verdict.reasons[0]).toContain('minWindows');
  });

  it('labels insufficient-evidence when cohorts are too small', () => {
    const small = () => window(0, 10, [['a', 1, true, 0], ['b', 2, false, 0]]);
    const verdict = classifyTraitTrend([small(), small(), small(), small()]);
    expect(verdict.label).toBe('insufficient-evidence');
    expect(verdict.reasons[0]).toContain('minCohortSize');
  });

  it('labels insufficient-evidence when no threshold is crossed (no guess)', () => {
    // Adequate history and sample, but: no shift, no correlation, no divergence.
    const flat = (start: number, end: number) =>
      window(start, end, [
        ['a', 1.0, true, 0], ['b', 1.0, false, 0], ['c', 1.0, true, 0],
        ['d', 1.0, true, 0], ['e', 1.0, false, 0], ['f', 1.0, true, 0],
      ]);
    const verdict = classifyTraitTrend([flat(0, 10), flat(10, 20), flat(20, 30)]);
    expect(verdict.label).toBe('insufficient-evidence');
    expect(verdict.reasons[0]).toContain('no threshold crossed');
  });

  it('labels selection when survival correlation and directional shift agree', () => {
    // Windows where the LOW values die each round, and the mean climbs.
    const w1 = window(0, 10, [
      ['a', 1.0, false, 0], ['b', 1.2, false, 0], ['c', 1.4, true, 0],
      ['d', 1.6, true, 0], ['e', 1.8, true, 0], ['f', 2.0, true, 0],
    ]);
    const w2 = window(10, 20, [
      ['a', 1.2, false, 0], ['b', 1.4, false, 0], ['c', 1.6, true, 0],
      ['d', 1.8, true, 0], ['e', 2.0, true, 0], ['f', 2.2, true, 0],
    ]);
    const w3 = window(20, 30, [
      ['a', 1.4, false, 0], ['b', 1.6, false, 0], ['c', 1.8, true, 0],
      ['d', 2.0, true, 0], ['e', 2.2, true, 0], ['f', 2.4, true, 0],
    ]);
    const verdict = classifyTraitTrend([w1, w2, w3]);
    expect(verdict.label).toBe('selection');
    expect(verdict.survivalCorrelation).toBeGreaterThan(t.selectionCorrelation);
    expect(verdict.reasons.join(' ')).toContain('selectionCorrelation');
  });

  it('refuses selection when the shift contradicts the correlation sign', () => {
    // Low values die (positive correlation) but the population mean moves DOWN.
    const w = (start: number, base: number) =>
      window(start, start + 10, [
        ['a', base + 0.0, false, 0], ['b', base + 0.2, false, 0], ['c', base + 0.4, true, 0],
        ['d', base + 0.6, true, 0], ['e', base + 0.8, true, 0], ['f', base + 1.0, true, 0],
      ]);
    const verdict = classifyTraitTrend([w(0, 3.0), w(10, 2.6), w(20, 2.2)]);
    expect(verdict.label).not.toBe('selection');
  });

  it('labels drift for a directional shift with no fitness correlation', () => {
    // Random (id-uncorrelated) survival, but the mean keeps sliding up.
    const w = (start: number, base: number, flip: boolean) =>
      window(start, start + 10, [
        ['a', base + 0.0, flip, 0], ['b', base + 0.2, !flip, 0], ['c', base + 0.4, !flip, 0],
        ['d', base + 0.6, flip, 0], ['e', base + 0.8, !flip, 0], ['f', base + 1.0, flip, 0],
      ]);
    const verdict = classifyTraitTrend([w(0, 1.0, true), w(10, 1.6, false), w(20, 2.2, true)]);
    expect(verdict.label).toBe('drift');
    expect(verdict.reasons[0]).toContain('driftMinShift');
  });

  it('labels mutation-appearance for a new discrete value above the frequency floor', () => {
    const numeric = (start: number) =>
      window(start, start + 10, [
        ['a', 1, true, 0], ['b', 1, false, 0], ['c', 1, true, 0],
        ['d', 1, true, 0], ['e', 1, false, 0], ['f', 1, true, 0],
      ]);
    const windows: TraitCohortWindow[] = [
      { ...numeric(0), discreteFrequency: { herbivore: 1.0 } },
      { ...numeric(10), discreteFrequency: { herbivore: 1.0 } },
      // A scavenger variant appears in 2/8 of the cohort (0.25 >= 0.05).
      {
        ...window(20, 30, [
          ['a', 1, true, 0], ['b', 1, false, 0], ['c', 1, true, 0], ['d', 1, true, 0],
          ['e', 1, false, 0], ['f', 1, true, 0], ['g', 1, true, 0], ['h', 1, false, 0],
        ]),
        discreteFrequency: { herbivore: 0.75, scavenger: 0.25 },
      },
    ];
    const verdict = classifyTraitTrend(windows);
    expect(verdict.label).toBe('mutation-appearance');
    expect(verdict.reasons[0]).toContain('scavenger');
  });

  it('labels mutation-appearance when continuous values exceed the prior range', () => {
    const inRange = (start: number) =>
      window(start, start + 10, [
        ['a', 1.0, true, 0], ['b', 1.1, false, 0], ['c', 1.2, true, 0],
        ['d', 1.3, true, 0], ['e', 1.4, false, 0], ['f', 1.5, true, 0],
      ]);
    const beyond = window(20, 30, [
      ['a', 1.0, true, 0], ['b', 1.1, false, 0], ['c', 1.2, true, 0],
      ['d', 1.3, true, 0], ['e', 1.4, false, 0], ['f', 2.5, true, 0],
    ]);
    const verdict = classifyTraitTrend([inRange(0), inRange(10), beyond]);
    expect(verdict.label).toBe('mutation-appearance');
  });

  it('labels speciation only when multiple traits diverge from baseline, sustained', () => {
    // Two traits, each shifted far from its window-1 baseline for 3 windows.
    const big = (start: number, off: number) =>
      window(start, start + 10, [
        ['a', 1.0 + off, true, 0], ['b', 1.1 + off, false, 0], ['c', 1.2 + off, true, 0],
        ['d', 1.3 + off, true, 0], ['e', 1.4 + off, false, 0], ['f', 1.5 + off, true, 0],
      ]);
    const sizeWindows = [big(0, 0), big(10, 1), big(20, 1.2), big(30, 1.2)];
    const speedWindows = [big(0, 0), big(10, 1.1), big(20, 1.3), big(30, 1.3)];
    const verdicts = classifyLineageTrends({ size: sizeWindows, speed: speedWindows });
    expect(verdicts.size.label).toBe('speciation');
    expect(verdicts.speed.label).toBe('speciation');
  });

  it('refuses speciation for a single divergent trait', () => {
    const big = (start: number, off: number) =>
      window(start, start + 10, [
        ['a', 1.0 + off, true, 0], ['b', 1.1 + off, false, 0], ['c', 1.2 + off, true, 0],
        ['d', 1.3 + off, true, 0], ['e', 1.4 + off, false, 0], ['f', 1.5 + off, true, 0],
      ]);
    const sizeWindows = [big(0, 0), big(10, 1), big(20, 1.2), big(30, 1.2)];
    // camouflage: flat, no divergence.
    const flat = (start: number) =>
      window(start, start + 10, [
        ['a', 0.5, true, 0], ['b', 0.5, false, 0], ['c', 0.5, true, 0],
        ['d', 0.5, true, 0], ['e', 0.5, false, 0], ['f', 0.5, true, 0],
      ]);
    const verdicts = classifyLineageTrends({
      size: sizeWindows,
      camouflage: [flat(0), flat(10), flat(20), flat(30)],
    });
    expect(verdicts.size.label).not.toBe('speciation');
    expect(verdicts.camouflage.label).toBe('insufficient-evidence');
  });

  it('is deterministic: identical inputs give identical verdicts', () => {
    const w = (start: number, base: number) =>
      window(start, start + 10, [
        ['a', base + 0.0, true, 0], ['b', base + 0.2, true, 0], ['c', base + 0.4, false, 0],
        ['d', base + 0.6, true, 0], ['e', base + 0.8, false, 0], ['f', base + 1.0, true, 0],
      ]);
    const input = [w(0, 1.0), w(10, 1.4), w(20, 1.8)];
    const v1 = classifyTraitTrend(input);
    const v2 = classifyTraitTrend(JSON.parse(JSON.stringify(input)) as TraitCohortWindow[]);
    expect(v2).toEqual(v1);
  });

  it('maps labels onto the legacy change-type union', () => {
    expect(labelToChangeType('selection')).toBe('selection');
    expect(labelToChangeType('insufficient-evidence')).toBe('unknown');
  });
});

/**
 * Deterministic scenario: a lineage of 8 where, each window, the two slowest
 * members die and the fastest breed two high-speed offspring. IDs are stable
 * across windows; values always stay inside the historical range, so the
 * only signals are survival-linked directional change.
 */
function scenarioCreatures(tick: number): CreatureSnapshot[] {
  const cycle = Math.floor(tick / 10); // 1-based window index
  const creatures: CreatureSnapshot[] = [];
  // Founders p0..p7 with speeds 1.0..2.4. p_{k} dies during window k/2+... :
  // the two slowest ALIVE members die each window.
  for (let i = 0; i < 8; i++) {
    const deathWindow = Math.ceil((i + 1) / 2); // p0,p1 die in window 1; p2,p3 in window 2; ...
    creatures.push({
      id: `p${i}`,
      speciesId: 'scenario-species',
      lineageId: 'scenario-lineage',
      parentId: null,
      traits: { ...DEFAULT_TRAITS, speed: 1.0 + i * 0.2, energyStrategy: 'herbivore' },
      x: 0,
      y: 0,
      energy: 100,
      age: 5,
      lifecycleState: cycle >= deathWindow ? 'dead' : 'alive',
      corpseDecayTicks: 0,
      offspringCount: i >= 6 ? 2 : 0,
    });
  }
  // Offspring q1..: two per window, speeds matching the fast end (in range).
  for (let k = 1; k <= cycle; k++) {
    for (let j = 0; j < 2; j++) {
      creatures.push({
        id: `q${k}-${j}`,
        speciesId: 'scenario-species',
        lineageId: 'scenario-lineage',
        parentId: 'p6',
        traits: { ...DEFAULT_TRAITS, speed: 2.2 + j * 0.2, energyStrategy: 'herbivore' },
        x: 0,
        y: 0,
        energy: 100,
        age: 1,
        lifecycleState: 'alive',
        corpseDecayTicks: 0,
        offspringCount: 0,
      });
    }
  }
  return creatures;
}

describe('AdaptationMetricsTracker evidence labels', () => {
  it('produces a selection label from cohort survival outcomes', () => {
    const tracker = new AdaptationMetricsTracker({ windowSize: 10 });
    let all: AdaptationObservation[] = [];
    for (let tick = 10; tick <= 40; tick += 10) {
      all = tracker.updateMetrics(tick, scenarioCreatures(tick), []);
    }
    const speed = all.filter((o) => o.trait === 'speed');
    expect(speed.length).toBeGreaterThan(0);
    expect(speed[speed.length - 1].label).toBe('selection');
    expect(speed[speed.length - 1].changeType).toBe('selection');
    expect(speed[speed.length - 1].classificationReasons?.join(' ')).toContain('correlation');
  });

  it('does not label below the window threshold', () => {
    const tracker = new AdaptationMetricsTracker({ windowSize: 10 });
    const obs = tracker.updateMetrics(10, scenarioCreatures(10), []);
    expect(obs).toHaveLength(0);
  });

  it('is deterministic: identical runs give identical label streams', () => {
    const run = () => {
      const tracker = new AdaptationMetricsTracker({ windowSize: 10 });
      const labels: string[] = [];
      for (let tick = 10; tick <= 60; tick += 10) {
        for (const o of tracker.updateMetrics(tick, scenarioCreatures(tick), [])) {
          labels.push(`${o.tick}:${o.trait}:${o.label}`);
        }
      }
      return labels;
    };
    expect(run()).toEqual(run());
  });
});

describe('engine integration — same seed, same labels (#276)', () => {
  function runEngine(seed: number): string[] {
    Creature.resetIdCounter();
    const creatures = Array.from({ length: 10 }, (_, i) =>
      new Creature({
        speciesId: 'species_1',
        lineageId: 'lineage_1',
        parentId: null,
        traits: {
          ...DEFAULT_TRAITS,
          speed: 0.8 + i * 0.15,
          size: 0.9 + i * 0.05,
          energyStrategy: 'herbivore',
        },
        x: 20 + (i % 5) * 10,
        y: 20 + Math.floor(i / 5) * 10,
        energy: 150,
      })
    );
    let state = createEngine(seed, creatures);
    // A smaller sampling window so evidence windows accumulate within the
    // run; the engine wires the tracker with default (50) windows.
    state.adaptationMetrics = new AdaptationMetricsTracker({ windowSize: 10 });
    // Seeded local producers: the cohort stays large enough to classify as
    // starvation gradually prunes it.
    for (let x = 15; x <= 65; x += 5) {
      for (let y = 15; y <= 45; y += 5) {
        state.world.setCell(x, y, { producerBiomass: 60 });
      }
    }
    for (let i = 0; i < 150; i++) {
      state = tickEngine(state);
    }
    const labels: string[] = [];
    for (const history of state.adaptationMetrics.getAllLineageHistories()) {
      for (const o of history.adaptationEvents) {
        labels.push(`${o.tick}:${o.trait}:${o.label}:${o.changeType}`);
      }
    }
    return labels.sort();
  }

  it('produces identical labels across two same-seed runs', () => {
    const run1 = runEngine(42);
    const run2 = runEngine(42);
    expect(run1).toEqual(run2);
  });

  it('emits at least one evidence label in a varied-trait run', () => {
    const labels = runEngine(42);
    expect(labels.length).toBeGreaterThan(0);
  });
});
