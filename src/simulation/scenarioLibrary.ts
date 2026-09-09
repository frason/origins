/**
 * Scenario Library
 *
 * Built-in, validated scenarios for ecosystem observation and challenge.
 * Each scenario is fully deterministic, reproducible, and designed to teach
 * different aspects of ecosystem management.
 */

import type { Scenario, ScenarioObjective } from './scenario';
import type { WorldRecipe } from '../ui/worldRecipe';
import { SIMULATION_CONSTANTS } from '../utils/constants';

/**
 * SCENARIO 1: "Recovery from Monoculture"
 *
 * Setup: A world with a single, dominant herbivore species that has consumed
 * most vegetation. The player must reintroduce biodiversity and help the ecosystem
 * recover toward a balanced state.
 *
 * Learning Goals:
 * - Observe adaptation pressure when a species is alone
 * - Understand trophic structure (herbivore → carnivore → balance)
 * - Practice careful species introduction
 *
 * Objectives:
 * - Introduce a carnivore (observation goal)
 * - Track population changes over time
 * - Achieve >3 stable species by tick 300
 */
const RECOVERY_SCENARIO: Scenario = {
  id: 'recovery-from-monoculture-v1',
  version: 1,
  title: 'Recovery from Monoculture',
  description:
    'A single herbivore species has consumed most of the world. ' +
    'Restore ecosystem balance by introducing predators and allowing ' +
    'natural adaptation to create a multi-species ecosystem.',
  difficulty: 'moderate',

  recipe: {
    version: 1,
    seed: 12345, // Deterministic seed
    throughTick: 400, // Maximum ticks for scenario
    initialSettings: {
      ...SIMULATION_CONSTANTS,
      worldWidth: 50,
      worldHeight: 50,
      producerGrowthRate: 0.3,
      baseMetabolism: 1.2,
    },
    actions: [
      {
        type: 'introduce-species',
        tick: 0,
        strategy: 'herbivore',
        origin: { x: 25, y: 25 },
        speciesId: 'herbivore_starter',
        founderCount: 3,
      },
    ],
  },

  constraints: {
    lockedDimensions: true,
    modifiableConstants: [
      'baseMetabolism',
      'producerGrowthRate',
      'defaultMutationRate',
      'feedingEfficiency',
    ],
    allowSpeciesIntroduction: true,
    allowCreatureManipulation: false,
    allowResourceInjection: true,
    allowSpeciesRemoval: false,
  },

  objectives: [
    {
      id: 'observe-monoculture',
      title: 'Observe the Monoculture',
      description: 'Watch tick 0-50 to see how the single herbivore species expands and consumes vegetation.',
      type: 'observation',
      targetMetrics: {
        speciesId: 'herbivore_starter',
        metric: 'population',
        direction: 'increase',
        within: 50,
      },
    },
    {
      id: 'introduce-predator',
      title: 'Introduce a Predator',
      description: 'Add a carnivore species to create predation pressure on the herbivores.',
      type: 'recovery',
      targetMetrics: {
        metric: 'biodiversity',
        threshold: 2,
        within: 150,
      },
    },
    {
      id: 'achieve-balance',
      title: 'Restore Ecosystem Balance',
      description: 'By tick 300, the ecosystem should have 3+ coexisting species showing stable populations.',
      type: 'resilience',
      targetMetrics: {
        metric: 'biodiversity',
        threshold: 3,
        within: 300,
      },
    },
  ] as ScenarioObjective[],

  completionCondition: {
    maxTicks: 400,
    trigger: {
      type: 'all_objectives_met',
    },
    failCondition: {
      type: 'extinction',
      description: 'Failure if all creatures go extinct',
    },
  },

  scoring: {
    primaryMetric: {
      type: 'biodiversity',
      weight: 1.0,
      target: 3,
    },
    evidenceMetrics: [
      {
        name: 'Successful Species Introduction',
        type: 'niche_specialization',
        weight: 0.3,
      },
      {
        name: 'Population Recovery',
        type: 'population_change',
        weight: 0.4,
      },
      {
        name: 'Adaptation Evidence',
        type: 'trait_change',
        weight: 0.2,
      },
    ],
    tradeoffBonus: {
      enabled: true,
      multiObjectiveBonus: 1.2,
    },
  },

  author: 'System',
  createdAt: Date.now(),
  tags: ['recovery', 'biodiversity', 'intermediate'],
  validated: true,
};

