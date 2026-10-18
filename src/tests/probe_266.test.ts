import { describe, it, expect } from 'vitest';
import { Creature } from '../simulation/creature';
import { World } from '../simulation/world';
import { DEFAULT_TRAITS } from '../utils/traits';
import { moveAcrossTerrain } from '../simulation/biomeTraversal';

describe('karen probe 266 routing (blocked water, detour check)', () => {
  it('prints path for terrestrial creature facing IMPASSABLE deep water strip with a gap', () => {
    Creature.resetIdCounter();
    const world = new World(100, 100);
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        world.setCell(x, y, { biome: 'grassland', waterDepth: 0 });
      }
    }
    // Deep water wall from y=45..55 at x=20..21 (blocks straight path), except a gap at y=60
    for (let y = 45; y <= 55; y++) {
      for (let x = 20; x <= 21; x++) {
        world.setCell(x, y, { waterDepth: 6.0, biome: 'wetland' }); // cost >> MAX_MOVEMENT_COST -> impassable
      }
    }
    const creature = new Creature({
      speciesId: 'terrestrial', lineageId: 'terrestrial', parentId: null,
      traits: { ...DEFAULT_TRAITS, speed: 3, aquaticAdaptation: 0 },
      x: 10, y: 50, energy: 5000,
    });
    const path = [{ x: creature.x, y: creature.y }];
    for (let i = 0; i < 60; i++) {
      const r = moveAcrossTerrain(creature, { x: 40, y: 50 }, world);
      creature.x = r.x;
      creature.y = r.y;
      path.push({ x: r.x, y: r.y });
    }
    console.log('KAREN_PATH2', JSON.stringify(path));
    expect(true).toBe(true);
  });
});
