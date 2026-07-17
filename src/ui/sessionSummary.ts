import type { EventSnapshot, WorldSnapshot } from '../state/store';

export interface SessionSummary {
  ticksSurvived: number;
  births: number;
  deaths: number;
  mutations: number;
  extinctions: number;
  interventions: number;
  speciesObserved: number;
  remainingBiomass: number;
  finalEvents: EventSnapshot[];
}

export function hasLivingCreatures(worldState: WorldSnapshot | null): boolean {
  return worldState?.creatures.some((creature) => creature.lifecycleState === 'alive') ?? false;
}

export function buildSessionSummary(
  worldState: WorldSnapshot,
  tick: number,
  timelineLength: number = 8
): SessionSummary {
  const species = new Set<string>();
  for (const creature of worldState.creatures) species.add(creature.speciesId);
  for (const event of worldState.events) {
    if (event.speciesId) species.add(event.speciesId);
  }

  return {
    ticksSurvived: tick,
    births: worldState.events.filter((event) => event.type === 'birth').length,
    deaths: worldState.events.filter((event) => event.type === 'death').length,
    mutations: worldState.events.filter((event) => event.type === 'mutation').length,
    extinctions: worldState.events.filter((event) => event.type === 'extinction').length,
    interventions: worldState.events.filter((event) => event.type === 'intervention').length,
    speciesObserved: species.size,
    remainingBiomass: worldState.cells.reduce(
      (total, cell) => total + cell.producerBiomass,
      0
    ),
    finalEvents: worldState.events.slice(-Math.max(0, timelineLength)).reverse(),
  };
}
