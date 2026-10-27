import { reachableTerrainCells } from './biomeTraversal';
import { getCellEnvironmentalStress } from './biomeStress';
import type { Creature } from './creature';
import type { CreatureSpatialIndex } from './creatureSpatialIndex';
import {
  measureLocalResourcePressureAt,
  type LocalResourcePressure,
} from './localResourcePressure';
import type { World } from './world';
import type { SeasonConfig } from './seasons';
import { BP_ONE } from './seasonCurves';
import { seasonalMigrationBias, type SeasonalSignalsAt } from './seasonResponses';

/** Two deterministic 500-creature ticks under parallel test-suite contention. */
export const DISPERSAL_500_CREATURE_BUDGET_MS = 10_000;

export interface DispersalPolicy {
  pressureStart: number;
  evaluationIntervalTicks: number;
  range: number;
  pressureRadius: number;
  minimumPressureImprovement: number;
}

export interface DispersalTarget {
  x: number;
  y: number;
  pressure: number;
  pressureImprovement: number;
  habitatCost: number;
}

/** Stable per-creature phase spreads destination searches across the interval. */
export function dispersalEvaluationPhase(creatureId: string, interval: number): number {
  let hash = 2166136261;
  for (let index = 0; index < creatureId.length; index++) {
    hash ^= creatureId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % Math.max(1, Math.floor(interval));
}

const DIRECTIONS = [
  { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 },
  { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 },
] as const;

function candidateCoordinates(creature: Creature, world: World, range: number) {
  const distance = Math.max(2, Math.floor(range));
  const distances = [...new Set([Math.max(2, Math.floor(distance / 2)), distance])];
  const seen = new Set<string>();
  return distances.flatMap((candidateDistance) => DIRECTIONS.map((direction) => ({
    x: Math.max(0, Math.min(world.width - 1, creature.x + direction.x * candidateDistance)),
    y: Math.max(0, Math.min(world.height - 1, creature.y + direction.y * candidateDistance)),
  }))).filter((candidate) => {
    const key = `${candidate.x},${candidate.y}`;
    if (seen.has(key) || (candidate.x === creature.x && candidate.y === creature.y)) return false;
    seen.add(key);
    return true;
  });
}

export function shouldEvaluateDispersal(
  creature: Creature,
  tick: number,
  currentPressure: number,
  policy: DispersalPolicy
): boolean {
  const interval = Math.max(1, Math.floor(policy.evaluationIntervalTicks));
  return creature.lifecycleState === 'alive'
    && currentPressure >= Math.max(0, Math.min(1, policy.pressureStart))
    && tick % interval === dispersalEvaluationPhase(creature.id, interval);
}

/**
 * Optional seasonal migration bias (#354). When supplied and the creature's own cell is
 * cold-stressed, candidate cells that are warmer than the current cell gain score. When absent
 * or disabled, selection is exactly the pre-season ordering.
 */
export interface DispersalSeasonalBias {
  signalsAt: SeasonalSignalsAt;
  cfg: SeasonConfig;
}

/** Score weight per unit of warmth gained (BP difference / BP_ONE). Tunable; proposal default. */
export const MIGRATION_WARMTH_WEIGHT = 1;

/** Select from at most sixteen stable destinations; no RNG or world mutation. */
export function findDispersalTarget(
  creature: Creature,
  world: World,
  spatialIndex: CreatureSpatialIndex,
  currentPressure: LocalResourcePressure,
  policy: DispersalPolicy,
  seasonal?: DispersalSeasonalBias
): DispersalTarget | null {
  const range = Math.max(2, Math.min(50, Math.floor(policy.range)));
  const reachable = reachableTerrainCells(world, creature.x, creature.y, range, creature.traits);
  const currentCell = world.getCell(creature.x, creature.y);
  const currentHabitatCost = getCellEnvironmentalStress(creature.traits, currentCell, false).totalCost;
  const seasonalSignal = seasonal
    ? seasonal.signalsAt(creature.x, creature.y, currentCell)
    : null;
  const migrationBias = seasonal && seasonalSignal
    ? seasonalMigrationBias(seasonalSignal.seasonalTempBP, seasonal.cfg)
    : 0;
  const candidates = candidateCoordinates(creature, world, range)
    .filter((candidate) => reachable.has(`${candidate.x},${candidate.y}`))
    .map((candidate) => {
      const pressure = measureLocalResourcePressureAt(
        creature,
        candidate.x,
        candidate.y,
        world,
        spatialIndex,
        policy.pressureRadius
      ).pressure;
      const habitatCost = getCellEnvironmentalStress(
        creature.traits,
        world.getCell(candidate.x, candidate.y),
        false
      ).totalCost;
      const warmthGain = migrationBias > 0 && seasonal
        ? (seasonal.signalsAt(candidate.x, candidate.y, world.getCell(candidate.x, candidate.y)).seasonalTempBP
          - seasonalSignal!.seasonalTempBP) / BP_ONE
        : 0;
      const score = migrationBias > 0
        ? (currentPressure.pressure - pressure) + migrationBias * MIGRATION_WARMTH_WEIGHT * warmthGain
        : currentPressure.pressure - pressure;
      return {
        ...candidate,
        pressure,
        pressureImprovement: currentPressure.pressure - pressure,
        habitatCost,
        score,
      };
    })
    .filter((candidate) =>
      candidate.pressureImprovement >= Math.max(0, policy.minimumPressureImprovement)
      && candidate.habitatCost <= currentHabitatCost + 0.1
    )
    .sort((a, b) =>
      b.score - a.score
      || b.pressureImprovement - a.pressureImprovement
      || a.habitatCost - b.habitatCost
      || a.y - b.y
      || a.x - b.x
    );
  return candidates[0] ?? null;
}
