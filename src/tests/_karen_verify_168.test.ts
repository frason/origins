import { describe, it, expect } from 'vitest';
import { createEngine, tickEngine } from '../simulation/engine';
import { Creature } from '../simulation/creature';
import { DEFAULT_TRAITS } from '../utils/traits';

describe('karen verify #168', () => {
  it('shows whether corpseBiomass persists independently of creature.energy decay (aggregation reset bug)', () => {
    const corpse = new Creature({
      speciesId: 'sp1', lineageId: 'l1', parentId: null,
      traits: { ...DEFAULT_TRAITS }, x: 10, y: 10, energy: 100,
      lifecycleState: 'dead', corpseDecayTicks: 50, age: 0,
    });
    let state = createEngine(1, [corpse], 20, 20);
    const corpseId = state.creatures[0].id;

    const rows: any[] = [];
    for (let i = 0; i < 5; i++) {
      state = tickEngine(state);
      const cell = state.world.getCell(10, 10);
      const liveCreature = state.creatures.find(c => c.id === corpseId);
      rows.push({
        tick: i + 1,
        corpseBiomass: cell.corpseBiomass,
        creatureEnergy: liveCreature?.energy,
        nutrients: cell.nutrients,
        decompserActivity: cell.decompserActivity,
      });
    }
    console.log(JSON.stringify(rows, null, 2));
    // If aggregateCorpseBiomass just mirrors creature.energy every tick,
    // corpseBiomass should equal creature.energy exactly every tick,
    // meaning the processDecomposition consumption is discarded each tick.
    for (const r of rows) {
      expect(r.corpseBiomass).toBeCloseTo(r.creatureEnergy!, 5);
    }
  });
});
