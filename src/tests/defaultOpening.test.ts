import { describe, expect, it } from 'vitest';
import { buildDemoEngine } from '../simulation/demoWorld';
import { tickEngine } from '../simulation/engine';
import { SIMULATION_CONSTANTS } from '../utils/constants';

function opening(seed: number) {
  let state = buildDemoEngine(seed, { ...SIMULATION_CONSTANTS });
  for (let tick = 0; tick < 60; tick++) state = tickEngine(state);
  const living = state.creatures.filter((creature) => creature.lifecycleState === 'alive');
  return {
    population: living.length,
    strategies: Array.from(new Set(living.map((creature) => creature.traits.energyStrategy))).sort(),
    births: state.events.filter((event) => event.type === 'birth').length,
    deaths: state.events.filter((event) => event.type === 'death').length,
  };
}

describe('default opening quality gate', () => {
  it('keeps the complete starter food web alive through tick 60 across seeds', () => {
    for (const seed of [42, 12345, 54321, 99999]) {
      const result = opening(seed);
      expect(result.strategies, `seed ${seed}`).toEqual([
        'carnivore', 'herbivore', 'omnivore', 'scavenger',
      ]);
      expect(result.population, `seed ${seed}`).toBeGreaterThanOrEqual(20);
    }
  });

  it('replays the governed opening exactly', () => {
    expect(opening(12345)).toEqual(opening(12345));
  });
});
