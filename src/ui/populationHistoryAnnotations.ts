import type { EcosystemHistorySample } from '../simulation/ecosystemHistory';
import { speciesDisplayName } from '../simulation/speciesNames';
import type { EventSnapshot } from '../state/store';
import { buildEventStories } from './eventTimelineModel';

export type PopulationAnnotationTone = 'population' | 'extinction' | 'evolution' | 'dominance' | 'intervention';

export interface PopulationHistoryAnnotation {
  id: string;
  tick: number;
  tone: PopulationAnnotationTone;
  title: string;
  detail: string;
}

interface Candidate extends PopulationHistoryAnnotation {
  priority: number;
}

function eventCandidates(events: EventSnapshot[]): Candidate[] {
  return events.flatMap((event, index) => {
    if (!['extinction', 'mutation', 'intervention'].includes(event.type)) return [];
    const story = buildEventStories([event], 1)[0];
    if (!story) return [];
    const tone = event.type === 'extinction'
      ? 'extinction'
      : event.type === 'mutation' ? 'evolution' : 'intervention';
    return [{
      id: `event:${event.tick}:${event.type}:${event.speciesId ?? index}`,
      tick: event.tick,
      tone,
      title: story.title,
      detail: story.detail,
      priority: event.type === 'extinction' ? 100 : event.type === 'intervention' ? 90 : 70,
    } satisfies Candidate];
  });
}

function historyCandidates(history: EcosystemHistorySample[]): Candidate[] {
  const candidates: Candidate[] = [];
  let priorDominant: string | null = null;
  for (let index = 1; index < history.length; index++) {
    const previous = history[index - 1];
    const sample = history[index];
    const change = sample.population - previous.population;
    const threshold = Math.max(5, Math.ceil(previous.population * 0.35));
    if (Math.abs(change) >= threshold) {
      const rising = change > 0;
      candidates.push({
        id: `population:${sample.tick}`,
        tick: sample.tick,
        tone: 'population',
        title: rising ? 'Population surged' : 'Population contracted',
        detail: `Living population changed from ${previous.population.toLocaleString()} to ${sample.population.toLocaleString()}.`,
        priority: 50 + Math.min(15, Math.round(Math.abs(change) / Math.max(1, previous.population) * 10)),
      });
    }
    const dominant = [...sample.speciesPopulations]
      .sort((a, b) => b.population - a.population || a.speciesId.localeCompare(b.speciesId))[0];
    const dominantId = dominant && sample.population > 0 && dominant.population / sample.population >= 0.65
      ? dominant.speciesId
      : null;
    if (dominantId && dominantId !== priorDominant) {
      candidates.push({
        id: `dominance:${sample.tick}:${dominantId}`,
        tick: sample.tick,
        tone: 'dominance',
        title: `${speciesDisplayName(dominantId)} became dominant`,
        detail: `${dominant!.population.toLocaleString()} of ${sample.population.toLocaleString()} living creatures belonged to this species.`,
        priority: 60,
      });
    }
    priorDominant = dominantId;
  }
  return candidates;
}

/** Select a bounded, deterministic set of important, spatially separated annotations. */
export function buildPopulationHistoryAnnotations(
  history: EcosystemHistorySample[],
  events: EventSnapshot[],
  finalTick: number,
  limit = 12
): PopulationHistoryAnnotation[] {
  const minimumGap = Math.max(1, Math.floor(finalTick / 24));
  const candidates = [...eventCandidates(events), ...historyCandidates(history)]
    .sort((a, b) => b.priority - a.priority || a.tick - b.tick || a.id.localeCompare(b.id));
  const selected: Candidate[] = [];
  for (const candidate of candidates) {
    if (selected.length >= Math.max(0, limit)) break;
    if (selected.some((item) => Math.abs(item.tick - candidate.tick) < minimumGap)) continue;
    selected.push(candidate);
  }
  return selected
    .sort((a, b) => a.tick - b.tick || a.id.localeCompare(b.id))
    .map(({ priority: _priority, ...annotation }) => annotation);
}
