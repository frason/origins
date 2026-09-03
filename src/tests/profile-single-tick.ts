import { buildDemoEngine } from '../simulation/demoWorld';
import { tickEngine } from '../simulation/engine';
import { SIMULATION_CONSTANTS } from '../utils/constants';

console.log('Starting single-tick profile...');
const state = buildDemoEngine(42, { ...SIMULATION_CONSTANTS });

console.log('Measuring 20 ticks...');
const start = performance.now();
let current = state;
for (let i = 0; i < 20; i++) {
  current = tickEngine(current);
}
const elapsed = performance.now() - start;
console.log(`20 ticks took ${elapsed.toFixed(2)}ms (${(elapsed/20).toFixed(2)}ms per tick)`);
