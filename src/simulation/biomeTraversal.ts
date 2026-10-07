import type { Creature } from './creature';
import { wrapCoordinate, wrappedDistance, type Biome, type World } from './world';
import type { Traits } from '../utils/traits';
import { metabolicPerformanceMultiplier } from '../utils/traits';
import { getTraversalCost, isWaterPassable } from './movement';

export const BIOME_MOVEMENT_COST: Record<Biome, number> = {
  grassland: 1,
  desert: 1.05,
  forest: 1.1,
  tundra: 1.15,
  wetland: 1.2,
  ocean: Infinity,
  mountain: Infinity,
};

const expressed = (value: number) => Math.max(0, (value - 0.5) / 0.5);

const DIRECTIONS = [
  { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 },
  { dx: 0, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 },
] as const;

export function terrainMovementCost(biome: Biome, traits?: Pick<Traits, 'aquaticAffinity' | 'terrainGrip'>): number {
  const aquaticAffinity = expressed(traits?.aquaticAffinity ?? 0);
  const terrainGrip = expressed(traits?.terrainGrip ?? 0);
  if (biome === 'ocean') return aquaticAffinity >= 0.6 ? 1.8 - aquaticAffinity * 0.6 : Infinity;
  if (biome === 'mountain') return terrainGrip >= 0.6 ? 1.8 - terrainGrip * 0.5 : Infinity;
  const baseCost = BIOME_MOVEMENT_COST[biome];
  const relevantAdaptation = biome === 'wetland'
    ? Math.max(aquaticAffinity, terrainGrip)
    : biome === 'tundra' ? terrainGrip : 0;
  return 1 + (baseCost - 1) * (1 - relevantAdaptation * 0.75);
}

export function isTerrainTraversable(
  world: World,
  x: number,
  y: number,
  traits?: Pick<Traits, 'aquaticAffinity' | 'terrainGrip'>
): boolean {
  if (y < 0 || y >= world.height) return false;
  return Number.isFinite(terrainMovementCost(world.getCell(wrapCoordinate(x, world.width), y).biome, traits));
}

const key = (x: number, y: number) => `${x},${y}`;

/** Lookahead radius for finding alternative routes around obstacles. */
const LOOKAHEAD_RADIUS = 3;

/**
 * Bounded BFS lookahead to find alternative routes when the greedy direct path
 * is blocked or exceeds available movement budget. This prevents oscillation
 * when creatures encounter lakes or other costly terrain.
 *
 * Returns the best alternative position reachable within the lookahead radius
 * that makes progress toward target and is affordable within budget, or null if none found.
 */
function findAlternativeRoute(
  creature: Creature,
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  world: World,
  budget: number
): { x: number; y: number; cost: number } | null {
  const startDist = distance(startX, startY, targetX, targetY, world.width);
  const visited = new Set<string>();
  const queue: Array<{ x: number; y: number; cost: number; depth: number }> = [];
  const candidates: Array<{ x: number; y: number; cost: number; dist: number }> = [];

  // Start BFS from all neighbors, not the starting position itself
  for (const direction of DIRECTIONS) {
    const nx = wrapCoordinate(startX + direction.dx, world.width);
    const ny = startY + direction.dy;

    if (!isTerrainTraversable(world, nx, ny, creature.traits)) continue;
    const cell = world.getCell(nx, ny);
    if (!isWaterPassable(creature, cell, 1)) continue;

    const biomeCost = terrainMovementCost(cell.biome, creature.traits);
    const cellCost = getTraversalCost(creature, cell, biomeCost);
    if (cellCost <= budget) {
      queue.push({ x: nx, y: ny, cost: cellCost, depth: 1 });
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const posKey = key(current.x, current.y);

    if (visited.has(posKey)) continue;
    visited.add(posKey);

    const dist = distance(current.x, current.y, targetX, targetY, world.width);
    // Candidate is viable if it doesn't increase distance (allows detours at same distance)
    // and doesn't exceed budget
    if (dist <= startDist && current.cost <= budget) {
      candidates.push({ x: current.x, y: current.y, cost: current.cost, dist });
    }

    // Continue BFS only if within depth limit
    if (current.depth < LOOKAHEAD_RADIUS) {
      for (const direction of DIRECTIONS) {
        const nx = wrapCoordinate(current.x + direction.dx, world.width);
        const ny = current.y + direction.dy;
        const neighborKey = key(nx, ny);

        if (visited.has(neighborKey)) continue;
        if (!isTerrainTraversable(world, nx, ny, creature.traits)) continue;

        const cell = world.getCell(nx, ny);
        if (!isWaterPassable(creature, cell, 1)) continue;

        const biomeCost = terrainMovementCost(cell.biome, creature.traits);
        const cellCost = getTraversalCost(creature, cell, biomeCost);
        const totalCost = current.cost + cellCost;

        if (totalCost <= budget) {
          queue.push({ x: nx, y: ny, cost: totalCost, depth: current.depth + 1 });
        }
      }
    }
  }

  if (candidates.length === 0) return null;

  // Sort by distance (closer is better), then cost (cheaper is better),
  // then position (for deterministic tie-breaking)
  candidates.sort((a, b) => a.dist - b.dist || a.cost - b.cost || a.y - b.y || a.x - b.x);
  return candidates[0];
}

/** Return locally connected cells so perception does not select food behind barriers. */
export function reachableTerrainCells(
  world: World,
  originX: number,
  originY: number,
  range: number,
  traits?: Pick<Traits, 'aquaticAffinity' | 'terrainGrip'>
): Set<string> {
  const boundedRange = Math.max(0, Math.min(50, Math.floor(range)));
  const wrappedOriginX = wrapCoordinate(originX, world.width);
  const reachable = new Set<string>([key(wrappedOriginX, originY)]);
  const queue = [{ x: wrappedOriginX, y: originY }];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    for (const direction of DIRECTIONS) {
      const x = wrapCoordinate(current.x + direction.dx, world.width);
      const y = current.y + direction.dy;
      if (
        Math.max(wrappedDistance(x, wrappedOriginX, world.width), Math.abs(y - originY)) > boundedRange ||
        !isTerrainTraversable(world, x, y, traits) || reachable.has(key(x, y))
      ) continue;
      reachable.add(key(x, y));
      queue.push({ x, y });
    }
  }
  return reachable;
}

