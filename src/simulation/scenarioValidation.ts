/**
 * Scenario Validation
 *
 * Authoring validation for scenarios to ensure they are:
 * - Structurally sound (world recipe parses, constraints are consistent)
 * - Feasible (objectives can theoretically be met)
 * - Reproducible (same seed produces consistent results)
 * - Well-formed (scoring weights are normalized)
 */

import type { Scenario, ScenarioValidation } from './scenario';
import { parseWorldRecipe } from '../ui/worldRecipe';
import { SIMULATION_CONSTANTS } from '../utils/constants';

/**
 * Validate a scenario definition for completeness and consistency.
 */
export function validateScenario(scenario: Scenario): ScenarioValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const diagnostics: Record<string, boolean | number> = {};

  // 1. Validate world recipe
  let recipeParseable = true;
  if (!scenario.recipe) {
    errors.push('Scenario missing recipe');
    recipeParseable = false;
  } else {
    try {
      const parsed = parseWorldRecipe(JSON.stringify(scenario.recipe));
      if (parsed.error) {
        errors.push(`Recipe parsing error: ${parsed.error}`);
        recipeParseable = false;
      }
    } catch (e) {
      errors.push(`Recipe serialization error: ${e}`);
      recipeParseable = false;
    }

    // Validate recipe structure
    if (!Number.isInteger(scenario.recipe.seed) || scenario.recipe.seed < 0) {
      errors.push('Recipe seed must be a non-negative integer');
    }
    if (!Number.isInteger(scenario.recipe.throughTick) || scenario.recipe.throughTick < 0) {
      warnings.push('Recipe throughTick should be non-negative');
    }
    if (scenario.recipe.version !== 1) {
      errors.push('Recipe must use version 1');
    }
  }
  diagnostics.recipeParseable = recipeParseable;

  // 2. Validate constraints consistency
  let constraintsConsistent = true;
  if (scenario.constraints) {
    const { modifiableConstants, allowSpeciesIntroduction } = scenario.constraints;

    // Check that modifiable constants exist
    for (const constant of modifiableConstants) {
      if (!(constant in SIMULATION_CONSTANTS)) {
        errors.push(`Unknown constant: ${constant}`);
        constraintsConsistent = false;
      }
    }

    // If no species introduction allowed but objectives require it, warn
    if (!allowSpeciesIntroduction && scenario.objectives?.some((o) => o.type === 'recovery')) {
      warnings.push(
        'Scenario has recovery objectives but species introduction is disabled; ' +
          'players may not be able to meet objectives'
      );
    }
  } else {
    errors.push('Scenario missing constraints');
    constraintsConsistent = false;
  }
  diagnostics.constraintsConsistent = constraintsConsistent;

  // 3. Validate objectives
  let objectivesFeasible = true;
  if (!scenario.objectives || scenario.objectives.length === 0) {
    warnings.push('Scenario has no objectives');
  } else {
    for (const objective of scenario.objectives) {
      if (!objective.id) errors.push('Objective missing id');
      if (!objective.title) errors.push('Objective missing title');
      if (!objective.type) errors.push('Objective missing type');

      // Check type is valid
      const validTypes = ['observation', 'resilience', 'recovery', 'adaptation', 'forecasting'];
      if (!validTypes.includes(objective.type)) {
        errors.push(`Invalid objective type: ${objective.type}`);
        objectivesFeasible = false;
      }
    }

    // Check for objective ID uniqueness
    const ids = scenario.objectives.map((o) => o.id);
    if (new Set(ids).size !== ids.length) {
      errors.push('Objective IDs must be unique');
      objectivesFeasible = false;
    }
  }
  diagnostics.objectivesFeasible = objectivesFeasible;

  // 4. Validate completion condition
  if (!scenario.completionCondition) {
    errors.push('Scenario missing completionCondition');
  } else {
    if (!Number.isInteger(scenario.completionCondition.maxTicks) || scenario.completionCondition.maxTicks <= 0) {
      errors.push('Completion condition maxTicks must be a positive integer');
    }
  }

  // 5. Validate scoring
  let scoringWeightsSum = 0;
  if (!scenario.scoring) {
    errors.push('Scenario missing scoring');
  } else {
    // Check primary metric weight
    if (!scenario.scoring.primaryMetric || scenario.scoring.primaryMetric.weight <= 0) {
      errors.push('Primary metric must have positive weight');
    } else {
      scoringWeightsSum += scenario.scoring.primaryMetric.weight;
    }

    // Check evidence metrics
    if (scenario.scoring.evidenceMetrics?.length > 0) {
      const sumEvidence = scenario.scoring.evidenceMetrics.reduce(
        (sum, metric) => sum + (metric.weight || 0),
        0
      );
      if (sumEvidence > 0 && Math.abs(sumEvidence - 1.0) > 0.01) {
        warnings.push(
          `Evidence metric weights sum to ${sumEvidence.toFixed(2)}, not 1.0; ' +
          'scores may not normalize as expected`
        );
      }
      scoringWeightsSum += sumEvidence;
    }

    // Check trade-off bonus is reasonable
    if (scenario.scoring.tradeoffBonus?.enabled) {
      if (scenario.scoring.tradeoffBonus.multiObjectiveBonus < 1.0 || scenario.scoring.tradeoffBonus.multiObjectiveBonus > 2.0) {
        warnings.push(
          'Trade-off bonus should be between 1.0 and 2.0; ' +
            `${scenario.scoring.tradeoffBonus.multiObjectiveBonus} may not balance well`
        );
      }
    }
  }
  diagnostics.scoringWeightsSum = scoringWeightsSum;

  // 6. Validate metadata
  if (!scenario.id || scenario.id.length === 0) {
    errors.push('Scenario missing id');
  }
  if (!scenario.title || scenario.title.length === 0) {
    errors.push('Scenario missing title');
  }
  if (!scenario.description || scenario.description.length === 0) {
    errors.push('Scenario missing description');
  }
  if (!scenario.difficulty || !['tutorial', 'easy', 'moderate', 'hard', 'expert'].includes(scenario.difficulty)) {
    errors.push('Scenario has invalid difficulty level');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    diagnostics: diagnostics as any,
  };
}

/**
 * Create a validated scenario, or throw if invalid.
 */
export function createValidatedScenario(scenario: Scenario): Scenario {
  const validation = validateScenario(scenario);
  if (!validation.isValid) {
    throw new Error(`Scenario validation failed:\n${validation.errors.join('\n')}`);
  }
  return {
    ...scenario,
    validated: true,
    validationErrors: validation.errors,
  };
}

/**
 * Authoring helper: validate a scenario definition as JSON.
 */
export function validateScenarioJson(json: string): ScenarioValidation {
  try {
    const parsed = JSON.parse(json) as Scenario;
    return validateScenario(parsed);
  } catch (e) {
    return {
      isValid: false,
      errors: [`JSON parsing error: ${e}`],
      warnings: [],
    };
  }
}
