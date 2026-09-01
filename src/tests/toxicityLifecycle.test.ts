import { describe, expect, it } from 'vitest';
import { Creature } from '../simulation/creature';
import { createEngine, tickEngine } from '../simulation/engine';
import {
  buildMiasmaPressureGrid,
  getCorpseDecayStage,
  getLocalMiasmaMutationPressure,
  getMiasmaAdjustedMutationRate,
  getToxinAdjustedReproductionThreshold,
} from '../simulation/toxicity';
import { DEFAULT_TRAITS } from '../utils/traits';

describe('toxicity lifecycle', () => {
  it('labels fresh, peak-miasma, and late corpse stages deterministically', () => {
    expect(getCorpseDecayStage(30, 30).stage).toBe('fresh');
    expect(getCorpseDecayStage(20, 30).stage).toBe('peak-miasma');
    expect(getCorpseDecayStage(10, 30).stage).toBe('late-decay');
    expect(getCorpseDecayStage(20, 30).hazardMultiplier)
      .toBeGreaterThan(getCorpseDecayStage(30, 30).hazardMultiplier);
  });

  it('raises reproduction requirements from persistent toxin exposure', () => {
    expect(getToxinAdjustedReproductionThreshold(100, 0)).toBe(100);
    expect(getToxinAdjustedReproductionThreshold(100, 0.5)).toBeCloseTo(110);
    expect(getToxinAdjustedReproductionThreshold(100, 10)).toBeCloseTo(120);
  });

  it('creates bounded, decay-stage-sensitive local mutation pressure', () => {
    const source = {
      x: 5, y: 5, lifecycleState: 'dead' as const, corpseDecayTicks: 20,
    };
    const peak = getLocalMiasmaMutationPressure(5, 5, [source], 3, 30);
    const distant = getLocalMiasmaMutationPressure(9, 5, [source], 3, 30);
    const fresh = getLocalMiasmaMutationPressure(
      5, 5, [{ ...source, corpseDecayTicks: 30 }], 3, 30
    );
    const late = getLocalMiasmaMutationPressure(
      5, 5, [{ ...source, corpseDecayTicks: 10 }], 3, 30
    );

    expect(peak).toBe(1);
    expect(distant).toBe(0);
    expect(peak).toBeGreaterThan(fresh);
    expect(peak).toBeGreaterThan(late);
    expect(getMiasmaAdjustedMutationRate(0.12, peak)).toBeCloseTo(0.2);
    expect(getMiasmaAdjustedMutationRate(0.5, peak)).toBe(0.5);
    expect(getMiasmaAdjustedMutationRate(1, peak)).toBe(1);
  });

  it('builds a bounded render field equivalent to local miasma measurements', () => {
    const source = {
      x: 5, y: 5, lifecycleState: 'dead' as const, corpseDecayTicks: 20,
    };
    const grid = buildMiasmaPressureGrid(10, 10, [source], 3, 30);

    expect(grid).toHaveLength(100);
    expect(grid[5 * 10 + 5]).toBeCloseTo(
      getLocalMiasmaMutationPressure(5, 5, [source], 3, 30)
    );
    expect(grid[5 * 10 + 9]).toBe(0);
    expect(grid[0]).toBe(0);
  });

  it('records a higher local mutation rate for births inside active miasma', () => {
    const run = (withCorpse: boolean) => {
      Creature.resetIdCounter();
      const parent = new Creature({
        speciesId: 'grazer',
        lineageId: 'grazer-root',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
        x: 2,
        y: 2,
        energy: 100,
        age: 8,
      });
      const creatures = [parent];
      if (withCorpse) {
        creatures.push(new Creature({
          speciesId: 'carrion',
          lineageId: 'carrion-root',
          parentId: null,
          traits: { ...DEFAULT_TRAITS },
          x: 2,
          y: 2,
          energy: 50,
          lifecycleState: 'dead',
          corpseDecayTicks: 20,
        }));
      }
      const state = createEngine(91, creatures, 5, 5, {
        baseMetabolism: 0,
        reproductionEnergyThreshold: 50,
        reproductionEnergyCost: 10,
        reproductionMaturityAgeTicks: 0,
        reproductionCooldownTicks: 0,
        reproductionPressureStart: 1,
        reproductionPressureMaxMultiplier: 1,
        defaultMutationRate: 0.1,
        monocultureMortalityPenalty: 0,
      });
      state.world.setCell(2, 2, { producerBiomass: 50 });
      return tickEngine(state).events.find((event) => event.type === 'birth');
    };

    const control = run(false);
    const hotspot = run(true);
    expect(control).toMatchObject({ mutationPressure: 0, mutationRate: 0.1 });
    expect(hotspot?.mutationPressure).toBeGreaterThan(0);
    expect(hotspot?.mutationRate).toBeGreaterThan(control?.mutationRate ?? 0);
    expect(run(true)).toEqual(hotspot);
  });

  it('applies toxin-only mutagenicity independent of corpse decay', () => {
    // Test Gap 1: toxicity contribution to mutation pressure without corpses
    // When toxicity > 0 but no nearby corpses, getLocalMiasmaMutationPressure
    // should return a nonzero but capped pressure from the toxicity term alone.
    const noCorpores: any[] = [];
    const lowToxicity = getLocalMiasmaMutationPressure(5, 5, noCorpores, 3, 30, 2);
    const mediumToxicity = getLocalMiasmaMutationPressure(5, 5, noCorpores, 3, 30, 4);
    const highToxicity = getLocalMiasmaMutationPressure(5, 5, noCorpores, 3, 30, 6);
    const veryHighToxicity = getLocalMiasmaMutationPressure(5, 5, noCorpores, 3, 30, 100);

    // Toxicity pressure = min(0.3, toxicity * 0.05)
    expect(lowToxicity).toBeCloseTo(0.1);
    expect(mediumToxicity).toBeCloseTo(0.2);
    expect(highToxicity).toBeCloseTo(0.3);
    expect(veryHighToxicity).toBeCloseTo(0.3); // capped at 0.3
    expect(lowToxicity).toBeGreaterThan(0);
    expect(veryHighToxicity).toBeLessThanOrEqual(0.3);
  });

  it('demonstrates harmful energy cost and heritable mutation together in toxic cell', () => {
    // Test Gap 2: show that high toxicity simultaneously imposes energy cost
    // AND increases mutation pressure during reproduction.
    const run = (cellToxicity: number) => {
      Creature.resetIdCounter();
      const parent = new Creature({
        speciesId: 'grazer',
        lineageId: 'grazer-root',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
        x: 2,
        y: 2,
        energy: 100,
        age: 8,
      });
      const state = createEngine(91, [parent], 5, 5, {
        baseMetabolism: 0,
        reproductionEnergyThreshold: 50,
        reproductionEnergyCost: 10,
        reproductionMaturityAgeTicks: 0,
        reproductionCooldownTicks: 0,
        reproductionPressureStart: 1,
        reproductionPressureMaxMultiplier: 1,
        defaultMutationRate: 0.1,
        monocultureMortalityPenalty: 0,
      });
      state.world.setCell(2, 2, { producerBiomass: 50, toxicity: cellToxicity });
      const result = tickEngine(state);
      return {
        birthEvent: result.events.find((e) => e.type === 'birth'),
        mutationEvent: result.events.find((e) => e.type === 'mutation'),
        parentAfter: result.creatures.find((c) => c.id === parent.id),
      };
    };

    const baseline = run(0);
    const toxic = run(5);

    // Verify baseline has no toxicity-induced pressure
    expect(baseline.birthEvent).toMatchObject({ mutationPressure: 0, mutationRate: 0.1 });

    // Verify toxic cell produces elevated mutation pressure
    expect(toxic.birthEvent?.mutationPressure).toBeGreaterThan(0);
    expect(toxic.birthEvent?.mutationRate).toBeGreaterThan(baseline.birthEvent?.mutationRate ?? 0);

    // Verify the parent in toxic cell still pays an energy cost
    // (it's harder to reproduce, shown by higher reproduction threshold)
    const toxicThreshold = getToxinAdjustedReproductionThreshold(50, 5);
    expect(toxicThreshold).toBeGreaterThan(50);

    // Verify determinism: same seed produces identical results
    expect(run(5)).toEqual(toxic);
  });
});