function distance(x: number, y: number, targetX: number, targetY: number, width: number): number {
  return Math.max(wrappedDistance(targetX, x, width), Math.abs(targetY - y));
}

/** Move greedily through passable neighboring cells with deterministic biome slowdown. */
export function moveAcrossTerrain(
  creature: Creature,
  target: { x: number; y: number },
  world: World
): { x: number; y: number } {
  let x = creature.x;
  let y = creature.y;
  let budget = Math.max(0, creature.traits.speed * metabolicPerformanceMultiplier(creature.traits.metabolism));
  const targetX = wrapCoordinate(target.x, world.width);
  const targetY = Math.max(0, Math.min(world.height - 1, target.y));

  while (budget > 0) {
    const currentDistance = distance(x, y, targetX, targetY, world.width);
    if (currentDistance === 0) break;
    const candidates = DIRECTIONS
      .map((direction) => ({ x: wrapCoordinate(x + direction.dx, world.width), y: y + direction.dy }))
      .filter((candidate) => {
        // Check terrain traversability and water passability
        if (!isTerrainTraversable(world, candidate.x, candidate.y, creature.traits)) return false;
        const cell = world.getCell(candidate.x, candidate.y);
        return isWaterPassable(creature, cell, 1);
      })
      .map((candidate) => {
        const cell = world.getCell(candidate.x, candidate.y);
        const biomeCost = terrainMovementCost(cell.biome, creature.traits);
        // Apply water depth traversal cost on top of biome cost
        const totalCost = getTraversalCost(creature, cell, biomeCost);
        return {
          ...candidate,
          distance: distance(candidate.x, candidate.y, targetX, targetY, world.width),
          directDistance: wrappedDistance(targetX, candidate.x, world.width) + Math.abs(targetY - candidate.y),
          cost: totalCost,
        };
      })
      // Equal-distance steps allow deterministic routing around a shoreline or ridge.
      .filter((candidate) => candidate.distance <= currentDistance)
      .sort((a, b) => a.distance - b.distance || a.directDistance - b.directDistance || a.cost - b.cost || a.y - b.y || a.x - b.x);
    const next = candidates[0];
    if (!next) break;

    if (next.cost > budget) {
      // Cost exceeds budget: try lookahead to find alternative route around obstacle
      const alternative = findAlternativeRoute(creature, x, y, targetX, targetY, world, budget);
      if (alternative) {
        x = alternative.x;
        y = alternative.y;
        budget -= alternative.cost;
      } else {
        // No alternative found: slow terrain remains crossable at a reduced rate.
        // Allow crossing only on deterministic cadence based on age.
        const excessCost = Math.max(0.01, next.cost - creature.traits.speed);
        const delayPeriod = Math.max(2, Math.round(1 / excessCost));
        if (creature.age % delayPeriod === 0) {
          break; // On favorable tick, stop without moving
        }
        // On unfavorable tick, move (accepting negative budget)
        x = next.x;
        y = next.y;
        budget -= next.cost;
      }
    } else {
      x = next.x;
      y = next.y;
      budget -= next.cost;
    }
  }
  return { x, y };
}
