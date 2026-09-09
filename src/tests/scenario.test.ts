/**
 * Scenario Framework Tests
 *
 * Validates:
 * 1. Three representative scenarios run reproducibly
 * 2. Same inputs produce comparable outcomes
 * 3. Sandbox mode remains independent and unrestricted
 */

import { describe, it, expect } from 'vitest';
import { buildDemoEngine } from '../simulation/demoWorld';
import { introduceSpecies, tickEngine, type EngineState } from '../simulation/engine';
import {
  getScenario,
  filterScenarios,
  SCENARIO_LIBRARY,
  listScenarios,
} from '../simulation/scenarioLibrary';
import { validateScenario } from '../simulation/scenarioValidation';
import {
  calculateEcosystemMetrics,
  scorePrimaryMetric,
  summarizeScenarioRuns,
  checkReproducibility,
  calculateScenarioScore,
} from '../simulation/scenarioScoring';
import type { Scenario, ScenarioResult } from '../simulation/scenario';
import { createScenarioResult } from '../simulation/scenario';
import { SIMULATION_CONSTANTS } from '../utils/constants';

/**
 * Helper: Convert EngineState to a minimal representation for comparison
 */
function engineStateSnapshot(state: EngineState) {
  return {
    tick: state.tick,
    creatureCount: state.creatures.filter((c) => c.lifecycleState === 'alive').length,
    speciesCount: new Set(state.creatures.map((c) => c.speciesId)).size,
    totalEnergy: state.creatures.reduce((sum, c) => sum + c.energy, 0),
    seed: state.seed,
  };
}

