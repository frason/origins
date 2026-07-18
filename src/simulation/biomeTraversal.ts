import type { Creature } from './creature';
import type { Biome, World } from './world';

export const BIOME_MOVEMENT_COST: Record<Biome, number> = {
  grassland: 1,
  desert: 1.05,
  forest: 1.1,
  tundra: 1.15,
  wetland: 1.2,
  ocean: Infinity,
  mountain: Infinity,
};

const DIRECTIONS = [
  { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 },
  { dx: 0, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 },
] as const;

export function isTerrainTraversable(world: World, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return false;
  return Number.isFinite(BIOME_MOVEMENT_COST[world.getCell(x, y).biome]);
}

const key = (x: number, y: number) => `${x},${y}`;

/** Return locally connected cells so perception does not select food behind barriers. */
export function reachableTerrainCells(
  world: World,
  originX: number,
  originY: number,
  range: number
): Set<string> {
  const boundedRange = Math.max(0, Math.min(50, Math.floor(range)));
  const reachable = new Set<string>([key(originX, originY)]);
  const queue = [{ x: originX, y: originY }];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    for (const direction of DIRECTIONS) {
      const x = current.x + direction.dx;
      const y = current.y + direction.dy;
      if (
        Math.max(Math.abs(x - originX), Math.abs(y - originY)) > boundedRange ||
        !isTerrainTraversable(world, x, y) || reachable.has(key(x, y))
      ) continue;
      reachable.add(key(x, y));
      queue.push({ x, y });
    }
  }
  return reachable;
}

function distance(x: number, y: number, targetX: number, targetY: number): number {
  return Math.max(Math.abs(targetX - x), Math.abs(targetY - y));
}

/** Move greedily through passable neighboring cells with deterministic biome slowdown. */
export function moveAcrossTerrain(
  creature: Creature,
  target: { x: number; y: number },
  world: World
): { x: number; y: number } {
  let x = creature.x;
  let y = creature.y;
  let budget = Math.max(0, creature.traits.speed);
  const targetX = Math.max(0, Math.min(world.width - 1, target.x));
  const targetY = Math.max(0, Math.min(world.height - 1, target.y));

  while (budget > 0) {
    const currentDistance = distance(x, y, targetX, targetY);
    if (currentDistance === 0) break;
    const candidates = DIRECTIONS
      .map((direction) => ({ x: x + direction.dx, y: y + direction.dy }))
      .filter((candidate) => isTerrainTraversable(world, candidate.x, candidate.y))
      .map((candidate) => ({
        ...candidate,
        distance: distance(candidate.x, candidate.y, targetX, targetY),
        directDistance: Math.abs(targetX - candidate.x) + Math.abs(targetY - candidate.y),
        cost: BIOME_MOVEMENT_COST[world.getCell(candidate.x, candidate.y).biome],
      }))
      // Equal-distance steps allow deterministic routing around a shoreline or ridge.
      .filter((candidate) => candidate.distance <= currentDistance)
      .sort((a, b) => a.distance - b.distance || a.directDistance - b.directDistance || a.cost - b.cost || a.y - b.y || a.x - b.x);
    const next = candidates[0];
    if (!next) break;
    if (next.cost > budget) {
      // Slow terrain remains crossable for speed-1 creatures, but only on a
      // deterministic cadence based on age rather than a new random draw.
      const excessCost = Math.max(0.01, next.cost - creature.traits.speed);
      const delayPeriod = Math.max(2, Math.round(1 / excessCost));
      if (creature.age % delayPeriod === 0) break;
    }
    x = next.x;
    y = next.y;
    budget -= next.cost;
  }
  return { x, y };
}
