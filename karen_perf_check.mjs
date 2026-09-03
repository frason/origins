import { buildDemoEngine } from './src/simulation/demoWorld.ts';
import { tickEngine } from './src/simulation/engine.ts';
import { SIMULATION_CONSTANTS } from './src/utils/constants.ts';
import { toRenderSnapshot } from './src/prototype/renderSnapshot.ts';

let state = buildDemoEngine(42, { ...SIMULATION_CONSTANTS });
const tickStart = performance.now();
for (let i = 0; i < 20; i++) {
  state = tickEngine(state);
}
console.log('20 ticks took', (performance.now() - tickStart).toFixed(1), 'ms; creatures=', state.creatures.length);

const times = [];
for (let i = 0; i < 10; i++) {
  const t0 = performance.now();
  const snap = toRenderSnapshot(state);
  times.push(performance.now() - t0);
  if (i === 0) console.log('reported buildTimeMs (internal)=', snap.metadata.buildTimeMs.toFixed(2));
}
console.log('toRenderSnapshot wall times (ms):', times.map((t) => t.toFixed(2)).join(', '));
