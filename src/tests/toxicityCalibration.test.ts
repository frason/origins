import { describe, expect, it } from 'vitest';
import { Creature } from '../simulation/creature';
import { decayCorpse, dissipateToxicity } from '../simulation/decomposition';
import {
  getToxicityHazard,
  TRACE_TOXICITY_THRESHOLD,
} from '../simulation/toxicity';
import { World } from '../simulation/world';
import { TOXICITY_RETENTION } from '../utils/constants';
import { DEFAULT_TRAITS } from '../utils/traits';
import { runToxicityCalibration } from '../simulation/toxicityCalibration';

function corpse(id: number): Creature {
  const creature = new Creature({
    speciesId: 'grazer', lineageId: 'grazer', parentId: null,
    traits: { ...DEFAULT_TRAITS }, x: 1, y: 1, energy: 100,
    lifecycleState: 'dead', corpseDecayTicks: 10,
  });
  creature.id = `corpse-${id}`;
  return creature;
}

describe('toxicity severity calibration', () => {
  it('keeps trace residue visually subtle and harmless to animals', () => {
    const trace = getToxicityHazard(TRACE_TOXICITY_THRESHOLD / 2);
    expect(trace.severity).toBe('trace');
    expect(trace.overlayOpacity).toBe(0);
    expect(trace.creatureEnergyCost).toBe(0);
  });

  it('makes severe visible contamination ecologically harmful', () => {
    const severe = getToxicityHazard(4);
    expect(severe.severity).toBe('severe');
    expect(severe.overlayOpacity).toBeGreaterThan(0.25);
    expect(severe.creatureEnergyCost).toBeGreaterThan(0.2);
    expect(severe.producerGrowthMultiplier).toBeLessThanOrEqual(0.2);
  });

  it('lets default corpse trails fade rapidly', () => {
    const world = new World(1, 1);
    world.setCell(0, 0, { toxicity: 10 });
    for (let tick = 0; tick < 3; tick++) dissipateToxicity(world);

    expect(TOXICITY_RETENTION).toBe(0.2);
    expect(world.getCell(0, 0).toxicity).toBeCloseTo(0.08, 8);
    expect(getToxicityHazard(world.getCell(0, 0).toxicity).overlayOpacity).toBe(0);
  });

  it('keeps concentrated corpse clusters dangerous but recoverable', () => {
    const world = new World(3, 3);
    for (let index = 0; index < 3; index++) decayCorpse(corpse(index), world, 0.1, 1, 0);
    expect(getToxicityHazard(world.getCell(1, 1).toxicity).severity).toBe('severe');

    for (let tick = 0; tick < 3; tick++) dissipateToxicity(world);
    expect(getToxicityHazard(world.getCell(1, 1).toxicity).severity).toBe('trace');
  });

  it('preserves persistent God Mode contamination at full retention', () => {
    const world = new World(1, 1);
    world.setCell(0, 0, { toxicity: 5 });
    for (let tick = 0; tick < 20; tick++) dissipateToxicity(world, 1);
    expect(world.getCell(0, 0).toxicity).toBe(5);
    expect(getToxicityHazard(world.getCell(0, 0).toxicity).severity).toBe('severe');
  });

  it('measures aligned visual and ecological consequences across fixed seeds', () => {
    const results = [42, 12345, 54321, 99999].map((seed) => runToxicityCalibration(seed));
    for (const result of results) {
      const evidence = JSON.stringify(result);
      expect(result.samples.map((sample) => sample.tick), evidence).toEqual([60, 100]);
      expect(Math.max(...result.samples.map((sample) => sample.totalToxicity)), evidence)
        .toBeGreaterThan(0);
      for (const sample of result.samples) {
        if (sample.severeCellCount > 0) {
          expect(sample.suppressedProducerCellCount, evidence).toBeGreaterThan(0);
        }
        if (sample.exposedCreatureCount > 0) {
          expect(sample.creatureExposureCost, evidence).toBeGreaterThan(0);
        }
      }
    }
    expect(runToxicityCalibration(42)).toEqual(results[0]);
  }, 30_000);
});
