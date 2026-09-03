import { describe, it, expect } from 'vitest';
import { getLocalMiasmaMutationPressure, getToxicityHazard } from '../simulation/toxicity';

describe('karen verify 166', () => {
  it('prints toxicity mutation pressure and hazard values', () => {
    console.log('toxicity=0 pressure', getLocalMiasmaMutationPressure(5, 5, [], 3, 30, 0));
    console.log('toxicity=1 pressure', getLocalMiasmaMutationPressure(5, 5, [], 3, 30, 1));
    console.log('toxicity=6 pressure (cap 0.3?)', getLocalMiasmaMutationPressure(5, 5, [], 3, 30, 6));
    console.log('toxicity=100 pressure (cap 0.3?)', getLocalMiasmaMutationPressure(5, 5, [], 3, 30, 100));
    console.log('hazard at toxicity=6', JSON.stringify(getToxicityHazard(6)));
    expect(true).toBe(true);
  });
});
