import type { EcosystemHistorySample } from '../simulation/ecosystemHistory';
import { speciesDisplayName } from '../simulation/speciesNames';
import type { WorldSnapshot, EventSnapshot, CreatureSnapshot } from '../state/store';
import { getLiveEventTotals } from './liveEventMetrics';

// Maximum number of events to scan for timeline rendering to prevent unbounded scaling
const MAX_EVENTS_TO_SCAN = 5000;

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
  type: 'birth' | 'death' | 'mutation' | 'speciation' | 'extinction' | 'intervention' | 'environmental-shock';
  speciesName: string;
  detail: string;
  // Navigation aids
  creatureId?: string;
  lineageId?: string;
  tileX?: number;
  tileY?: number;
  // Region information (derived from coordinates)
  region?: 'NW' | 'NE' | 'SW' | 'SE' | 'center';
}

export interface InterventionWindow {
  startTick: number;
  endTick: number;
  startX: number;
  endX: number;
  kind: 'species-introduction' | 'settings-change';
  // Before/after comparison metrics
  beforePopulation?: number;
  afterPopulation?: number;
  beforeSpecies?: number;
  afterSpecies?: number;
  populationDelta?: number;
  speciesDelta?: number;
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
  // Enhanced timeline fields
  eventPins: EventPin[];
  interventionWindows: InterventionWindow[];
  xAxisScale: AxisScale;
  yAxisScale: AxisScale;
  lastTick: number;
  allSpeciesIds: Set<string>;
  allLineageIds: Set<string>;
  // Filter support
  allLineageLabels: Map<string, string>;
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

/** Determine grid region from coordinates (100x100 grid). */
function getGridRegion(x?: number, y?: number): 'NW' | 'NE' | 'SW' | 'SE' | 'center' | undefined {
  if (x === undefined || y === undefined) return undefined;
  const centerX = 50, centerY = 50, tolerance = 15;
  if (x < centerX - tolerance && y < centerY - tolerance) return 'NW';
  if (x > centerX + tolerance && y < centerY - tolerance) return 'NE';
  if (x < centerX - tolerance && y > centerY + tolerance) return 'SW';
  if (x > centerX + tolerance && y > centerY + tolerance) return 'SE';
  return 'center';
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
  let type: EventPin['type'] = 'birth';
  let region: EventPin['region'];

  if (event.type === 'birth') {
    detail = `${speciesName} birth`;
    type = 'birth';
    region = getGridRegion((event as any).affectedRegion?.x, (event as any).affectedRegion?.y);
  } else if (event.type === 'death') {
    detail = `${speciesName} death (${event.deathCause ?? 'unknown'})`;
    type = 'death';
    region = getGridRegion((event as any).affectedRegion?.x, (event as any).affectedRegion?.y);
  } else if (event.type === 'mutation') {
    detail = `${speciesName} mutation`;
    type = 'mutation';
    region = getGridRegion((event as any).affectedRegion?.x, (event as any).affectedRegion?.y);
  } else if (event.type === 'speciation') {
    detail = `${speciesName} speciation`;
    type = 'speciation';
    region = getGridRegion((event as any).affectedRegion?.x, (event as any).affectedRegion?.y);
  } else if (event.type === 'extinction') {
    detail = `${speciesName} extinction`;
    type = 'extinction';
    region = getGridRegion((event as any).affectedRegion?.x, (event as any).affectedRegion?.y);
  } else if (event.type === 'intervention') {
    detail = event.interventionKind === 'species-introduction'
      ? `Introduced ${speciesName}`
      : `Settings changed`;
    type = 'intervention';
    region = getGridRegion(event.interventionOrigin?.x, event.interventionOrigin?.y);
  } else if (event.type === 'environmental-shock') {
    const shockKind = (event as any).shockKind ?? 'unknown';
    detail = `Environmental shock: ${shockKind}`;
    type = 'environmental-shock';
    region = getGridRegion((event as any).affectedRegion?.x, (event as any).affectedRegion?.y);
  } else {
    return null;
  }

  // Determine tileX/tileY from either interventionOrigin or affectedRegion
  const tileX = event.interventionOrigin?.x ?? (event as any).affectedRegion?.x;
  const tileY = event.interventionOrigin?.y ?? (event as any).affectedRegion?.y;

  return {
    id: `${event.tick}-${event.type}-${event.speciesId ?? 'unknown'}`,
    tick: event.tick,
    x,
    event,
    type,
    speciesName,
    detail,
    creatureId: event.creatureId,
    lineageId: event.lineageId,
    tileX,
    tileY,
    region,
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

  // Build event pins with bounded scanning
  const eventPins: EventPin[] = [];
  const allSpeciesIds = new Set<string>();
  const allLineageIds = new Set<string>();
  const allLineageLabels = new Map<string, string>();

  for (const point of points) {
    for (const species of point.speciesPopulations) {
      allSpeciesIds.add(species.speciesId);
    }
  }

  // Gather all lineage IDs from creatures
  for (const creature of world.creatures) {
    const lineageId = `${creature.speciesId}:${creature.lineageId}`;
    allLineageIds.add(lineageId);
    allLineageLabels.set(lineageId, `${speciesDisplayName(creature.speciesId)}/${creature.lineageId.substring(0, 8)}`);
  }

  // Scan events with cap to prevent unbounded growth
  const eventsToScan = world.events.length > MAX_EVENTS_TO_SCAN
    ? world.events.slice(world.events.length - MAX_EVENTS_TO_SCAN)
    : world.events;

  // Add event pins for all event types (birth, death, mutation, speciation, extinction, intervention)
  for (const event of eventsToScan) {
    const x = (event.tick / lastTick) * 100;
    const pin = createEventPin(event, x, lastTick);
    if (pin) eventPins.push(pin);
  }

  // Helper to get metrics at a specific tick
  const getMetricsAtTick = (targetTick: number) => {
    const point = points.find(p => p.tick === targetTick);
    if (point) {
      return {
        population: point.population,
        species: point.speciesPopulations.length,
      };
    }
    // Find nearest point if exact tick not found
    let nearest = points[0];
    for (const p of points) {
      if (Math.abs(p.tick - targetTick) < Math.abs(nearest.tick - targetTick)) {
        nearest = p;
      }
    }
    return {
      population: nearest.population,
      species: nearest.speciesPopulations.length,
    };
  };

  // Build intervention windows with before/after metrics
  const interventionWindows: InterventionWindow[] = [];
  let interventionStart: EventSnapshot | null = null;
  for (const event of eventsToScan) {
    if (event.type === 'intervention') {
      if (!interventionStart) {
        interventionStart = event;
      }
    } else if (interventionStart) {
      // End of intervention window when we encounter a non-intervention event
      const beforeMetrics = getMetricsAtTick(interventionStart.tick);
      const afterMetrics = getMetricsAtTick(event.tick);
      interventionWindows.push({
        startTick: interventionStart.tick,
        endTick: event.tick,
        startX: (interventionStart.tick / lastTick) * 100,
        endX: (event.tick / lastTick) * 100,
        kind: interventionStart.interventionKind ?? 'settings-change',
        beforePopulation: beforeMetrics.population,
        afterPopulation: afterMetrics.population,
        beforeSpecies: beforeMetrics.species,
        afterSpecies: afterMetrics.species,
        populationDelta: afterMetrics.population - beforeMetrics.population,
        speciesDelta: afterMetrics.species - beforeMetrics.species,
      });
      interventionStart = null;
    }
  }
  // Handle trailing intervention window
  if (interventionStart) {
    const beforeMetrics = getMetricsAtTick(interventionStart.tick);
    const afterMetrics = getMetricsAtTick(tick);
    interventionWindows.push({
      startTick: interventionStart.tick,
      endTick: tick,
      startX: (interventionStart.tick / lastTick) * 100,
      endX: 100,
      kind: interventionStart.interventionKind ?? 'settings-change',
      beforePopulation: beforeMetrics.population,
      afterPopulation: afterMetrics.population,
      beforeSpecies: beforeMetrics.species,
      afterSpecies: afterMetrics.species,
      populationDelta: afterMetrics.population - beforeMetrics.population,
      speciesDelta: afterMetrics.species - beforeMetrics.species,
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
    allLineageIds,
    allLineageLabels,
  };
}
