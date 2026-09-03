import type { EcosystemHistorySample } from '../simulation/ecosystemHistory';
import { speciesDisplayName } from '../simulation/speciesNames';
import type { WorldSnapshot, EventSnapshot } from '../state/store';
import { getLiveEventTotals } from './liveEventMetrics';

export interface EvolutionTimelinePoint extends EcosystemHistorySample {
  speciesCount: number;
  dominantSpeciesId: string | null;
  x: number;
  populationY: number;
  speciesY: number;
  lineageY: number;
}

export interface EventPin {
  id: string;
  tick: number;
  x: number;
  event: EventSnapshot;
  type: 'birth' | 'death' | 'mutation' | 'speciation' | 'extinction' | 'intervention';
  speciesName: string;
  detail: string;
}

export interface InterventionWindow {
  startTick: number;
  endTick: number;
  startX: number;
  endX: number;
  kind: 'species-introduction' | 'settings-change';
}

export interface AxisScale {
  min: number;
  max: number;
  ticks: number[];
  labels: string[];
}

export interface EvolutionTimelineModel {
  points: EvolutionTimelinePoint[];
  populationPolyline: string;
  speciesPolyline: string;
  lineagePolyline: string;
  peakPopulation: number;
  dominanceChanges: number;
  dominanceMoments: EvolutionDominanceMoment[];
  currentDominantName: string | null;
  description: string;
  // New fields for enhanced timeline
  eventPins: EventPin[];
  interventionWindows: InterventionWindow[];
  xAxisScale: AxisScale;
  yAxisScale: AxisScale;
  lastTick: number;
  allSpeciesIds: Set<string>;
}

export interface EvolutionDominanceMoment {
  tick: number;
  x: number;
  speciesId: string;
  speciesName: string;
}

function dominantSpecies(sample: EcosystemHistorySample): string | null {
  let dominant: string | null = null;
  let count = 0;
  for (const species of sample.speciesPopulations) {
    if (species.population > count) {
      dominant = species.speciesId;
      count = species.population;
    }
  }
  return dominant;
}

function generateAxisScale(min: number, max: number, targetTicks: number = 5): AxisScale {
  if (min === max) {
    return { min, max, ticks: [min], labels: [String(min)] };
  }

  const range = max - min;
  const magnitude = Math.pow(10, Math.floor(Math.log10(range)));
  const normalized = range / magnitude;

  let step = magnitude;
  if (normalized < 2) step = magnitude * 0.2;
  else if (normalized < 5) step = magnitude * 0.5;
  else step = magnitude;

  const ticks: number[] = [];
  let current = Math.ceil(min / step) * step;
  while (current <= max + step * 0.01) {
    if (current >= min) ticks.push(current);
    current += step;
  }

  return {
    min,
    max,
    ticks,
    labels: ticks.map((t) => (t < 1000 ? String(Math.round(t)) : `${(t / 1000).toFixed(1)}k`)),
  };
}

function createEventPin(
  event: EventSnapshot,
  x: number,
  lastTick: number
): EventPin | null {
  const speciesName = event.speciesId ? speciesDisplayName(event.speciesId) : 'Unknown';

  let detail = '';
  if (event.type === 'birth') detail = `${speciesName} birth`;
  else if (event.type === 'death') detail = `${speciesName} death (${event.deathCause ?? 'unknown'})`;
  else if (event.type === 'mutation') detail = `${speciesName} mutation`;
  else if (event.type === 'speciation') detail = `${speciesName} speciation`;
  else if (event.type === 'extinction') detail = `${speciesName} extinction`;
  else if (event.type === 'intervention') {
    detail = event.interventionKind === 'species-introduction'
      ? `Introduced ${speciesName}`
      : `Settings changed`;
  }

  return {
    id: `${event.tick}-${event.type}-${event.speciesId ?? 'unknown'}`,
    tick: event.tick,
    x,
    event,
    type: event.type,
    speciesName,
    detail,
  };
}

function currentSample(
  history: EcosystemHistorySample[] | undefined,
  world: WorldSnapshot,
  tick: number
): EcosystemHistorySample {
  const species = new Map<string, number>();
  const lineages = new Set<string>();
  let population = 0;
  for (const creature of world.creatures) {
    if (creature.lifecycleState !== 'alive') continue;
    population++;
    species.set(creature.speciesId, (species.get(creature.speciesId) ?? 0) + 1);
    lineages.add(`${creature.speciesId}:${creature.lineageId}`);
  }
  const totals = getLiveEventTotals(history, world.events);
  return {
    tick,
    population,
    speciesPopulations: [...species.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([speciesId, count]) => ({ speciesId, population: count })),
    lineageCount: lineages.size,
    ...totals,
  };
}

