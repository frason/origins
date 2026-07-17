import type { EventSnapshot, WorldSnapshot } from '../state/store';
import { buildEventStories, type EventStory } from './eventTimelineModel';

export interface SessionSummary {
  seed: number | null;
  status: 'living' | 'ended';
  ticksSurvived: number;
  currentPopulation: number;
  peakPopulation: number;
  activeSpecies: number;
  activeLineages: number;
  births: number;
  deaths: number;
  mutations: number;
  extinctions: number;
  interventions: number;
  speciesObserved: number;
  remainingBiomass: number;
  finalEvents: EventSnapshot[];
  recentStories: EventStory[];
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
  const activeSpecies = new Set<string>();
  const activeLineages = new Set<string>();
  let currentPopulation = 0;
  for (const creature of worldState.creatures) {
    species.add(creature.speciesId);
    if (creature.lifecycleState !== 'alive') continue;
    currentPopulation++;
    activeSpecies.add(creature.speciesId);
    activeLineages.add(`${creature.speciesId}:${creature.lineageId}`);
  }
  let births = 0;
  let deaths = 0;
  let mutations = 0;
  let extinctions = 0;
  let interventions = 0;
  for (const event of worldState.events) {
    if (event.speciesId) species.add(event.speciesId);
    if (event.type === 'birth') births++;
    else if (event.type === 'death') deaths++;
    else if (event.type === 'mutation') mutations++;
    else if (event.type === 'extinction') extinctions++;
    else if (event.type === 'intervention') interventions++;
  }
  const peakPopulation = Math.max(
    currentPopulation,
    ...(worldState.history ?? []).map((sample) => sample.population)
  );

  return {
    seed: worldState.seed ?? null,
    status: currentPopulation > 0 ? 'living' : 'ended',
    ticksSurvived: tick,
    currentPopulation,
    peakPopulation,
    activeSpecies: activeSpecies.size,
    activeLineages: activeLineages.size,
    births,
    deaths,
    mutations,
    extinctions,
    interventions,
    speciesObserved: species.size,
    remainingBiomass: worldState.cells.reduce(
      (total, cell) => total + cell.producerBiomass,
      0
    ),
    finalEvents: worldState.events.slice(-Math.max(0, timelineLength)).reverse(),
    recentStories: buildEventStories(worldState.events, timelineLength),
  };
}
