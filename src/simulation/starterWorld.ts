import { Creature } from './creature';
import { createRng, randChoice, randInt, type RngFn } from './rng';
import { generateTerrain } from './world';
import { DEFAULT_TRAITS, type EnergyStrategy } from '../utils/traits';

interface Position {
  x: number;
  y: number;
}

interface StarterSpec {
  speciesId: string;
  strategy: EnergyStrategy;
  energy: number;
}

const HERBIVORE_COUNT = 14;
const SUPPORT_SPECS: StarterSpec[] = [
  { speciesId: 'omnivore_001', strategy: 'omnivore', energy: 160 },
  { speciesId: 'omnivore_001', strategy: 'omnivore', energy: 160 },
  { speciesId: 'omnivore_001', strategy: 'omnivore', energy: 160 },
  { speciesId: 'carnivore_001', strategy: 'carnivore', energy: 180 },
  { speciesId: 'carnivore_001', strategy: 'carnivore', energy: 180 },
  { speciesId: 'scavenger_001', strategy: 'scavenger', energy: 120 },
];

function positionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

function takeRandomPosition(
  rng: RngFn,
  candidates: Position[],
  occupied: Set<string>
): Position {
  const available = candidates.filter((position) => !occupied.has(positionKey(position)));
  if (available.length === 0) throw new Error('No unoccupied starter tiles remain');
  const selected = randChoice(rng, available);
  occupied.add(positionKey(selected));
  return selected;
}

function takeNearbyPosition(
  rng: RngFn,
  anchor: Position,
  candidates: Position[],
  occupied: Set<string>
): Position {
  const nearby = candidates.filter(
    (position) =>
      !occupied.has(positionKey(position)) &&
      Math.max(Math.abs(position.x - anchor.x), Math.abs(position.y - anchor.y)) <= 4
  );
  return takeRandomPosition(rng, nearby.length > 0 ? nearby : candidates, occupied);
}

/** Build a varied, replay-safe starter food web on habitable land. */
export function buildStarterCreatures(
  seed: number,
  width: number,
  height: number
): Creature[] {
  const rng = createRng(seed ^ 0x51a7e2);
  const terrain = generateTerrain(width, height, seed);
  const habitable: Position[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const biome = terrain[y][x].biome;
      if (biome !== 'ocean' && biome !== 'mountain') habitable.push({ x, y });
    }
  }
  if (habitable.length < HERBIVORE_COUNT + SUPPORT_SPECS.length) {
    throw new Error('World does not contain enough habitable starter tiles');
  }

  const occupied = new Set<string>();
  const herbivorePositions = Array.from({ length: HERBIVORE_COUNT }, () =>
    takeRandomPosition(rng, habitable, occupied)
  );
  const creatures = herbivorePositions.map(
    (position) =>
      new Creature({
        speciesId: 'herbivore_001',
        lineageId: 'herbivore_001',
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
        ...position,
        energy: 140,
      })
  );

  for (const spec of SUPPORT_SPECS) {
    const anchor = herbivorePositions[randInt(rng, 0, herbivorePositions.length)];
    const position = takeNearbyPosition(rng, anchor, habitable, occupied);
    creatures.push(
      new Creature({
        speciesId: spec.speciesId,
        lineageId: spec.speciesId,
        parentId: null,
        traits: { ...DEFAULT_TRAITS, energyStrategy: spec.strategy },
        ...position,
        energy: spec.energy,
      })
    );
  }

  return creatures;
}