/**
 * SCENARIO 2: "Forecasting Population Dynamics"
 *
 * Setup: A balanced, multi-species ecosystem is established. The player must
 * make predictions about population changes and verify them through observation.
 *
 * Learning Goals:
 * - Understand predator-prey dynamics
 * - Practice forecasting based on current state
 * - Learn about carrying capacity and resource constraints
 *
 * Objectives:
 * - Observe the natural cycles
 * - Make a prediction about herbivore population at tick 100
 * - Verify the prediction's accuracy
 */
const FORECASTING_SCENARIO: Scenario = {
  id: 'forecasting-population-v1',
  version: 1,
  title: 'Forecasting Population Dynamics',
  description:
    'A balanced ecosystem with multiple species is established. ' +
    'Predict how populations will change and test your forecasting accuracy.',
  difficulty: 'easy',

  recipe: {
    version: 1,
    seed: 54321, // Different seed for different dynamics
    throughTick: 150, // Maximum ticks for scenario
    initialSettings: {
      ...SIMULATION_CONSTANTS,
      worldWidth: 40,
      worldHeight: 40,
      producerGrowthRate: 0.25,
      baseMetabolism: 1.0,
    },
    actions: [
      {
        type: 'introduce-species',
        tick: 0,
        strategy: 'herbivore',
        origin: { x: 20, y: 20 },
        speciesId: 'grass_eaters',
        founderCount: 3,
      },
      {
        type: 'introduce-species',
        tick: 10,
        strategy: 'carnivore',
        origin: { x: 15, y: 15 },
        speciesId: 'predators',
        founderCount: 3,
      },
    ],
  },

  constraints: {
    lockedDimensions: true,
    modifiableConstants: ['defaultMutationRate'],
    allowSpeciesIntroduction: false,
    allowCreatureManipulation: false,
    allowResourceInjection: false,
    allowSpeciesRemoval: false,
  },

  objectives: [
    {
      id: 'observe-predator-prey',
      title: 'Observe Predator-Prey Cycle',
      description: 'Watch ticks 10-80 and identify the population cycles as predators respond to prey availability.',
      type: 'observation',
      targetMetrics: {
        metric: 'stability',
        direction: 'oscillate',
        within: 80,
      },
    },
    {
      id: 'make-forecast',
      title: 'Make a Forecast',
      description: 'Predict the herbivore population at tick 100 (±10% accuracy wins).',
      type: 'forecasting',
      targetMetrics: {
        speciesId: 'grass_eaters',
        metric: 'population',
        within: 100,
      },
    },
    {
      id: 'verify-forecast',
      title: 'Verify Your Forecast',
      description: 'Simulate to tick 100 and check if your prediction was accurate.',
      type: 'forecasting',
    },
  ] as ScenarioObjective[],

  completionCondition: {
    maxTicks: 150,
    trigger: {
      type: 'objective_met',
      condition: 'verify-forecast',
    },
  },

  scoring: {
    primaryMetric: {
      type: 'forecastAccuracy',
      weight: 1.0,
    },
    evidenceMetrics: [
      {
        name: 'Cycle Observation',
        type: 'population_change',
        weight: 0.3,
      },
      {
        name: 'Forecast Accuracy',
        type: 'population_change',
        weight: 0.7,
      },
    ],
  },

  author: 'System',
  createdAt: Date.now(),
  tags: ['forecasting', 'observation', 'beginner'],
  validated: true,
};

/**
 * SCENARIO 3: "Adaptive Speciation Under Pressure"
 *
 * Setup: An extreme environment (high toxicity, low producer growth, or high temperature)
 * forces rapid adaptation. A single species must evolve traits to survive, potentially
 * speciating into new lineages.
 *
 * Learning Goals:
 * - Understand trait inheritance and mutation
 * - Observe speciation as a result of environmental pressure
 * - Appreciate the role of mutation rates in adaptation
 *
 * Objectives:
 * - Introduce species into harsh environment
 * - Track trait changes (e.g., toxin resistance)
 * - Observe lineage divergence
 * - Achieve persistent population for 150+ ticks
 */
