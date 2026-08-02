import type { EventSnapshot } from '../state/store';

export const REPLACEMENT_WINDOW_TICKS = 50;
export const REPLACEMENT_TREND_HORIZON_TICKS = 300;
export const REPLACEMENT_TREND_STEP_TICKS = 10;

export interface ReplacementMetric {
  births: number;
  deaths: number;
  ratio: number | null;
}

export interface SpeciesReplacementMetric extends ReplacementMetric {
  speciesId: string;
}

export interface ReplacementMetrics {
  ecosystem: ReplacementMetric;
  species: SpeciesReplacementMetric[];
  windowTicks: number;
}

export interface ReplacementTrendPoint extends ReplacementMetric {
  tick: number;
  x: number;
  y: number | null;
}

export interface ReplacementTrend {
  points: ReplacementTrendPoint[];
  segments: string[];
  referenceY: number;
  windowTicks: number;
  horizonTicks: number;
  description: string;
}

function emptyMetric(): ReplacementMetric {
  return { births: 0, deaths: 0, ratio: null };
}

function finalize(metric: ReplacementMetric): ReplacementMetric {
  return {
    ...metric,
    ratio: metric.deaths > 0 ? metric.births / metric.deaths : null,
  };
}

/**
 * Count only the bounded tail of the append-only event log. Events are emitted
 * in tick order, so the reverse scan stops as soon as the requested window is
 * exhausted instead of repeatedly scanning the full history.
 */
export function getReplacementMetrics(
  events: EventSnapshot[],
  tick: number,
  windowTicks = REPLACEMENT_WINDOW_TICKS
): ReplacementMetrics {
  const safeWindow = Math.max(1, Math.round(windowTicks));
  const firstTick = Math.max(0, tick - safeWindow + 1);
  const ecosystem = emptyMetric();
  const bySpecies = new Map<string, ReplacementMetric>();

  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event.tick > tick) continue;
    if (event.tick < firstTick) break;
    if (event.type !== 'birth' && event.type !== 'death') continue;

    ecosystem[event.type === 'birth' ? 'births' : 'deaths']++;
    if (!event.speciesId) continue;
    const metric = bySpecies.get(event.speciesId) ?? emptyMetric();
    metric[event.type === 'birth' ? 'births' : 'deaths']++;
    bySpecies.set(event.speciesId, metric);
  }

  return {
    ecosystem: finalize(ecosystem),
    species: Array.from(bySpecies, ([speciesId, metric]) => ({
      speciesId,
      ...finalize(metric),
    })).sort((a, b) =>
      (b.births + b.deaths) - (a.births + a.deaths) || a.speciesId.localeCompare(b.speciesId)
    ),
    windowTicks: safeWindow,
  };
}

export function formatReplacementRatio(
  metric: ReplacementMetric,
  includeEvidence = false
): string {
  if (metric.ratio === null) return '—';
  const ratio = `${metric.ratio.toFixed(2)}×`;
  return includeEvidence
    ? `${ratio} (${metric.births} births / ${metric.deaths} deaths)`
    : ratio;
}

function buildSegments(points: ReplacementTrendPoint[]): string[] {
  const segments: string[] = [];
  let current: string[] = [];
  for (const point of points) {
    if (point.y === null) {
      if (current.length > 0) segments.push(current.join(' '));
      current = [];
      continue;
    }
    current.push(`${point.x.toFixed(2)},${point.y.toFixed(2)}`);
  }
  if (current.length > 0) segments.push(current.join(' '));
  return segments;
}

/** Build a bounded trend. Ratios above 2× are visually capped but remain in titles and metrics. */
export function buildReplacementTrend(
  events: EventSnapshot[],
  tick: number,
  windowTicks = REPLACEMENT_WINDOW_TICKS,
  horizonTicks = REPLACEMENT_TREND_HORIZON_TICKS,
  stepTicks = REPLACEMENT_TREND_STEP_TICKS
): ReplacementTrend {
  const safeHorizon = Math.max(1, Math.round(horizonTicks));
  const safeStep = Math.max(1, Math.round(stepTicks));
  const startTick = Math.max(0, tick - safeHorizon);
  const sampleTicks: number[] = [];
  for (let sampleTick = startTick; sampleTick < tick; sampleTick += safeStep) {
    sampleTicks.push(sampleTick);
  }
  sampleTicks.push(tick);
  const span = Math.max(1, tick - startTick);
  const points = sampleTicks.map((sampleTick): ReplacementTrendPoint => {
    const metric = getReplacementMetrics(events, sampleTick, windowTicks).ecosystem;
    return {
      tick: sampleTick,
      ...metric,
      x: ((sampleTick - startTick) / span) * 100,
      y: metric.ratio === null ? null : 92 - (Math.min(2, metric.ratio) / 2) * 84,
    };
  });

  return {
    points,
    segments: buildSegments(points),
    referenceY: 50,
    windowTicks: Math.max(1, Math.round(windowTicks)),
    horizonTicks: safeHorizon,
    description: `Replacement ratio over the last ${Math.min(safeHorizon, tick)} ticks, calculated from births divided by deaths in a rolling ${Math.max(1, Math.round(windowTicks))}-tick window. The reference line marks replacement level 1.0.`,
  };
}
