import type { EcosystemHistorySample } from '../simulation/ecosystemHistory';
import type { EventSnapshot } from '../state/store';

export interface LiveEventTotals {
  births: number;
  deaths: number;
  mutations: number;
}

/** Add only events newer than the latest cumulative history sample. */
export function getLiveEventTotals(
  history: EcosystemHistorySample[] | undefined,
  events: EventSnapshot[]
): LiveEventTotals {
  const baseline = history?.[history.length - 1];
  const totals: LiveEventTotals = {
    births: baseline?.births ?? 0,
    deaths: baseline?.deaths ?? 0,
    mutations: baseline?.mutations ?? 0,
  };
  const startTick = baseline?.tick ?? Number.NEGATIVE_INFINITY;
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event.tick < startTick) break;
    if (event.type === 'birth') totals.births++;
    else if (event.type === 'death') totals.deaths++;
    else if (event.type === 'mutation') totals.mutations++;
  }
  return totals;
}
