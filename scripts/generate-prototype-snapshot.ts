import { writeFile } from 'node:fs/promises';
import { buildDemoEngine } from '../src/simulation/demoWorld';
import { tickEngine } from '../src/simulation/engine';
import { toPrototypeWorldSnapshot } from '../src/prototype/worldSnapshot';
import { SIMULATION_CONSTANTS } from '../src/utils/constants';

const seed = 12345;
const tick = 100;
let state = buildDemoEngine(seed, { ...SIMULATION_CONSTANTS });
for (let index = 0; index < tick; index++) state = tickEngine(state);
const snapshot = toPrototypeWorldSnapshot(state);
await writeFile(
  new URL('../src/prototype/fixtures/default-world-t100.json', import.meta.url),
  `${JSON.stringify(snapshot)}\n`,
);