/** Merge bounded engine history with the current unsampled tick and create chart coordinates. */
export function buildEvolutionTimeline(
  history: EcosystemHistorySample[] | undefined,
  world: WorldSnapshot | null,
  tick: number
): EvolutionTimelineModel | null {
  if (!world) return null;
  const samples = new Map<number, EcosystemHistorySample>();
  for (const sample of history ?? []) samples.set(sample.tick, sample);
  samples.set(tick, currentSample(history, world, tick));
  const ordered = [...samples.values()].sort((a, b) => a.tick - b.tick);
  const lastTick = Math.max(1, ordered[ordered.length - 1]?.tick ?? 1);
  const peakPopulation = Math.max(0, ...ordered.map((sample) => sample.population));
  const maxDiversity = Math.max(
    1,
    ...ordered.map((sample) => Math.max(sample.speciesPopulations.length, sample.lineageCount))
  );
  const populationScale = Math.max(1, peakPopulation);
  const points = ordered.map((sample): EvolutionTimelinePoint => ({
    ...sample,
    speciesCount: sample.speciesPopulations.length,
    dominantSpeciesId: dominantSpecies(sample),
    x: (sample.tick / lastTick) * 100,
    populationY: 92 - (sample.population / populationScale) * 82,
    speciesY: 92 - (sample.speciesPopulations.length / maxDiversity) * 82,
    lineageY: 92 - (sample.lineageCount / maxDiversity) * 82,
  }));
  let dominanceChanges = 0;
  let previousDominant: string | null = null;
  const dominanceMoments: EvolutionDominanceMoment[] = [];
  for (const point of points) {
    if (point.dominantSpeciesId && previousDominant && point.dominantSpeciesId !== previousDominant) {
      dominanceChanges++;
      dominanceMoments.push({
        tick: point.tick,
        x: point.x,
        speciesId: point.dominantSpeciesId,
        speciesName: speciesDisplayName(point.dominantSpeciesId),
      });
    }
    if (point.dominantSpeciesId) previousDominant = point.dominantSpeciesId;
  }
  const currentDominant = points[points.length - 1]?.dominantSpeciesId ?? null;
  const polyline = (key: 'populationY' | 'speciesY' | 'lineageY') =>
    points.map((point) => `${point.x.toFixed(2)},${point[key].toFixed(2)}`).join(' ');
  const currentDominantName = currentDominant ? speciesDisplayName(currentDominant) : null;

  // Build event pins
  const eventPins: EventPin[] = [];
  const allSpeciesIds = new Set<string>();
  for (const point of points) {
    for (const species of point.speciesPopulations) {
      allSpeciesIds.add(species.speciesId);
    }
  }

  // Add events as pins
  for (const event of world.events) {
    if (
      event.type === 'birth' ||
      event.type === 'extinction' ||
      event.type === 'speciation' ||
      event.type === 'intervention'
    ) {
      const x = (event.tick / lastTick) * 100;
      const pin = createEventPin(event, x, lastTick);
      if (pin) eventPins.push(pin);
    }
  }

  // Build intervention windows
  const interventionWindows: InterventionWindow[] = [];
  let interventionStart: EventSnapshot | null = null;
  for (const event of world.events) {
    if (event.type === 'intervention') {
      if (!interventionStart) {
        interventionStart = event;
      }
    } else if (interventionStart) {
      // End of intervention window when we encounter a non-intervention event
      interventionWindows.push({
        startTick: interventionStart.tick,
        endTick: event.tick,
        startX: (interventionStart.tick / lastTick) * 100,
        endX: (event.tick / lastTick) * 100,
        kind: interventionStart.interventionKind ?? 'settings-change',
      });
      interventionStart = null;
    }
  }
  // Handle trailing intervention window
  if (interventionStart) {
    interventionWindows.push({
      startTick: interventionStart.tick,
      endTick: tick,
      startX: (interventionStart.tick / lastTick) * 100,
      endX: 100,
      kind: interventionStart.interventionKind ?? 'settings-change',
    });
  }

  // Generate axis scales
  const xAxisScale = generateAxisScale(0, lastTick, 6);
  const yAxisScale = generateAxisScale(0, peakPopulation, 5);

  return {
    points,
    populationPolyline: polyline('populationY'),
    speciesPolyline: polyline('speciesY'),
    lineagePolyline: polyline('lineageY'),
    peakPopulation,
    dominanceChanges,
    dominanceMoments,
    currentDominantName,
    description: `${points.length} samples through tick ${tick}. Peak population ${peakPopulation}. ${dominanceChanges} dominance ${dominanceChanges === 1 ? 'shift' : 'shifts'}. ${currentDominantName ? `${currentDominantName} currently leads.` : 'No living species currently leads.'}`,
    eventPins,
    interventionWindows,
    xAxisScale,
    yAxisScale,
    lastTick,
    allSpeciesIds,
  };
}
