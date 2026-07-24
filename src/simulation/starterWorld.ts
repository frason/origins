import { Creature } from './creature';
import { createRng, randChoice, type RngFn } from './rng';
import { generateTerrain } from './world';
import { DEFAULT_TRAITS } from '../utils/traits';
import { FOUNDER_SPECIES, type FounderSpeciesDefinition } from './founderSpecies';

interface Position {
  x: number;
  y: number;
}

const STARTER_CORPSE_COUNT = 3;

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

function firstAvailablePool(candidates: Position[][], occupied: Set<string>): Position[] {
  const available = candidates.find((pool) => pool.some((position) => !occupied.has(positionKey(position))));
  if (!available) throw new Error('No unoccupied starter tiles remain');
  return available;
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

function takeAnchoredPosition(
  rng: RngFn,
  anchors: Position[],
  candidates: Position[],
  occupied: Set<string>
): Position {
  const reachableAnchors = anchors.filter((anchor) => candidates.some(
    (candidate) =>
      !occupied.has(positionKey(candidate)) &&
      Math.max(Math.abs(candidate.x - anchor.x), Math.abs(candidate.y - anchor.y)) <= 4
  ));
  const anchor = randChoice(rng, reachableAnchors.length > 0 ? reachableAnchors : anchors);
  return takeNearbyPosition(rng, anchor, candidates, occupied);
}

function preferredPositions(
  terrain: ReturnType<typeof generateTerrain>,
  species: FounderSpeciesDefinition
): Position[] {
  return terrain.flatMap((row, y) => row.flatMap((cell, x) =>
    species.viableBiomes.includes(cell.biome) ? [{ x, y }] : []
  ));
}

function primaryPositions(
  terrain: ReturnType<typeof generateTerrain>,
  species: FounderSpeciesDefinition
): Position[] {
  return terrain.flatMap((row, y) => row.flatMap((cell, x) =>
    cell.biome === species.viableBiomes[0] ? [{ x, y }] : []
  ));
}

/** Build a varied, replay-safe starter food web on habitable land. */
export function buildStarterCreatures(
  seed: number,
  width: number,
  height: number,
  corpseDecayTicks: number = 30
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
  const founderPopulation = FOUNDER_SPECIES.reduce((sum, species) => sum + species.population, 0);
  if (habitable.length < founderPopulation + STARTER_CORPSE_COUNT) {
    throw new Error('World does not contain enough habitable starter tiles');
  }

  const occupied = new Set<string>();
  const creatures: Creature[] = [];
  const positionsBySpecies = new Map<string, Position[]>();

  for (const spec of FOUNDER_SPECIES) {
    const primary = primaryPositions(terrain, spec);
    const preferred = preferredPositions(terrain, spec);
    const anchors = spec.foodAnchor ? positionsBySpecies.get(spec.foodAnchor) ?? [] : [];
    const positions = Array.from({ length: spec.population }, () => {
      const candidates = firstAvailablePool([primary, preferred, habitable], occupied);
      const anchor = anchors[0];
      return anchor
        ? takeAnchoredPosition(rng, anchors, candidates, occupied)
        : takeRandomPosition(rng, candidates, occupied);
    });
    positionsBySpecies.set(spec.id, positions);
    for (const position of positions) {
      creatures.push(new Creature({
        speciesId: spec.id,
        lineageId: spec.id,
        parentId: null,
        traits: { ...DEFAULT_TRAITS, ...spec.traits, energyStrategy: spec.strategy },
        ...position,
        energy: spec.startingEnergy,
      }));
    }

    if (spec.strategy === 'scavenger') {
      const position = positions[0];
      const carrionCandidates = habitable.filter((candidate) => {
        const distance = Math.max(
          Math.abs(candidate.x - position.x), Math.abs(candidate.y - position.y)
        );
        return distance >= 4 && distance <= 6;
      });
      for (let index = 0; index < STARTER_CORPSE_COUNT; index++) {
        const carrionPosition = takeRandomPosition(
          rng,
          firstAvailablePool([carrionCandidates, habitable], occupied),
          occupied
        );
        creatures.push(new Creature({
          speciesId: spec.id,
          lineageId: `${spec.id}_starter_carrion`,
          parentId: null,
          traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
          ...carrionPosition,
          energy: 120,
          lifecycleState: 'dead',
          corpseDecayTicks: Math.max(1, corpseDecayTicks),
        }));
      }
    }
  }

  return creatures;
}
