import type { EcosystemHistorySample } from '../simulation/ecosystemHistory';
import type { EventSnapshot, WorldSnapshot } from '../state/store';

export type PointCategory = 'survival' | 'biodiversity' | 'exploration' | 'recovery' | 'stewardship';

export interface PointAward {
  id: string;
  tick: number;
  category: PointCategory;
  points: number;
  detail: string;
}

export interface EcosystemPoints {
  total: number;
  breakdown: Record<PointCategory, number>;
  awards: PointAward[];
  history: { tick: number; total: number }[];
}

function currentSample(world: WorldSnapshot, tick: number): EcosystemHistorySample {
  const living = world.creatures.filter((creature) => creature.lifecycleState === 'alive');
  const species = new Map<string, number>();
  const lineages = new Set<string>();
  for (const creature of living) {
    species.set(creature.speciesId, (species.get(creature.speciesId) ?? 0) + 1);
    lineages.add(`${creature.speciesId}:${creature.lineageId}`);
  }
  return {
    tick,
    population: living.length,
    speciesPopulations: [...species].map(([speciesId, population]) => ({ speciesId, population })),
    lineageCount: lineages.size,
    births: 0,
    deaths: 0,
    mutations: 0,
  };
}

function interventionAwards(
  events: EventSnapshot[],
  samples: EcosystemHistorySample[]
): PointAward[] {
  const interventions = events.filter(
    (event) => event.type === 'intervention' && event.ecosystemBefore
  );
  return interventions.flatMap((event, index) => {
    const nextInterventionTick = interventions[index + 1]?.tick ?? Infinity;
    const outcome = samples.find(
      (sample) => sample.tick >= event.tick + 20 && sample.tick < nextInterventionTick
    );
    if (!outcome) return [];
    const before = event.ecosystemBefore!;
    const populationThreshold = Math.max(3, Math.ceil(before.population * 0.2));
    const evidence = outcome.speciesPopulations.length > before.speciesCount
      ? 'species variety increased'
      : outcome.lineageCount > before.lineageCount
        ? 'lineage variety increased'
        : outcome.population >= before.population + populationThreshold
          ? 'population expanded'
          : null;
    if (!evidence) return [];
    return [{
      id: `stewardship:${event.tick}:${index}`,
      tick: outcome.tick,
      category: 'stewardship' as const,
      points: 25,
      detail: `Measured 20+ ticks after intervention: ${evidence}.`,
    }];
  });
}

/** Derive open-ended points from unique recorded evidence; recalculation cannot duplicate awards. */
export function buildEcosystemPoints(world: WorldSnapshot | null, tick: number): EcosystemPoints {
  const emptyBreakdown: EcosystemPoints['breakdown'] = {
    survival: 0, biodiversity: 0, exploration: 0, recovery: 0, stewardship: 0,
  };
  if (!world) return { total: 0, breakdown: emptyBreakdown, awards: [], history: [] };
  const samples = [...(world.history ?? [])].sort((a, b) => a.tick - b.tick);
  const endpoint = currentSample(world, tick);
  const endpointIndex = samples.findIndex((sample) => sample.tick === tick);
  if (endpointIndex >= 0) samples[endpointIndex] = endpoint;
  else samples.push(endpoint);

  const awards: PointAward[] = [];
  for (let index = 1; index < samples.length; index++) {
    const previous = samples[index - 1];
    const sample = samples[index];
    const units = Math.floor((sample.tick - previous.tick) / 10);
    if (units <= 0 || sample.population <= 0) continue;
    awards.push({
      id: `survival:${previous.tick}:${sample.tick}`,
      tick: sample.tick,
      category: 'survival',
      points: units,
      detail: `${sample.tick - previous.tick} ticks of continuing life.`,
    });
    const speciesCount = sample.speciesPopulations.length;
    const dominant = Math.max(0, ...sample.speciesPopulations.map((item) => item.population));
    const dominantShare = sample.population > 0 ? dominant / sample.population : 1;
    if (speciesCount >= 2 && dominantShare < 0.85) {
      const points = units * Math.min(4, speciesCount - 1);
      awards.push({
        id: `biodiversity:${previous.tick}:${sample.tick}`,
        tick: sample.tick,
        category: 'biodiversity',
        points,
        detail: `${speciesCount} species shared the ecosystem without a near monopoly.`,
      });
    }
  }

  const mutationIds = new Set<string>();
  for (let index = 0; index < world.events.length; index++) {
    const event = world.events[index];
    if (event.type !== 'mutation') continue;
    const id = event.lineageId ?? event.creatureId ?? `${event.tick}:${event.speciesId ?? index}`;
    if (mutationIds.has(id)) continue;
    mutationIds.add(id);
    const strategyShift = event.traitChanges?.some((change) => change.trait === 'energyStrategy');
    awards.push({
      id: `exploration:${id}`,
      tick: event.tick,
      category: 'exploration',
      points: strategyShift ? 35 : 20,
      detail: strategyShift ? 'A lineage explored a new ecological strategy.' : 'A distinct lineage branch emerged.',
    });
  }

  let runningPeak = samples[0]?.population ?? 0;
  let trough: EcosystemHistorySample | null = null;
  for (const sample of samples.slice(1)) {
    if (sample.population > runningPeak) runningPeak = sample.population;
    if (runningPeak > 0 && sample.population <= runningPeak * 0.65) {
      if (!trough || sample.population < trough.population) trough = sample;
    }
    if (trough && sample.population >= runningPeak * 0.85 && sample.population >= trough.population + 3) {
      awards.push({
        id: `recovery:${trough.tick}:${sample.tick}`,
        tick: sample.tick,
        category: 'recovery',
        points: 40,
        detail: `Population recovered from ${trough.population} to ${sample.population}.`,
      });
      runningPeak = sample.population;
      trough = null;
    }
  }
  awards.push(...interventionAwards(world.events, samples));

  awards.sort((a, b) => a.tick - b.tick || a.id.localeCompare(b.id));
  const breakdown = { ...emptyBreakdown };
  const history: EcosystemPoints['history'] = [];
  let total = 0;
  for (const award of awards) {
    breakdown[award.category] += award.points;
    total += award.points;
    if (history[history.length - 1]?.tick === award.tick) history[history.length - 1].total = total;
    else history.push({ tick: award.tick, total });
  }
  return { total, breakdown, awards, history };
}
