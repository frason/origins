import { describe, it, expect } from 'vitest';
import { createEngine, tickEngine } from '../simulation/engine';
import { Creature } from '../simulation/creature';
import { DEFAULT_TRAITS } from '../utils/traits';

describe('karen perf check #168', () => {
  it('ticks a 100x100 world with 2000 creatures (many dead) within reasonable time', () => {
    const creatures: Creature[] = [];
    for (let i = 0; i < 2000; i++) {
      creatures.push(
        new Creature({
          speciesId: 'sp1',
          lineageId: 'l1',
          parentId: null,
          traits: { ...DEFAULT_TRAITS },
          x: i % 100,
          y: Math.floor(i / 100) % 100,
          energy: 50,
          age: 0,
          lifecycleState: i % 3 === 0 ? 'dead' : 'alive',
          corpseDecayTicks: i % 3 === 0 ? 40 : 0,
        })
      );
    }
    let state = createEngine(1, creatures, 100, 100);
    const start = performance.now();
    for (let i = 0; i < 30; i++) {
      state = tickEngine(state);
    }
    const elapsed = performance.now() - start;
    console.log('30 ticks elapsed ms', elapsed, 'per tick', elapsed / 30);
    // Threshold loosened to 2000ms per tick (issue #348). The previous 950ms limit was
    // load-flaky: a run under concurrent load measured ~1020ms/tick (~30.7s for the
    // test) and failed. Isolated baseline is ~510-540ms/tick; 2000ms still catches
    // major (~4x) regressions while tolerating load spikes.
    if (process.env.PERF_ASSERT === '1') {
      expect(elapsed / 30).toBeLessThan(2000);
    }
  });
});
