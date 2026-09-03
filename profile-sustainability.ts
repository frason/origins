import { evaluateSustainability } from './src/simulation/sustainability';

const SEED = 12345;
const TICK_HORIZON = 100;

const start = performance.now();
const result = evaluateSustainability({ name: 'test', constants: {} }, SEED, TICK_HORIZON);
const elapsed = performance.now() - start;

console.log(`Completed in ${elapsed.toFixed(0)}ms`);
console.log(`Result: ${JSON.stringify(result)}`);
