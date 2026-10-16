import { describe, it, expect } from 'vitest';
import { createEngine, tickEngine } from '../simulation/engine';
import { Creature } from '../simulation/creature';
import { DEFAULT_TRAITS } from '../utils/traits';

describe('karen engine-level decomposition trace', () => {
  it('traces corpseBiomass across ticks for a single dead creature', () => {
    const corpse = new Creature({
      speciesId: 'sp1', lineageId: 'l1', parentId: null,
      traits: { ...DEFAULT_TRAITS }, x: 10, y: 10, energy: 100, age: 0,
      lifecycleState: 'dead', corpseDecayTicks: 40,
    });
    let state = createEngine(1, [corpse], 20, 20);
    const trace: Array<{ tick: number; energy: number; corpseBiomass: number; nutrients: number }> = [];
    for (let i = 0; i < 15; i++) {
      state = tickEngine(state);
      const c = state.creatures.find((cr) => cr.id === corpse.id);
      const cell = state.world.getCell(10, 10);
      trace.push({
        tick: i + 1,
        energy: c ? c.energy : -1,
        corpseBiomass: cell.corpseBiomass ?? -1,
        nutrients: cell.nutrients,
      });
    }
    console.log(JSON.stringify(trace, null, 2));
    expect(true).toBe(true);
  });
});
