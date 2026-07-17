import type { DeathCause } from '../simulation/events';
import type { WorldSnapshot } from '../state/store';
import { MAX_ENERGY_MULTIPLIER, type SimulationConstants } from '../utils/constants';

export type PressureTone = 'critical' | 'warning' | 'watch' | 'calm';

export interface EcosystemPressure {
  id: string;
  tone: PressureTone;
  title: string;
  evidence: string;
  priority: number;
}

const causePresentation: Record<DeathCause, { title: string; tone: PressureTone; priority: number }> = {
  predation: { title: 'Predation is shaping turnover', tone: 'warning', priority: 80 },
  starvation: { title: 'Energy shortage is costing lives', tone: 'critical', priority: 90 },
  age: { title: 'An older generation is passing', tone: 'watch', priority: 45 },
  'monoculture-pressure': { title: 'Monoculture pressure is correcting dominance', tone: 'warning', priority: 75 },
  overcrowding: { title: 'Overcrowding is forcing mortality', tone: 'critical', priority: 95 },
  unknown: { title: 'Unclassified mortality occurred', tone: 'watch', priority: 20 },
};

/** Explain current conditions from measured evidence without asserting exclusive causation. */
export function getEcosystemPressures(
  world: WorldSnapshot | null,
  tick: number,
  constants: SimulationConstants,
  limit = 3
): EcosystemPressure[] {
  if (!world) return [];
  const living = world.creatures.filter((creature) => creature.lifecycleState === 'alive');
  const recentDeaths = world.events.filter(
    (event) => event.type === 'death' && event.tick >= Math.max(0, tick - 25)
  );
  const candidates: EcosystemPressure[] = [];

  if (living.length === 0) {
    candidates.push({
      id: 'collapse', tone: 'critical', priority: 110,
      title: 'The ecosystem has collapsed',
      evidence: 'No living creatures remain',
    });
  }

  const causeCounts = new Map<DeathCause, number>();
  for (const event of recentDeaths) {
    if (!event.deathCause || event.deathCause === 'unknown') continue;
    causeCounts.set(event.deathCause, (causeCounts.get(event.deathCause) ?? 0) + 1);
  }
  for (const [cause, count] of causeCounts) {
    const presentation = causePresentation[cause];
    candidates.push({
      id: `cause:${cause}`,
      ...presentation,
      evidence: `${count} recorded ${count === 1 ? 'death' : 'deaths'} in the last 25 ticks`,
    });
  }

  const capacityShare = living.length / Math.max(1, constants.maxGlobalPopulation);
  if (capacityShare >= 0.9) {
    candidates.push({
      id: 'capacity', tone: capacityShare >= 1 ? 'critical' : 'warning', priority: 85,
      title: 'Population is pressing against capacity',
      evidence: `${living.length} living creatures use ${Math.round(capacityShare * 100)}% of the configured limit`,
    });
  }

  const speciesCounts = new Map<string, number>();
  for (const creature of living) {
    speciesCounts.set(creature.speciesId, (speciesCounts.get(creature.speciesId) ?? 0) + 1);
  }
  const dominantCount = Math.max(0, ...speciesCounts.values());
  const dominantShare = living.length > 0 ? dominantCount / living.length : 0;
  if (living.length >= 3 && dominantShare > constants.monocultureDominanceThreshold) {
    candidates.push({
      id: 'dominance', tone: 'warning', priority: 70,
      title: 'One species is crowding out diversity',
      evidence: `${Math.round(dominantShare * 100)}% of living creatures share one species`,
    });
  }

  const lowEnergy = living.filter((creature) => {
    const capacity = Math.max(200, creature.traits.size * MAX_ENERGY_MULTIPLIER);
    return creature.energy / capacity < 0.3;
  }).length;
  const lowEnergyShare = living.length > 0 ? lowEnergy / living.length : 0;
  if (living.length >= 2 && lowEnergyShare >= 0.35) {
    candidates.push({
      id: 'low-energy', tone: 'warning', priority: 65,
      title: 'Many creatures are running low on energy',
      evidence: `${lowEnergy} of ${living.length} living creatures are below 30% capacity`,
    });
  }

  const toxicCells = world.cells.filter((cell) => cell.toxicity >= 0.5).length;
  const toxicShare = world.cells.length > 0 ? toxicCells / world.cells.length : 0;
  if (toxicCells > 0 && (toxicShare >= 0.02 || toxicCells >= 10)) {
    candidates.push({
      id: 'toxicity', tone: 'watch', priority: 50,
      title: 'Corpse toxicity is leaving ecological scars',
      evidence: `${toxicCells} cells have elevated toxicity`,
    });
  }

  if (candidates.length === 0) {
    candidates.push({
      id: 'mild', tone: 'calm', priority: 0,
      title: 'Current pressures are mild',
      evidence: 'No strong mortality, capacity, energy, dominance, or toxicity signal is present',
    });
  }
  return candidates
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit));
}
