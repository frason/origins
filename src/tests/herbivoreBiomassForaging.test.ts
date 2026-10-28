import { describe, it, expect, beforeEach } from 'vitest';
import {
  Creature,
  computeMovementTarget,
  scanEnvironment,
} from '../simulation/creature';
import { World } from '../simulation/world';
import { createRng } from '../simulation/rng';
import { DEFAULT_TRAITS } from '../utils/traits';

// #359: herbivores must not chase near-empty producer cells (biomass < 5).
describe('herbivore biomass-aware foraging (#359)', () => {
  let world: World;

  beforeEach(() => {
    Creature.resetIdCounter();
    world = new World(100, 100);
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) world.setCell(x, y, { biome: 'grassland' });
    }
  });

  const makeHerbivore = () =>
    new Creature({
      speciesId: 'grazer',
      lineageId: 'grazer',
      parentId: null,
      traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore', visionRange: 5, speed: 2 },
      x: 50,
      y: 50,
      energy: 60,
    });

  it('prefers a cell with biomass >= 5 over a nearer cell with biomass < 5', () => {
    const herbivore = makeHerbivore();
    world.setCell(51, 50, { producerBiomass: 2 }); // nearer, trailing-edge residue
    world.setCell(54, 50, { producerBiomass: 20 }); // farther, lush

    const rng = createRng(359);
    const scan = scanEnvironment(herbivore, world, [herbivore], rng);
    expect(scan.foodLocations.map((f) => `${f.x},${f.y}`)).toEqual(['54,50']);

    const target = computeMovementTarget(herbivore, 'move-to-food', scan, world, [herbivore]);
    expect(target).toMatchObject({ x: 54, y: 50 });
  });

  it('does not treat a lone cell with biomass < 5 as food', () => {
    const herbivore = makeHerbivore();
    world.setCell(52, 50, { producerBiomass: 4.99 });

    const scan = scanEnvironment(herbivore, world, [herbivore], createRng(359));
    expect(scan.foodLocations).toHaveLength(0);
  });

  it('treats a cell with exactly biomass 5 as food', () => {
    const herbivore = makeHerbivore();
    world.setCell(52, 50, { producerBiomass: 5 });

    const scan = scanEnvironment(herbivore, world, [herbivore], createRng(359));
    expect(scan.foodLocations).toEqual([{ x: 52, y: 50, biomass: 5 }]);
  });
});
