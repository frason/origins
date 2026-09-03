import { describe, it, expect } from 'vitest';
import { createEngine, tickEngine } from '../simulation/engine';
import { Creature } from '../simulation/creature';
import { DEFAULT_TRAITS } from '../utils/traits';

describe('KAREN scratch3: engine integration check', () => {
  it('checks whether corpseBiomass/decompserActivity ever become nonzero via tickEngine', () => {
    Creature.resetIdCounter();
    const dyingCreature = new Creature({
      speciesId: 's1', lineageId: 'l1', parentId: null,
      traits: { ...DEFAULT_TRAITS }, x: 10, y: 10, energy: 0.01, age: 0, lifecycleState: 'alive',
    });
    let state = createEngine(42, [dyingCreature]);
    let maxCorpseBiomass = 0;
    let maxActivity = 0;
    for (let i = 0; i < 30; i++) {
      state = tickEngine(state);
      for (let y = 0; y < state.world.height; y++) {
        for (let x = 0; x < state.world.width; x++) {
          const cell = state.world.getCell(x, y);
          maxCorpseBiomass = Math.max(maxCorpseBiomass, cell.corpseBiomass || 0);
          maxActivity = Math.max(maxActivity, cell.decompserActivity || 0);
        }
      }
    }
    console.log('maxCorpseBiomass over 30 ticks =', maxCorpseBiomass, 'maxDecompserActivity =', maxActivity);
    console.log('dead creatures remaining:', state.creatures.filter(c => c.lifecycleState === 'dead').length);
  });
});
