import { describe, it } from 'vitest';
import { World } from '../simulation/world';
import { SIMULATION_CONSTANTS } from '../utils/constants';

describe('karen perf check', () => {
  it('times world generation', () => {
    const t0 = performance.now();
    new World(100, 100, SIMULATION_CONSTANTS, 42);
    const t1 = performance.now();
    console.log('WORLD_GEN_MS', t1 - t0);
  });
});
