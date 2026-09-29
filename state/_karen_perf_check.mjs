import { performance } from 'node:perf_hooks';
const t0 = performance.now();
const { World } = await import('../src/simulation/world.ts');
const { SIMULATION_CONSTANTS } = await import('../src/utils/constants.ts');
const t1 = performance.now();
const w = new World(100, 100, SIMULATION_CONSTANTS, 42);
const t2 = performance.now();
console.log('import ms:', t1 - t0, 'world gen ms:', t2 - t1);
