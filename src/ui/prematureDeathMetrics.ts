import type { EventSnapshot } from '../state/store';

export interface PrematureDeathRate {
  prematureDeaths: number;
  recordedDeaths: number;
  rate: number | null;
}

export interface SpeciesPrematureDeathRate extends PrematureDeathRate {
  speciesId: string;
}

function emptyRate(): PrematureDeathRate {
  return { prematureDeaths: 0, recordedDeaths: 0, rate: null };
}

/** Use durable death evidence; legacy deaths without evidence are not eligible. */
export function getPrematureDeathMetrics(events: EventSnapshot[]): {
  ecosystem: PrematureDeathRate;
  species: SpeciesPrematureDeathRate[];
} {
  const ecosystem = emptyRate();
  const bySpecies = new Map<string, PrematureDeathRate>();

  for (const event of events) {
    if (event.type !== 'death' || typeof event.prematureDeath !== 'boolean') continue;
    ecosystem.recordedDeaths++;
    if (event.prematureDeath) ecosystem.prematureDeaths++;

    if (!event.speciesId) continue;
    const rate = bySpecies.get(event.speciesId) ?? emptyRate();
    rate.recordedDeaths++;
    if (event.prematureDeath) rate.prematureDeaths++;
    bySpecies.set(event.speciesId, rate);
  }

  ecosystem.rate = ecosystem.recordedDeaths > 0
    ? ecosystem.prematureDeaths / ecosystem.recordedDeaths
    : null;
  const species = Array.from(bySpecies, ([speciesId, metric]) => ({
    speciesId,
    ...metric,
    rate: metric.recordedDeaths > 0 ? metric.prematureDeaths / metric.recordedDeaths : null,
  })).sort((a, b) => b.recordedDeaths - a.recordedDeaths || a.speciesId.localeCompare(b.speciesId));

  return { ecosystem, species };
}

export function formatPrematureDeathRate(metric: PrematureDeathRate): string {
  return metric.rate === null
    ? '-'
    : `${Math.round(metric.rate * 100)}% (${metric.prematureDeaths}/${metric.recordedDeaths} deaths)`;
}
