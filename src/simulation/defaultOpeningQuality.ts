import { SIMULATION_CONSTANTS, type SimulationConstants } from '../utils/constants';
import type { EnergyStrategy } from '../utils/traits';
import { buildDemoEngine } from './demoWorld';
import { tickEngine } from './engine';
import type { DeathCause } from './events';

export interface DefaultOpeningQuality {
  seed: number;
  throughTick: number;
  finalPopulation: number;
  finalStrategies: EnergyStrategy[];
  finalStrategyCounts: Record<EnergyStrategy, number>;
  starterCarrionConsumptionEvents: number;
  generatedCarrionConsumptionEvents: number;
  generatedCarrionScavengerAccessEvents: number;
  maximumWindowDecline: number;
  declineWindowStart: number;
  declineWindowEnd: number;
  declineStartPopulation: number;
  declineEndPopulation: number;
  declineWindowBirths: number;
  declineWindowDeaths: number;
  declineDeathCauses: Partial<Record<DeathCause, number>>;
  populations: number[];
}

/** Deterministic opening diagnostic used by #131 gates and calibration. */
export function measureDefaultOpeningQuality(
  seed: number,
  throughTick = 100,
  declineWindowTicks = 10,
  constants: SimulationConstants = { ...SIMULATION_CONSTANTS }
): DefaultOpeningQuality {
  const horizon = Math.max(0, Math.floor(throughTick));
  const window = Math.max(1, Math.min(horizon || 1, Math.floor(declineWindowTicks)));
  let state = buildDemoEngine(seed, { ...constants });
  let starterCarrionConsumptionEvents = 0;
  let generatedCarrionConsumptionEvents = 0;
  let generatedCarrionScavengerAccessEvents = 0;
  const eventStarts = [state.events.length];
  const populations = [
    state.creatures.filter((creature) => creature.lifecycleState === 'alive').length,
  ];
  for (let tick = 1; tick <= horizon; tick++) {
    const previousCreatures = new Map(
      state.creatures.map((creature) => [creature.id, creature])
    );
    state = tickEngine(state);
    for (const creature of state.creatures) {
      const previous = previousCreatures.get(creature.id);
      if (
        !previous ||
        previous.lifecycleState === 'alive' ||
        previous.corpseDecayTicks <= 0 ||
        previous.corpseDecayTicks - creature.corpseDecayTicks <= 1
      ) continue;
      if (creature.lineageId.endsWith('_starter_carrion')) {
        starterCarrionConsumptionEvents++;
      } else {
        generatedCarrionConsumptionEvents++;
        if (state.creatures.some((candidate) =>
          candidate.lifecycleState === 'alive' &&
          candidate.traits.energyStrategy === 'scavenger' &&
          candidate.x === creature.x && candidate.y === creature.y
        )) {
          generatedCarrionScavengerAccessEvents++;
        }
      }
    }
    eventStarts.push(state.events.length);
    populations.push(
      state.creatures.filter((creature) => creature.lifecycleState === 'alive').length
    );
  }

  let maximumWindowDecline = 0;
  let declineWindowStart = 0;
  for (let tick = 0; tick + window < populations.length; tick++) {
    if (populations[tick] <= 0) continue;
    const decline = (populations[tick] - populations[tick + window]) / populations[tick];
    if (decline > maximumWindowDecline) {
      maximumWindowDecline = decline;
      declineWindowStart = tick;
    }
  }
  const living = state.creatures.filter((creature) => creature.lifecycleState === 'alive');
  const finalStrategyCounts: Record<EnergyStrategy, number> = {
    herbivore: 0,
    carnivore: 0,
    omnivore: 0,
    scavenger: 0,
  };
  for (const creature of living) {
    finalStrategyCounts[creature.traits.energyStrategy]++;
  }
  const windowEvents = state.events.slice(
    eventStarts[declineWindowStart],
    eventStarts[declineWindowStart + window]
  );
  const declineDeathCauses: Partial<Record<DeathCause, number>> = {};
  for (const event of windowEvents) {
    if (event.type !== 'death') continue;
    const cause = event.deathCause ?? 'unknown';
    declineDeathCauses[cause] = (declineDeathCauses[cause] ?? 0) + 1;
  }
  return {
    seed,
    throughTick: horizon,
    finalPopulation: living.length,
    finalStrategies: [...new Set(
      living.map((creature) => creature.traits.energyStrategy)
    )].sort() as EnergyStrategy[],
    finalStrategyCounts,
    starterCarrionConsumptionEvents,
    generatedCarrionConsumptionEvents,
    generatedCarrionScavengerAccessEvents,
    maximumWindowDecline,
    declineWindowStart,
    declineWindowEnd: declineWindowStart + window,
    declineStartPopulation: populations[declineWindowStart],
    declineEndPopulation: populations[declineWindowStart + window],
    declineWindowBirths: windowEvents.filter((event) => event.type === 'birth').length,
    declineWindowDeaths: windowEvents.filter((event) => event.type === 'death').length,
    declineDeathCauses,
    populations,
  };
}
