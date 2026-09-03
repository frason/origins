import { describe, it, expect } from 'vitest';
import { createEngine, tickEngine } from '../simulation/engine';
import { Creature } from '../simulation/creature';
import { DEFAULT_TRAITS } from '../utils/traits';

function run(label: string, n: number, deadFraction: number) {
  const creatures: Creature[] = [];
  for (let i = 0; i < n; i++) {
    creatures.push(new Creature({
      speciesId: 'sp1',
      lineageId: 'l1',
      parentId: null,
      traits: { ...DEFAULT_TRAITS },
      x: i % 100,
      y: Math.floor(i / 100) % 100,
      energy: 50,
      age: 0,
      lifecycleState: Math.random() < deadFraction ? 'dead' : 'alive',
      corpseDecayTicks: 40,
    }));
  }
  let state = createEngine(1, creatures, 100, 100);
  const start = performance.now();
  const TICKS = 5;
  for (let i = 0; i < TICKS; i++) {
    state = tickEngine(state);
  }
  const elapsed = performance.now() - start;
  console.log(`${label}: ${(elapsed / TICKS).toFixed(2)}ms/tick avg (n=${n}, deadFraction=${deadFraction})`);
}

describe('karen perf 168 comparison', () => {
  it('compares all-alive vs mixed-dead population cost', () => {
    run('all-alive-1500', 1500, 0);
    run('mixed-dead-1500', 1500, 0.33);
    run('all-alive-300', 300, 0);
    run('mixed-dead-300', 300, 0.33);
    expect(true).toBe(true);
  });
});
