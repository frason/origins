import type { EcosystemHistorySample } from '../simulation/ecosystemHistory';
import type { EventSnapshot, WorldSnapshot } from '../state/store';

export type TrajectoryDirection = 'rising' | 'falling' | 'steady' | 'emerging';

export interface DynamicsTrajectory {
  direction: TrajectoryDirection;
  label: string;
  explanation: string;
}

export interface EcosystemTrajectories {
  order: DynamicsTrajectory;
  chaos: DynamicsTrajectory;
  exploration: DynamicsTrajectory;
}

const COMPARISON_TICKS = 50;

function baselineAt(
  history: EcosystemHistorySample[] | undefined,
  targetTick: number
): EcosystemHistorySample | undefined {
  if (!history) return undefined;
  for (let index = history.length - 1; index >= 0; index--) {
    if (history[index].tick <= targetTick) return history[index];
  }
  return undefined;
}

function eventActivity(events: EventSnapshot[], start: number, end: number) {
  let turnover = 0;
  let mutations = 0;
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event.tick < start) break;
    if (event.tick >= end) continue;
    if (event.type === 'birth' || event.type === 'death') turnover++;
    else if (event.type === 'extinction') turnover += 3;
    else if (event.type === 'mutation') mutations++;
  }
  return { turnover, mutations };
}

function emerging(label: string, explanation: string): DynamicsTrajectory {
  return { direction: 'emerging', label, explanation };
}

/** Describe change without treating a rising score as an automatic improvement. */
export function getEcosystemTrajectories(
  world: WorldSnapshot | null,
  tick: number
): EcosystemTrajectories {
  if (!world || tick < COMPARISON_TICKS) {
    const early = emerging(
      'Taking shape',
      `A comparison needs ${COMPARISON_TICKS} ticks of world history.`
    );
    return { order: early, chaos: early, exploration: early };
  }

  const baseline = baselineAt(world.history, tick - COMPARISON_TICKS);
  if (!baseline) {
    const unavailable = emerging(
      'History forming',
      'No earlier ecosystem sample is available for a reliable comparison yet.'
    );
    return { order: unavailable, chaos: unavailable, exploration: unavailable };
  }

  const living = world.creatures.filter((creature) => creature.lifecycleState === 'alive');
  const currentSpecies = new Map<string, number>();
  const currentLineages = new Set<string>();
  for (const creature of living) {
    currentSpecies.set(creature.speciesId, (currentSpecies.get(creature.speciesId) ?? 0) + 1);
    currentLineages.add(`${creature.speciesId}:${creature.lineageId}`);
  }
  const dominantShare = living.length > 0
    ? Math.max(0, ...currentSpecies.values()) / living.length
    : 1;
  const baselineDominant = Math.max(0, ...baseline.speciesPopulations.map((item) => item.population));
  const baselineShare = baseline.population > 0 ? baselineDominant / baseline.population : 1;
  const populationRatio = baseline.population > 0 ? living.length / baseline.population : 0;
  const speciesDelta = currentSpecies.size - baseline.speciesPopulations.length;

  let order: DynamicsTrajectory;
  if (living.length === 0 || populationRatio < 0.7 || speciesDelta < 0) {
    order = {
      direction: 'falling', label: 'Contracting',
      explanation: `Population changed from ${baseline.population} to ${living.length}; species changed by ${speciesDelta}.`,
    };
  } else if (dominantShare >= baselineShare + 0.15) {
    order = {
      direction: 'falling', label: 'Concentrating',
      explanation: `The largest species grew from ${Math.round(baselineShare * 100)}% to ${Math.round(dominantShare * 100)}% of life.`,
    };
  } else if (speciesDelta > 0 || dominantShare <= baselineShare - 0.15) {
    order = {
      direction: 'rising', label: 'Balancing',
      explanation: `Species changed by +${speciesDelta}; largest share moved from ${Math.round(baselineShare * 100)}% to ${Math.round(dominantShare * 100)}%.`,
    };
  } else {
    order = {
      direction: 'steady', label: 'Holding',
      explanation: `Population and species balance are close to their state at tick ${baseline.tick}.`,
    };
  }

  const currentStart = tick - COMPARISON_TICKS;
  const priorStart = tick - COMPARISON_TICKS * 2;
  const current = eventActivity(world.events, currentStart, tick + 1);
  const prior = eventActivity(world.events, priorStart, currentStart);
  const activityDifference = current.turnover - prior.turnover;
  const chaos: DynamicsTrajectory = Math.abs(activityDifference) < 2
    ? {
        direction: 'steady', label: 'Holding',
        explanation: `${current.turnover} weighted turnover events recently versus ${prior.turnover} before.`,
      }
    : activityDifference > 0
      ? {
          direction: 'rising', label: 'Intensifying',
          explanation: `Weighted turnover rose from ${prior.turnover} to ${current.turnover}; more chaos is not always healthier.`,
        }
      : {
          direction: 'falling', label: 'Easing',
          explanation: `Weighted turnover fell from ${prior.turnover} to ${current.turnover}.`,
        };

  const lineageDelta = currentLineages.size - baseline.lineageCount;
  const exploration: DynamicsTrajectory = lineageDelta > 0 || current.mutations > prior.mutations
    ? {
        direction: 'rising', label: 'Branching',
        explanation: `${current.mutations} recent mutations; active lineages changed by ${lineageDelta >= 0 ? '+' : ''}${lineageDelta}.`,
      }
    : lineageDelta < 0 || (current.mutations === 0 && prior.mutations > 0)
      ? {
          direction: 'falling', label: 'Quieting',
          explanation: `${current.mutations} recent mutations; active lineages changed by ${lineageDelta}.`,
        }
      : {
          direction: 'steady', label: 'Continuing',
          explanation: `${current.mutations} recent mutations and no net lineage change.`,
        };

  return { order, chaos, exploration };
}
