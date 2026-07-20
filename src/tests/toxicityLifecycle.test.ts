import { describe, expect, it } from 'vitest';
import {
  getCorpseDecayStage,
  getToxinAdjustedReproductionThreshold,
} from '../simulation/toxicity';

describe('toxicity lifecycle', () => {
  it('labels fresh, peak-miasma, and late corpse stages deterministically', () => {
    expect(getCorpseDecayStage(30, 30).stage).toBe('fresh');
    expect(getCorpseDecayStage(20, 30).stage).toBe('peak-miasma');
    expect(getCorpseDecayStage(10, 30).stage).toBe('late-decay');
    expect(getCorpseDecayStage(20, 30).hazardMultiplier)
      .toBeGreaterThan(getCorpseDecayStage(30, 30).hazardMultiplier);
  });

  it('raises reproduction requirements from exposure without changing mutation', () => {
    expect(getToxinAdjustedReproductionThreshold(100, 0)).toBe(100);
    expect(getToxinAdjustedReproductionThreshold(100, 0.5)).toBeCloseTo(110);
    expect(getToxinAdjustedReproductionThreshold(100, 10)).toBeCloseTo(120);
  });
});
