import { describe, it, expect } from 'vitest';
import { createEngine, tickEngine } from '../simulation/engine';
import { Creature } from '../simulation/creature';
import { DEFAULT_TRAITS } from '../utils/traits';

describe('karen perf 168', () => {
  it('measures tick cost with many dead creatures scattered', () => {
    const N = 1500;
    const creatures: Creature[] = [];
    for (let i = 0; i < N; i++) {
      creatures.push(new Creature({
        speciesId: 'sp1',
        lineageId: 'l1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: i % 100,
        y: Math.floor(i / 100) % 100,
        energy: 50,
        age: 0,
        lifecycleState: i % 3 === 0 ? 'dead' : 'alive',
        corpseDecayTicks: 40,
      }));
    }
    let state = createEngine(1, creatures, 100, 100);
    const start = performance.now();
    const TICKS = 20;
    for (let i = 0; i < TICKS; i++) {
      state = tickEngine(state);
    }
    const elapsed = performance.now() - start;
    console.log(
      `Total: ${elapsed.toFixed(1)}ms for ${TICKS} ticks = ${(elapsed / TICKS).toFixed(2)}ms/tick with ${N} creatures (~${Math.floor(N / 3)} dead)`
    );
    expect(true).toBe(true);
  });
});
