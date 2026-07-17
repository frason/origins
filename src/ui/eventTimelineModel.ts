import type { EventSnapshot } from '../state/store';
import { speciesDisplayName } from '../simulation/speciesNames';

export type StoryTone = 'growth' | 'loss' | 'evolution' | 'extinction';

export interface EventStory {
  id: string;
  tick: number;
  tone: StoryTone;
  title: string;
  detail: string;
}

export interface PopulationTrend {
  label: 'Quiet' | 'Growing' | 'Declining' | 'Recovering' | 'Turning over';
  births: number;
  deaths: number;
  explanation: string;
}

interface GroupedEvent {
  event: EventSnapshot;
  count: number;
  sequence: number;
}

function displaySpecies(speciesId?: string): string {
  return speciesId ? speciesDisplayName(speciesId) : 'Unknown species';
}

/** Group noisy population events without changing the engine's append-only event history. */
export function buildEventStories(
  events: EventSnapshot[],
  limit: number = 8
): EventStory[] {
  const grouped = new Map<string, GroupedEvent>();

  events.forEach((event, sequence) => {
    const unique = event.type === 'mutation' || event.type === 'extinction';
    const key = unique
      ? `${event.tick}|${event.type}|${event.speciesId ?? ''}|${event.creatureId ?? sequence}`
      : `${event.tick}|${event.type}|${event.speciesId ?? ''}`;
    const existing = grouped.get(key);
    if (existing) existing.count++;
    else grouped.set(key, { event, count: 1, sequence });
  });

  return [...grouped.values()]
    .sort((a, b) => b.event.tick - a.event.tick || b.sequence - a.sequence)
    .slice(0, Math.max(0, limit))
    .map(({ event, count, sequence }) => {
      const species = displaySpecies(event.speciesId);
      if (event.type === 'birth') {
        return {
          id: `${event.tick}-birth-${event.speciesId ?? sequence}`,
          tick: event.tick,
          tone: 'growth',
          title: `${species} expanded`,
          detail: `${count} ${count === 1 ? 'birth' : 'births'} recorded`,
        };
      }
      if (event.type === 'death') {
        return {
          id: `${event.tick}-death-${event.speciesId ?? sequence}`,
          tick: event.tick,
          tone: 'loss',
          title: `${species} declined`,
          detail: `${count} ${count === 1 ? 'death' : 'deaths'} recorded`,
        };
      }
      if (event.type === 'mutation') {
        return {
          id: `${event.tick}-mutation-${event.creatureId ?? sequence}`,
          tick: event.tick,
          tone: 'evolution',
          title: 'A new lineage emerged',
          detail: event.detail ?? `${species} developed a new variation`,
        };
      }
      return {
        id: `${event.tick}-extinction-${event.speciesId ?? sequence}`,
        tick: event.tick,
        tone: 'extinction',
        title: `${species} went extinct`,
        detail: 'No living members of this species remain',
      };
    });
}

function netPopulation(events: EventSnapshot[]): number {
  return events.reduce((net, event) => {
    if (event.type === 'birth') return net + 1;
    if (event.type === 'death') return net - 1;
    return net;
  }, 0);
}

/** Compare the latest 25 ticks with the preceding 25 to reveal recovery, not just totals. */
export function getPopulationTrend(
  events: EventSnapshot[],
  tick: number
): PopulationTrend {
  const currentStart = Math.max(0, tick - 25);
  const priorStart = Math.max(0, tick - 50);
  const current = events.filter((event) => event.tick >= currentStart);
  const prior = events.filter(
    (event) => event.tick >= priorStart && event.tick < currentStart
  );
  const births = current.filter((event) => event.type === 'birth').length;
  const deaths = current.filter((event) => event.type === 'death').length;
  const currentNet = netPopulation(current);
  const priorNet = netPopulation(prior);

  let label: PopulationTrend['label'];
  if (births === 0 && deaths === 0) label = 'Quiet';
  else if (currentNet > 0 && priorNet < 0) label = 'Recovering';
  else if (currentNet > 0) label = 'Growing';
  else if (currentNet < 0) label = 'Declining';
  else label = 'Turning over';

  return {
    label,
    births,
    deaths,
    explanation: `${births} births and ${deaths} deaths in the last ${Math.min(25, Math.max(1, tick))} ticks`,
  };
}
