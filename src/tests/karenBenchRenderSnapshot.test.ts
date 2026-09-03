import { describe, it, expect } from 'vitest';
import { buildDemoEngine } from '../simulation/demoWorld';
import { tickEngine, type EngineState } from '../simulation/engine';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import { toRenderSnapshot } from '../prototype/renderSnapshot';

describe('karen bench: render snapshot build time', () => {
  it('measures snapshot build time at various ticks', () => {
    const results: string[] = [];
    for (const tick of [1, 50, 100, 300]) {
      let state: EngineState = buildDemoEngine(42, { ...SIMULATION_CONSTANTS });
      for (let i = 0; i < tick; i++) {
        state = tickEngine(state);
      }
      const corpseCount = state.creatures.filter((c) => c.lifecycleState !== 'alive').length;
      const aliveCount = state.creatures.filter((c) => c.lifecycleState === 'alive').length;

      toRenderSnapshot(state); // warm up

      const N = 10;
      const start = performance.now();
      for (let i = 0; i < N; i++) {
        toRenderSnapshot(state);
      }
      const elapsed = performance.now() - start;
      results.push(
        `tick=${tick} alive=${aliveCount} corpses=${corpseCount} avgSnapshotMs=${(elapsed / N).toFixed(2)}`
      );
    }
    console.log(results.join('\n'));
    expect(true).toBe(true);
  });
});
