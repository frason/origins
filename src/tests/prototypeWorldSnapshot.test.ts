import { describe, expect, it } from 'vitest';
import { buildDemoEngine } from '../simulation/demoWorld';
import { tickEngine } from '../simulation/engine';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import { toPrototypeWorldSnapshot, validatePrototypeWorldSnapshot } from '../prototype/worldSnapshot';

function stateAt(tick: number) {
  let state = buildDemoEngine(12345, { ...SIMULATION_CONSTANTS });
  for (let index = 0; index < tick; index++) state = tickEngine(state);
  return state;
}

describe('prototype world snapshot', () => {
  it('converts a frozen state deterministically with all renderable world facts', () => {
    const first = toPrototypeWorldSnapshot(stateAt(100));
    const second = toPrototypeWorldSnapshot(stateAt(100));
    expect(second).toEqual(first);
    expect(first.world.cells).toHaveLength(first.world.width * first.world.height);
    expect(first.creatures.length).toBeGreaterThan(0);
    expect(first.events.length).toBeLessThanOrEqual(24);
    expect(JSON.stringify(first).length).toBeLessThan(2_000_000);
  });

  it('rejects invalid dimensions and creature coordinates', () => {
    const snapshot = toPrototypeWorldSnapshot(stateAt(1));
    expect(() => validatePrototypeWorldSnapshot({ ...snapshot, world: { ...snapshot.world, width: 0 } }))
      .toThrow('dimensions');
    const creatures = [...snapshot.creatures];
    creatures[0] = { ...creatures[0], x: -1 };
    expect(() => validatePrototypeWorldSnapshot({ ...snapshot, creatures })).toThrow('invalid creature');
  });
});
