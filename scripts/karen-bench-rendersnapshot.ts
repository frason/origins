import { buildDemoEngine } from '../src/simulation/demoWorld';
import { tickEngine, type EngineState } from '../src/simulation/engine';
import { SIMULATION_CONSTANTS } from '../src/utils/constants';
import { toRenderSnapshot } from '../src/prototype/renderSnapshot';

function run(tick: number) {
  let state: EngineState = buildDemoEngine(42, { ...SIMULATION_CONSTANTS });
  for (let i = 0; i < tick; i++) {
    state = tickEngine(state);
  }
  const corpseCount = state.creatures.filter((c) => c.lifecycleState !== 'alive').length;
  const aliveCount = state.creatures.filter((c) => c.lifecycleState === 'alive').length;

  // warm up
  toRenderSnapshot(state);

  const N = 10;
  const start = performance.now();
  for (let i = 0; i < N; i++) {
    toRenderSnapshot(state);
  }
  const elapsed = performance.now() - start;
  console.log(
    `tick=${tick} alive=${aliveCount} corpses=${corpseCount} avgSnapshotMs=${(elapsed / N).toFixed(2)}`
  );
}

run(1);
run(50);
run(100);
run(300);
