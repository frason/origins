import { describe, it } from 'vitest';
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
  return {
    population: living.length,
    strategies: Array.from(new Set(living.map((creature) => creature.traits.energyStrategy))).sort(),
    tick60Population,
    tick60Strategies,
  };
}

describe('debug opening', () => {
  it('logs opening results', () => {
    for (const seed of [12345, 42, 54321, 99999]) {
      const result = opening(seed);
      console.log(`Seed ${seed}:`, JSON.stringify(result, null, 2));
    }
  });
});