const ADAPTATION_SCENARIO: Scenario = {
  id: 'adaptive-speciation-v1',
  version: 1,
  title: 'Adaptive Speciation Under Pressure',
  description:
    'Harsh environmental conditions force rapid adaptation. ' +
    'Introduce a species and observe how mutation and selection ' +
    'drive speciation and trait evolution.',
  difficulty: 'hard',

  recipe: {
    version: 1,
    seed: 99999, // Seed for extreme environment
    throughTick: 0,
    initialSettings: {
      ...SIMULATION_CONSTANTS,
      worldWidth: 35,
      worldHeight: 35,
      baseMetabolism: 1.5, // Higher energy cost
      producerGrowthRate: 0.15, // Lower resource availability
      defaultMutationRate: 0.25, // Higher mutation pressure
    },
    actions: [
      {
        type: 'introduce-species',
        tick: 0,
        strategy: 'omnivore',
        origin: { x: 17, y: 17 },
        speciesId: 'generalist_survivors',
        founderCount: 3,
      },
    ],
  },

  constraints: {
    lockedDimensions: true,
    modifiableConstants: ['defaultMutationRate', 'baseMetabolism'],
    allowSpeciesIntroduction: false,
    allowCreatureManipulation: false,
    allowResourceInjection: false,
    allowSpeciesRemoval: false,
  },

  objectives: [
    {
      id: 'survival-pressure',
      title: 'Experience Survival Pressure',
      description: 'Observe the harsh conditions and initial population struggles in ticks 0-30.',
      type: 'observation',
      targetMetrics: {
        metric: 'energy',
        direction: 'decrease',
        within: 30,
      },
    },
    {
      id: 'trait-adaptation',
      title: 'Track Trait Adaptation',
      description: 'Monitor toxin resistance and metabolism traits as they evolve in response to pressure.',
      type: 'adaptation',
      targetMetrics: {
        metric: 'traits',
        threshold: 0.2, // 20% change in trait frequency
        within: 200,
      },
    },
    {
      id: 'speciation-event',
      title: 'Observe Speciation',
      description: 'When lineages diverge significantly in traits, mark the speciation event.',
      type: 'adaptation',
      targetMetrics: {
        metric: 'lineages',
        threshold: 2,
        within: 250,
      },
    },
    {
      id: 'persistent-population',
      title: 'Achieve Persistent Survival',
      description: 'Maintain a viable population for at least 150 ticks despite harsh conditions.',
      type: 'resilience',
      targetMetrics: {
        metric: 'population',
        threshold: 1, // At least 1 creature alive
        within: 150,
      },
    },
  ] as ScenarioObjective[],

  completionCondition: {
    maxTicks: 350,
    trigger: {
      type: 'all_objectives_met',
    },
    failCondition: {
      type: 'extinction',
      description: 'Failure if the species goes extinct before tick 150',
    },
  },

  scoring: {
    primaryMetric: {
      type: 'adaptation',
      weight: 1.0,
    },
    evidenceMetrics: [
      {
        name: 'Trait Diversity',
        type: 'trait_change',
        weight: 0.4,
      },
      {
        name: 'Speciation Event',
        type: 'population_change',
        weight: 0.3,
      },
      {
        name: 'Population Resilience',
        type: 'extinction_recovery',
        weight: 0.3,
      },
    ],
    tradeoffBonus: {
      enabled: true,
      multiObjectiveBonus: 1.15,
    },
  },

  author: 'System',
  createdAt: Date.now(),
  tags: ['adaptation', 'speciation', 'advanced'],
  validated: true,
};

/**
 * Complete library of built-in scenarios.
 */
export const SCENARIO_LIBRARY: Record<string, Scenario> = {
  [RECOVERY_SCENARIO.id]: RECOVERY_SCENARIO,
  [FORECASTING_SCENARIO.id]: FORECASTING_SCENARIO,
  [ADAPTATION_SCENARIO.id]: ADAPTATION_SCENARIO,
};

/**
 * Get a scenario by ID from the library.
 */
export function getScenario(scenarioId: string): Scenario | undefined {
  return SCENARIO_LIBRARY[scenarioId];
}

/**
 * List all available scenarios.
 */
export function listScenarios(): Scenario[] {
  return Object.values(SCENARIO_LIBRARY);
}

/**
 * Filter scenarios by difficulty or tag.
 */
export function filterScenarios(
  options?: {
    difficulty?: Scenario['difficulty'];
    tags?: string[];
  }
): Scenario[] {
  let scenarios = listScenarios();

  if (options?.difficulty) {
    scenarios = scenarios.filter((s) => s.difficulty === options.difficulty);
  }

  if (options?.tags?.length) {
    scenarios = scenarios.filter((s) =>
      options.tags!.some((tag) => s.tags?.includes(tag))
    );
  }

  return scenarios;
}
