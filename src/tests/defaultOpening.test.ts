import { describe, expect, it } from 'vitest';
import { buildDemoEngine } from '../simulation/demoWorld';
import { tickEngine } from '../simulation/engine';
import { SIMULATION_CONSTANTS } from '../utils/constants';

function opening(seed: number) {
  let state = buildDemoEngine(seed, { ...SIMULATION_CONSTANTS });
  const populations = [state.creatures.filter((creature) => creature.lifecycleState === 'alive').length];
  let tick60Strategies: string[] = [];
  let tick60Population = 0;
  for (let tick = 1; tick <= 100; tick++) {
    state = tickEngine(state);
    const living = state.creatures.filter((creature) => creature.lifecycleState === 'alive');
    populations.push(living.length);
    if (tick === 60) {
      tick60Population = living.length;
      tick60Strategies = Array.from(new Set(
        living.map((creature) => creature.traits.energyStrategy)
      )).sort();
    }
  }
  const living = state.creatures.filter((creature) => creature.lifecycleState === 'alive');
  let maximumTenTickDecline = 0;
  for (let tick = 0; tick <= populations.length - 11; tick++) {
    if (populations[tick] === 0) continue;
    maximumTenTickDecline = Math.max(
      maximumTenTickDecline,
      (populations[tick] - populations[tick + 10]) / populations[tick]
    );
  }
  return {
    population: living.length,
    strategies: Array.from(new Set(living.map((creature) => creature.traits.energyStrategy))).sort(),
    tick60Population,
    tick60Strategies,
    maximumTenTickDecline,
    births: state.events.filter((event) => event.type === 'birth').length,
    deaths: state.events.filter((event) => event.type === 'death').length,
  };
}

describe('default opening quality gate', () => {
  it('keeps the complete starter food web alive through tick 100 across seeds', () => {
    for (const seed of [12345, 42, 54321, 99999]) {
      const result = opening(seed);
      expect(result.tick60Strategies, `seed ${seed} at tick 60`).toEqual([
        'carnivore', 'herbivore', 'omnivore', 'scavenger',
      ]);
      // All founder guilds get a viable opening window; one may be lost by tick 100 as local
      // scarcity begins selecting between otherwise replay-identical worlds.
      expect(result.strategies.length, `seed ${seed} at tick 100`).toBeGreaterThanOrEqual(3);
      // Coherent climate bands make some seeds meaningfully harsher; preserve a viable
      // founder-scale cohort without forcing geography to optimize for one fixture.
      expect(result.tick60Population, `seed ${seed} at tick 60`).toBeGreaterThanOrEqual(18);
      // Costly dispersal makes scarcity visible sooner; preserve a viable founder-scale
      // population without requiring the pre-dispersal count of 20.
      expect(result.population, `seed ${seed} at tick 100`).toBeGreaterThanOrEqual(15);
      expect(result.population, `seed ${seed} runaway growth`).toBeLessThanOrEqual(50);
      // The governance calibration records the remaining starvation cliff as a failed long-run
      // outcome; this guard prevents it worsening while biomass recovery is addressed separately.
      expect(result.maximumTenTickDecline, `seed ${seed} cohort cliff`).toBeLessThanOrEqual(0.4);
    }
  });

  it('replays the governed opening exactly', () => {
    expect(opening(12345)).toEqual(opening(12345));
  });
});
