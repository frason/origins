import type { EcosystemCheckpoint, SimEvent } from '../simulation/events';
import type { WorldSnapshot } from '../state/store';

export interface InterventionImpact {
  tick: number;
  ticksSince: number;
  summary: string;
  tone: 'early' | 'positive' | 'warning' | 'neutral';
  populationDelta: number;
  speciesDelta: number;
  lineageDelta: number;
  livingEnergyDelta: number;
  producerBiomassDelta: number;
  births: number;
  deaths: number;
  mutations: number;
  extinctions: number;
  settingsChanged: number;
}

function checkpoint(world: WorldSnapshot): EcosystemCheckpoint {
  const living = world.creatures.filter((creature) => creature.lifecycleState === 'alive');
  return {
    population: living.length,
    speciesCount: new Set(living.map((creature) => creature.speciesId)).size,
    lineageCount: new Set(living.map((creature) => creature.lineageId)).size,
    livingEnergy: living.reduce((total, creature) => total + creature.energy, 0),
    producerBiomass: world.cells.reduce((total, cell) => total + cell.producerBiomass, 0),
  };
}

/** Compare present state with the latest intervention checkpoint; this shows correlation only. */
export function buildInterventionImpact(
  world: WorldSnapshot | null,
  tick: number
): InterventionImpact | null {
  if (!world) return null;
  let interventionIndex = -1;
  let births = 0;
  let deaths = 0;
  let mutations = 0;
  let extinctions = 0;
  for (let index = world.events.length - 1; index >= 0; index--) {
    const event = world.events[index];
    if (event.type === 'intervention' && event.ecosystemBefore) {
      interventionIndex = index;
      break;
    }
    if (event.type === 'birth') births++;
    else if (event.type === 'death') deaths++;
    else if (event.type === 'mutation') mutations++;
    else if (event.type === 'extinction') extinctions++;
  }
  if (interventionIndex < 0) return null;

  const intervention = world.events[interventionIndex] as SimEvent;
  const before = intervention.ecosystemBefore!;
  const current = checkpoint(world);
  const ticksSince = Math.max(0, tick - intervention.tick);
  const populationDelta = current.population - before.population;
  const speciesDelta = current.speciesCount - before.speciesCount;
  const lineageDelta = current.lineageCount - before.lineageCount;
  const threshold = Math.max(3, Math.ceil(before.population * 0.2));

  let summary: string;
  let tone: InterventionImpact['tone'];
  if (ticksSince < 5) {
    summary = 'Effects are still emerging';
    tone = 'early';
  } else if (speciesDelta > 0 || lineageDelta > 0) {
    summary = 'Evolutionary variety increased';
    tone = 'positive';
  } else if (populationDelta <= -threshold) {
    summary = 'Population contracted';
    tone = 'warning';
  } else if (populationDelta >= threshold) {
    summary = 'Population expanded';
    tone = 'positive';
  } else if (mutations > 0) {
    summary = 'New adaptations appeared';
    tone = 'positive';
  } else {
    summary = 'The ecosystem response is mixed';
    tone = 'neutral';
  }

  return {
    tick: intervention.tick,
    ticksSince,
    summary,
    tone,
    populationDelta,
    speciesDelta,
    lineageDelta,
    livingEnergyDelta: current.livingEnergy - before.livingEnergy,
    producerBiomassDelta: current.producerBiomass - before.producerBiomass,
    births,
    deaths,
    mutations,
    extinctions,
    settingsChanged: intervention.constantChanges?.length ?? 0,
  };
}
