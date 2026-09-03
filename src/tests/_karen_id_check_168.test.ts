import { describe, it, expect } from 'vitest';
import { createEngine, tickEngine } from '../simulation/engine';
import { Creature } from '../simulation/creature';
import { DEFAULT_TRAITS } from '../utils/traits';

describe('karen id check', () => {
  it('traces ids', () => {
    const corpse = new Creature({
      speciesId: 'sp1', lineageId: 'l1', parentId: null,
      traits: { ...DEFAULT_TRAITS }, x: 10, y: 10, energy: 100, age: 0,
      lifecycleState: 'dead', corpseDecayTicks: 40,
    });
    let state = createEngine(1, [corpse], 20, 20);
    console.log('initial id', corpse.id, 'count', state.creatures.length);
    for (let i = 0; i < 5; i++) {
      state = tickEngine(state);
      console.log('tick', i + 1, 'ids', state.creatures.map((c) => c.id), 'energies', state.creatures.map((c) => c.energy));
    }
    expect(true).toBe(true);
  });
});