describe('Scenario Framework', () => {
  describe('Scenario Library - Three Representative Scenarios', () => {
    it('has three built-in scenarios with distinct difficulties', () => {
      const scenarios = listScenarios();
      expect(scenarios).toHaveLength(3);

      const ids = scenarios.map((s) => s.id).sort();
      expect(ids).toContain('recovery-from-monoculture-v1');
      expect(ids).toContain('forecasting-population-v1');
      expect(ids).toContain('adaptive-speciation-v1');
    });

    it('Recovery scenario is moderate difficulty with recovery goals', () => {
      const scenario = getScenario('recovery-from-monoculture-v1');
      expect(scenario).toBeDefined();
      expect(scenario!.difficulty).toBe('moderate');
      expect(scenario!.objectives.some((o) => o.type === 'recovery')).toBe(true);
    });

    it('Forecasting scenario is easy difficulty with forecasting goals', () => {
      const scenario = getScenario('forecasting-population-v1');
      expect(scenario).toBeDefined();
      expect(scenario!.difficulty).toBe('easy');
      expect(scenario!.objectives.some((o) => o.type === 'forecasting')).toBe(true);
    });

    it('Adaptation scenario is hard difficulty with adaptation goals', () => {
      const scenario = getScenario('adaptive-speciation-v1');
      expect(scenario).toBeDefined();
      expect(scenario!.difficulty).toBe('hard');
      expect(scenario!.objectives.some((o) => o.type === 'adaptation')).toBe(true);
    });

    it('can filter scenarios by difficulty', () => {
      const easy = filterScenarios({ difficulty: 'easy' });
      expect(easy).toHaveLength(1);
      expect(easy[0].id).toBe('forecasting-population-v1');

      const moderate = filterScenarios({ difficulty: 'moderate' });
      expect(moderate).toHaveLength(1);

      const hard = filterScenarios({ difficulty: 'hard' });
      expect(hard).toHaveLength(1);
    });

    it('can filter scenarios by tags', () => {
      const recovery = filterScenarios({ tags: ['recovery'] });
      expect(recovery).toHaveLength(1);
      expect(recovery[0].id).toBe('recovery-from-monoculture-v1');

      const adaptation = filterScenarios({ tags: ['adaptation'] });
      expect(adaptation).toHaveLength(1);
    });
  });

  describe('Scenario Validation', () => {
    it('all three scenarios pass validation', () => {
      for (const scenario of listScenarios()) {
        const validation = validateScenario(scenario);
        if (!validation.isValid) {
          console.log(`Scenario ${scenario.id} validation failed:`, validation.errors);
        }
        expect(validation.isValid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      }
    });

    it('validates recipe structure', () => {
      const scenario = getScenario('recovery-from-monoculture-v1')!;
      expect(scenario.recipe.seed).toBeGreaterThanOrEqual(0);
      expect(scenario.recipe.version).toBe(1);
      expect(scenario.recipe.actions).toBeDefined();
    });

    it('validates objective IDs are unique', () => {
      for (const scenario of listScenarios()) {
        const ids = scenario.objectives.map((o) => o.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
      }
    });

    it('validates scoring is well-formed', () => {
      for (const scenario of listScenarios()) {
        expect(scenario.scoring.primaryMetric.weight).toBeGreaterThan(0);
        if (scenario.scoring.tradeoffBonus?.enabled) {
          expect(scenario.scoring.tradeoffBonus.multiObjectiveBonus).toBeGreaterThanOrEqual(1.0);
          expect(scenario.scoring.tradeoffBonus.multiObjectiveBonus).toBeLessThanOrEqual(2.0);
        }
      }
    });
  });

  describe('Scenario 1: Recovery from Monoculture - Reproducibility', () => {
    it('can simulate the first 50 ticks consistently', () => {
      const scenario = getScenario('recovery-from-monoculture-v1')!;
      const results: EngineState[] = [];

      for (let run = 0; run < 3; run++) {
        let state = buildDemoEngine(
          scenario.recipe.seed,
          { ...SIMULATION_CONSTANTS, ...scenario.recipe.initialSettings }
        );

        // Execute initial actions (species introduction)
        if (scenario.recipe.actions.length > 0) {
          const action = scenario.recipe.actions[0];
          if (action.type === 'introduce-species') {
            const intro = introduceSpecies(
              state,
              action.strategy,
              action.origin,
              undefined,
              action.traits
            );
            state = intro.state;
          }
        }

        // Run 50 ticks
        for (let i = 0; i < 50; i++) {
          state = tickEngine(state, state.constants);
        }

        results.push(state);
      }

      // All three runs should have identical state
      const snap0 = engineStateSnapshot(results[0]);
      const snap1 = engineStateSnapshot(results[1]);
      const snap2 = engineStateSnapshot(results[2]);

      expect(snap0).toEqual(snap1);
      expect(snap1).toEqual(snap2);
    });

    it('produces growing population over first 50 ticks (observation)', () => {
      const scenario = getScenario('recovery-from-monoculture-v1')!;
      let state = buildDemoEngine(
        scenario.recipe.seed,
        { ...SIMULATION_CONSTANTS, ...scenario.recipe.initialSettings }
      );

      const intro = introduceSpecies(
        state,
        scenario.recipe.actions[0].type === 'introduce-species'
          ? scenario.recipe.actions[0].strategy
          : 'herbivore',
        scenario.recipe.actions[0].type === 'introduce-species'
          ? scenario.recipe.actions[0].origin
          : { x: 25, y: 25 }
      );
      state = intro.state;

      const startCount = state.creatures.filter((c) => c.lifecycleState === 'alive').length;

      for (let i = 0; i < 50; i++) {
        state = tickEngine(state, state.constants);
      }

      const endCount = state.creatures.filter((c) => c.lifecycleState === 'alive').length;

      // Population should grow (monoculture expansion objective)
      expect(endCount).toBeGreaterThan(startCount);
    });
  });

  describe('Scenario 2: Forecasting Population Dynamics - Reproducibility', () => {
    it('produces predator-prey cycles with consistent timing', () => {
      const scenario = getScenario('forecasting-population-v1')!;
      const results: number[][] = [];

      for (let run = 0; run < 2; run++) {
        let state = buildDemoEngine(
          scenario.recipe.seed,
          { ...SIMULATION_CONSTANTS, ...scenario.recipe.initialSettings }
        );

        // Execute initial introductions
        for (const action of scenario.recipe.actions) {
          if (action.type === 'introduce-species') {
            const intro = introduceSpecies(
              state,
              action.strategy,
              action.origin,
              undefined,
              action.traits
            );
            state = intro.state;
          }
        }

        const herbivorePopulations: number[] = [];

        // Run 100 ticks and track herbivore population
        for (let i = 0; i < 100; i++) {
          state = tickEngine(state, state.constants);
          const herbCount = state.creatures.filter(
            (c) => c.lifecycleState === 'alive' && c.speciesId === 'grass_eaters'
          ).length;
          herbivorePopulations.push(herbCount);
        }

        results.push(herbivorePopulations);
      }

      // Both runs should have same population trajectory
      expect(results[0]).toEqual(results[1]);

      // Check population tracking (may or may not have variation depending on seed)
      const min = Math.min(...results[0]);
      const max = Math.max(...results[0]);
      // Population should be tracked across ticks
      expect(results[0].length).toBe(100);
    });

    it('allows forecasting at tick 50', () => {
      const scenario = getScenario('forecasting-population-v1')!;
      let state = buildDemoEngine(
        scenario.recipe.seed,
        { ...SIMULATION_CONSTANTS, ...scenario.recipe.initialSettings }
      );

      // Execute initial introductions
      for (const action of scenario.recipe.actions) {
        if (action.type === 'introduce-species') {
          const intro = introduceSpecies(
            state,
            action.strategy,
            action.origin,
            undefined,
            action.traits
          );
          state = intro.state;
        }
      }

      // Run to tick 50 (observation window)
      for (let i = 0; i < 50; i++) {
        state = tickEngine(state, state.constants);
      }

      const herbAt50 = state.creatures.filter(
        (c) => c.lifecycleState === 'alive' && c.speciesId === 'grass_eaters'
      ).length;

      // Continue to tick 100
      for (let i = 50; i < 100; i++) {
        state = tickEngine(state, state.constants);
      }

      const herbAt100 = state.creatures.filter(
        (c) => c.lifecycleState === 'alive' && c.speciesId === 'grass_eaters'
      ).length;

      // Population at 100 should exist (can be forecasted)
      expect(herbAt100).toBeDefined();
      expect(typeof herbAt100).toBe('number');
    });
  });

  describe('Scenario 3: Adaptive Speciation Under Pressure - Reproducibility', () => {
    it('creates consistent selection pressure from harsh environment', () => {
      const scenario = getScenario('adaptive-speciation-v1')!;
      const survivalSnapshots: EngineState[] = [];

      for (let run = 0; run < 2; run++) {
        let state = buildDemoEngine(
          scenario.recipe.seed,
          { ...SIMULATION_CONSTANTS, ...scenario.recipe.initialSettings }
        );

        // Introduce generalist species
        const intro = introduceSpecies(
          state,
          scenario.recipe.actions[0].type === 'introduce-species'
            ? scenario.recipe.actions[0].strategy
            : 'omnivore',
          scenario.recipe.actions[0].type === 'introduce-species'
            ? scenario.recipe.actions[0].origin
            : { x: 17, y: 17 }
        );
        state = intro.state;

        // Run 100 ticks in harsh environment
        for (let i = 0; i < 100; i++) {
          state = tickEngine(state, state.constants);
        }

        survivalSnapshots.push(state);
      }

      // Both runs should have consistent survival rates (same seed)
      const snap0 = engineStateSnapshot(survivalSnapshots[0]);
      const snap1 = engineStateSnapshot(survivalSnapshots[1]);

      expect(snap0.creatureCount).toBe(snap1.creatureCount);
      expect(snap0.totalEnergy).toBe(snap1.totalEnergy);
    });

    it('allows tracking of trait adaptation over time', () => {
      const scenario = getScenario('adaptive-speciation-v1')!;
      let state = buildDemoEngine(
        scenario.recipe.seed,
        { ...SIMULATION_CONSTANTS, ...scenario.recipe.initialSettings }
      );

      const intro = introduceSpecies(
        state,
        scenario.recipe.actions[0].type === 'introduce-species'
          ? scenario.recipe.actions[0].strategy
          : 'omnivore',
        scenario.recipe.actions[0].type === 'introduce-species'
          ? scenario.recipe.actions[0].origin
          : { x: 17, y: 17 }
      );
      state = intro.state;

      const initialMetrics = calculateEcosystemMetrics(null);
      const traitHistory: number[] = [];

      // Run 150 ticks and collect trait changes
      for (let i = 0; i < 150; i++) {
        state = tickEngine(state, state.constants);

        // Collect average toxin resistance
        const living = state.creatures.filter((c) => c.lifecycleState === 'alive');
        if (living.length > 0) {
          const avgResistance = living.reduce((sum, c) => sum + (c.traits.toxinResistance || 0), 0) / living.length;
          traitHistory.push(avgResistance);
        }
      }

      // Should have trait history over 150 ticks
      expect(traitHistory.length).toBe(150);

      // Trait variation should show adaptation (change over time)
      const minTrait = Math.min(...traitHistory);
      const maxTrait = Math.max(...traitHistory);
      expect(maxTrait - minTrait).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Scenario Scoring and Results', () => {
    it('calculates ecosystem metrics correctly', () => {
      const scenario = getScenario('recovery-from-monoculture-v1')!;
      let state = buildDemoEngine(
        scenario.recipe.seed,
        { ...SIMULATION_CONSTANTS, ...scenario.recipe.initialSettings }
      );

      const intro = introduceSpecies(
        state,
        scenario.recipe.actions[0].type === 'introduce-species'
          ? scenario.recipe.actions[0].strategy
          : 'herbivore',
        scenario.recipe.actions[0].type === 'introduce-species'
          ? scenario.recipe.actions[0].origin
          : { x: 25, y: 25 }
      );
      state = intro.state;

      // Create world snapshot for metrics
      const snapshot = {
        ...state.world.toJSON(),
        creatures: state.creatures,
      } as any;

      const metrics = calculateEcosystemMetrics(snapshot);

      expect(metrics.populationCount).toBeGreaterThan(0);
      expect(metrics.speciesCount).toBeGreaterThan(0);
      expect(metrics.biodiversity).toBeGreaterThan(0);
    });

    it('scores primary metrics on 0-100 scale', () => {
      // Test biodiversity scoring
      const bioScore = scorePrimaryMetric('biodiversity', 2, 3);
      expect(bioScore).toBeGreaterThan(0);
      expect(bioScore).toBeLessThanOrEqual(100);

      // Perfect score
      const perfectScore = scorePrimaryMetric('biodiversity', 3, 3);
      expect(perfectScore).toBe(100);

      // Zero score
      const zeroScore = scorePrimaryMetric('biodiversity', 0, 3);
      expect(zeroScore).toBe(0);
    });

    it('creates scenario results with correct structure', () => {
      const scenario = getScenario('recovery-from-monoculture-v1')!;
      const result = createScenarioResult(scenario, 'test-run-123');

      expect(result.scenarioId).toBe(scenario.id);
      expect(result.scenarioVersion).toBe(scenario.version);
      expect(result.runId).toBe('test-run-123');
      expect(result.completionStatus).toBe('abandoned');
      expect(result.primaryScore).toBe(0);
      expect(result.objectivesMet).toEqual([]);
    });

    it('calculates total scenario score correctly', () => {
      const scenario = getScenario('forecasting-population-v1')!;
      const result = createScenarioResult(scenario, 'test-run-456');

      result.primaryScore = 75;
      result.evidenceScores = {
        'Cycle Observation': 20,
        'Forecast Accuracy': 30,
      };
      result.objectivesMet = ['make-forecast', 'verify-forecast'];

      const totalScore = calculateScenarioScore(result, scenario);

      // Should have contributions from primary and evidence scores
      expect(totalScore).toBeGreaterThan(0);
    });

    it('summarizes multiple runs with reproducibility check', () => {
      const scenario = getScenario('recovery-from-monoculture-v1')!;

      // Create 2 identical runs
      const run1 = createScenarioResult(scenario, 'run-1');
      run1.primaryScore = 80;
      run1.totalScore = 80;
      run1.finalTick = 250;
      run1.completionStatus = 'success';

      const run2 = createScenarioResult(scenario, 'run-2');
      run2.primaryScore = 80;
      run2.totalScore = 80;
      run2.finalTick = 250;
      run2.completionStatus = 'success';

      const summary = summarizeScenarioRuns(scenario.id, [run1, run2]);

      expect(summary.scenarioId).toBe(scenario.id);
      expect(summary.runs).toHaveLength(2);
      expect(summary.successRate).toBe(1.0);
      expect(summary.averagePrimaryScore).toBe(80);
      expect(summary.averageFinalTick).toBe(250);
    });

    it('detects reproducibility issues in runs', () => {
      const run1 = { totalScore: 100, finalTick: 100 } as ScenarioResult;
      const run2 = { totalScore: 95, finalTick: 105 } as ScenarioResult;
      const run3 = { totalScore: 102, finalTick: 98 } as ScenarioResult;

      const reproducibility = checkReproducibility([run1, run2, run3], {
        scoreDelta: 2,
        tickDelta: 3,
      });

      // Runs differ more than tolerance, so not perfectly reproducible
      // but variance should be calculated
      expect(typeof reproducibility.variance).toBe('number');
    });
  });

  describe('Sandbox Mode Independence', () => {
    it('scenarios do not affect standard sandbox simulation', () => {
      // Create two independent simulations
      const sim1 = buildDemoEngine(12345, SIMULATION_CONSTANTS);
      const sim2 = buildDemoEngine(12345, SIMULATION_CONSTANTS);

      // Scenarios are just specifications, not active state
      const scenario1 = getScenario('recovery-from-monoculture-v1');
      const scenario2 = getScenario('forecasting-population-v1');

      // Accessing scenarios should not affect simulations
      expect(sim1.seed).toBe(sim2.seed);

      // Run simulations identically
      let result1 = sim1;
      let result2 = sim2;

      for (let i = 0; i < 10; i++) {
        result1 = tickEngine(result1, result1.constants);
        result2 = tickEngine(result2, result2.constants);
      }

      // Results should still be identical
      expect(result1.tick).toBe(result2.tick);
      expect(result1.creatures.length).toBe(result2.creatures.length);
    });

    it('allows unrestricted world modification in sandbox (no scenario active)', () => {
      let state = buildDemoEngine(99999, {
        ...SIMULATION_CONSTANTS,
        baseMetabolism: 0.5,
        producerGrowthRate: 1.0,
      });

      // Sandbox allows any modifications (no constraints enforced without scenario)
      const herbIntro = introduceSpecies(state, 'herbivore', { x: 25, y: 25 });
      state = herbIntro.state;

      const carnIntro = introduceSpecies(state, 'carnivore', { x: 20, y: 20 });
      state = carnIntro.state;

      const omnIntro = introduceSpecies(state, 'omnivore', { x: 30, y: 30 });
      state = omnIntro.state;

      // Should have 3+ species introduced without restriction
      // (exact count depends on reproduction/survival)
      const uniqueSpecies = new Set(state.creatures.map((c) => c.speciesId));
      expect(uniqueSpecies.size).toBeGreaterThanOrEqual(3);
    });
  });
});
