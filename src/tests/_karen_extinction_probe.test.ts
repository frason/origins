import { describe, it, expect } from 'vitest';
import { createEngine, tickEngine } from '../simulation/engine';
import { Creature } from '../simulation/creature';
import { DEFAULT_TRAITS } from '../utils/traits';

describe('karen probe: extinction affectedRegion', () => {
  it('checks whether extinction events ever carry an affectedRegion', () => {
    const creatures = [
      new Creature({
        speciesId: 'onlyspecies',
        lineageId: 'lineage-1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: 3,
        y: 7,
        energy: 5,
        age: 0,
      }),
    ];

    let state = createEngine(42, creatures, 100, 100, {
      maxCreatureAgeTicks: 2,
      corpseDecayDurationTicks: 1,
    } as any);

    let found = false;
    let foundWithRegion = false;
    for (let i = 0; i < 100; i++) {
      // debug all events

      state = tickEngine(state);
      for (const e of state.events) {
        if (e.type === 'extinction') {
          found = true;
          // eslint-disable-next-line no-console
          console.log('extinction event:', JSON.stringify(e));
          if ((e as any).affectedRegion) foundWithRegion = true;
        }
      }
      if (found) break;
    }
    console.log('all events last state:', JSON.stringify(state.events.map((e)=>e.type)));
    // Just report, don't fail the suite build
    console.log('RESULT found=', found, 'foundWithRegion=', foundWithRegion);
    expect(found).toBe(true);
  });
});
