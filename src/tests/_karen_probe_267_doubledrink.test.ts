import { describe, it, expect } from 'vitest';
import { createEngine, tickEngine } from '../simulation/engine';
import { World } from '../simulation/world';
import { Creature } from '../simulation/creature';
import { DEFAULT_TRAITS } from '../utils/traits';

describe('karen double-drink probe', () => {
  it('checks saline drink is not double-applied per tick', () => {
    const world = new World(100, 100);
    world.setCell(51, 50, { waterDepth: 2, salinity: 0.5 });

    const engine = createEngine(42, [
      new Creature({
        speciesId: 'test_species',
        lineageId: 'test_lineage',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, waterNeed: 1, saltTolerance: 0.4 },
        x: 50,
        y: 50,
        energy: 100,
        hydration: 0.0,
      }),
    ], 100, 100, {
      baseMetabolism: 0,
      hydrationDepletionRate: 0.0,
    });
    engine.world = world;

    const before = engine.creatures[0];
    console.log('before hydration', before.hydration, 'toxin', before.toxinExposure);

    const after = tickEngine(engine);
    const creature = after.creatures[0];
    console.log('after hydration', creature.hydration, 'toxin', creature.toxinExposure);

    // Expected single-application recovery: 0.5 * saltTolerance(0.4) = 0.2
    expect(creature.hydration).toBeCloseTo(0.2, 2);
  });
});
