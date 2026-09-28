/**
 * Unit tests for Knowledge Point calculation
 *
 * Tests deterministic KP calculation, multipliers, and formula consistency.
 * Verifies: base KP, context multiplier, diversity bonus, duplication penalty.
 */

import { describe, it, expect } from 'vitest';
import { calculateKnowledgePoints, type AdaptationEvidence, type ForecastingEvidence } from '../../simulation/knowledge';
import { DEFAULT_KNOWLEDGE_CONSTANTS } from '../../constants/knowledge';
import { getEcosystemDynamics, type EcosystemDynamics } from '../../ui/ecosystemHealth';

describe('Knowledge Point Calculation', () => {
  // Create mock ecosystem with stable state (Order strategy)
  const mockStableEcosystem: EcosystemDynamics = {
    overall: { label: 'Balanced', tone: 'healthy' },
    order: { label: 'Coherent', tone: 'healthy', score: 75, explanation: 'Stable ecosystem' },
    chaos: { label: 'Quiet', tone: 'stable', score: 40, explanation: 'Low turnover' },
    exploration: { label: 'Stagnant', tone: 'stable', score: 20, explanation: 'No new mutations' },
  };

  // Create mock ecosystem with chaotic state (Chaos strategy)
  const mockChaoticEcosystem: EcosystemDynamics = {
    overall: { label: 'Turbulent', tone: 'warning' },
    order: { label: 'Fragile', tone: 'warning', score: 40, explanation: 'Low diversity' },
    chaos: { label: 'Turbulent', tone: 'warning', score: 85, explanation: 'High turnover' },
    exploration: { label: 'Adapting', tone: 'stable', score: 50, explanation: 'Some mutations' },
  };

  // Create mock ecosystem with exploration focus (Exploration strategy)
  const mockExploringEcosystem: EcosystemDynamics = {
    overall: { label: 'Evolving', tone: 'stable' },
    order: { label: 'Fragile', tone: 'warning', score: 45, explanation: 'Changing' },
    chaos: { label: 'Dynamic', tone: 'stable', score: 55, explanation: 'Moderate turnover' },
    exploration: { label: 'Branching', tone: 'healthy', score: 82, explanation: 'Many mutations' },
  };

  // Create mock stagnant ecosystem (no strategy bonus)
  const mockStagnantEcosystem: EcosystemDynamics = {
    overall: { label: 'Stagnant', tone: 'warning' },
    order: { label: 'Unraveling', tone: 'danger', score: 25, explanation: 'Collapsing' },
    chaos: { label: 'Dormant', tone: 'warning', score: 10, explanation: 'No activity' },
    exploration: { label: 'Stagnant', tone: 'stable', score: 15, explanation: 'No change' },
  };

  describe('Adaptation Evidence', () => {
    const mockAdaptation: AdaptationEvidence = {
      id: 'adapt_001',
      type: 'adaptation',
      world_seed: 12345,
      tick_discovered: 150,
      player_notes: 'Herbivores evolved armor in toxic zone',
      knowledge_points_awarded: 0, // Placeholder
      signature_hash: 'abc123',
      species_id: 'herbivore_1',
      trait_name: 'armor',
      trait_change: { from: 2, to: 6 },
      frequency_percent: 76, // 76% of births carry trait
      generations: 3,
      environment_pressure: 'toxicity_spike',
      lineage_ids: ['lineage_1', 'lineage_2'],
    };

    it('should calculate base KP for adaptation evidence', () => {
      const result = calculateKnowledgePoints(mockAdaptation, [], 150, null);
      expect(result.base_kp).toBe(DEFAULT_KNOWLEDGE_CONSTANTS.ADAPTATION_BASE_KP);
      expect(result.base_kp).toBeGreaterThan(0);
    });

    it('should apply 1.1x context multiplier for stable order strategy', () => {
      const result = calculateKnowledgePoints(mockAdaptation, [], 150, mockStableEcosystem);
      expect(result.context_multiplier).toBe(DEFAULT_KNOWLEDGE_CONSTANTS.STRATEGY_BONUS_MULTIPLIER);
      expect(result.context_multiplier).toBe(1.1);
    });

    it('should apply 1.1x context multiplier for chaotic ecosystem (symmetric with order)', () => {
      const result = calculateKnowledgePoints(mockAdaptation, [], 150, mockChaoticEcosystem);
      expect(result.context_multiplier).toBe(DEFAULT_KNOWLEDGE_CONSTANTS.STRATEGY_BONUS_MULTIPLIER);
      expect(result.context_multiplier).toBe(1.1); // Same as stable
    });

    it('should apply 1.1x context multiplier for exploration strategy', () => {
      const result = calculateKnowledgePoints(mockAdaptation, [], 150, mockExploringEcosystem);
      expect(result.context_multiplier).toBe(DEFAULT_KNOWLEDGE_CONSTANTS.STRATEGY_BONUS_MULTIPLIER);
      expect(result.context_multiplier).toBe(1.1); // Same as other strategies
    });

    it('should apply baseline 1.0x multiplier for stagnant ecosystem', () => {
      const result = calculateKnowledgePoints(mockAdaptation, [], 150, mockStagnantEcosystem);
      expect(result.context_multiplier).toBe(DEFAULT_KNOWLEDGE_CONSTANTS.CONTEXT_BASELINE_MULTIPLIER);
      expect(result.context_multiplier).toBe(1.0);
    });

    it('should be deterministic: same evidence produces same KP', () => {
      const result1 = calculateKnowledgePoints(mockAdaptation, [], 150, mockStableEcosystem);
      const result2 = calculateKnowledgePoints(mockAdaptation, [], 150, mockStableEcosystem);
      expect(result1.final_kp).toBe(result2.final_kp);
    });
  });

  describe('Forecasting Evidence', () => {
    const mockForecast: ForecastingEvidence = {
      id: 'forecast_001',
      type: 'forecasting',
      world_seed: 12345,
      tick_discovered: 175,
      player_notes: 'Predicted carnivore population increase',
      knowledge_points_awarded: 0,
      signature_hash: 'def456',
      prediction_tick: 150,
      prediction_statement: 'Carnivore population will reach 15±5 by tick 180',
      predicted_variable: 'carnivore_population',
      predicted_value: 15,
      predicted_tolerance: 5,
      forecast_window_end: 180,
      actual_value: 16,
      accuracy_percent: 93, // Very accurate
      confidence_level: 'high',
      baseline_knowledge: 'Observed rising trend for 5 ticks',
      player_reasoning: 'Prey availability suggests growth',
    };

    it('should calculate base KP for forecasting evidence', () => {
      const result = calculateKnowledgePoints(mockForecast, [], 175, null);
      expect(result.base_kp).toBeGreaterThanOrEqual(DEFAULT_KNOWLEDGE_CONSTANTS.FORECASTING_BASE_KP);
    });

    it('should apply accuracy bonus for high-accuracy forecasts', () => {
      const result = calculateKnowledgePoints(mockForecast, [], 175, mockChaoticEcosystem);
      // High accuracy (93%) should trigger bonus
      expect(result.base_kp).toBeGreaterThan(DEFAULT_KNOWLEDGE_CONSTANTS.FORECASTING_BASE_KP);
    });

    it('should apply context multiplier to forecasting', () => {
      const result = calculateKnowledgePoints(mockForecast, [], 175, mockChaoticEcosystem);
      expect(result.context_multiplier).toBe(1.1);
    });
  });

  describe('Duplication Penalties', () => {
    const mockAdaptation: AdaptationEvidence = {
      id: 'adapt_001',
      type: 'adaptation',
      world_seed: 12345,
      tick_discovered: 150,
      player_notes: 'Herbivores evolved armor',
      knowledge_points_awarded: 55, // Simulating first observation
      signature_hash: 'armor_herbivore_toxicity',
      species_id: 'herbivore_1',
      trait_name: 'armor',
      trait_change: { from: 2, to: 6 },
      frequency_percent: 76,
      generations: 3,
      environment_pressure: 'toxicity_spike',
      lineage_ids: ['lineage_1'],
    };

    const mockAdaptation2: AdaptationEvidence = {
      ...mockAdaptation,
      id: 'adapt_002',
      tick_discovered: 160, // 10 ticks later
      knowledge_points_awarded: 0, // Placeholder
    };

    const mockAdaptation3: AdaptationEvidence = {
      ...mockAdaptation,
      id: 'adapt_003',
      tick_discovered: 200, // 50 ticks later (outside window)
      knowledge_points_awarded: 0, // Placeholder
    };

    it('should apply near-identical penalty within 25 ticks', () => {
      const result = calculateKnowledgePoints(
        mockAdaptation2,
        [mockAdaptation],
        160,
        mockStableEcosystem
      );
      expect(result.duplication_penalty).toBe(DEFAULT_KNOWLEDGE_CONSTANTS.NEAR_IDENTICAL_PENALTY_PERCENT);
      expect(result.duplication_penalty).toBeLessThan(1.0);
    });

    it('should apply reduced penalty between 25-50 ticks', () => {
      const mockAdaptation2B: AdaptationEvidence = {
        ...mockAdaptation,
        id: 'adapt_002b',
        tick_discovered: 40, // 40 ticks after
        knowledge_points_awarded: 0,
      };

      const result = calculateKnowledgePoints(
        mockAdaptation2B,
        [mockAdaptation],
        40,
        mockStableEcosystem
      );
      // Should get duplication penalty (0.6)
      expect(result.duplication_penalty).toBeLessThan(1.0);
    });

    it('should apply no penalty after duplication window expires', () => {
      const result = calculateKnowledgePoints(
        mockAdaptation3,
        [mockAdaptation],
        200,
        mockStableEcosystem
      );
      expect(result.duplication_penalty).toBe(1.0); // No penalty
    });
  });

  describe('Final KP Formula', () => {
    const mockAdaptation: AdaptationEvidence = {
      id: 'adapt_001',
      type: 'adaptation',
      world_seed: 12345,
      tick_discovered: 150,
      player_notes: 'Herbivores evolved armor',
      knowledge_points_awarded: 0,
      signature_hash: 'armor_herbivore_toxicity',
      species_id: 'herbivore_1',
      trait_name: 'armor',
      trait_change: { from: 2, to: 6 },
      frequency_percent: 76,
      generations: 3,
      environment_pressure: 'toxicity_spike',
      lineage_ids: ['lineage_1'],
    };

    it('should calculate final KP = base × context × diversity × duplication × depth', () => {
      const result = calculateKnowledgePoints(
        mockAdaptation,
        [],
        150,
        mockStableEcosystem
      );

      const expected = Math.round(
        result.base_kp *
          result.context_multiplier *
          result.diversity_bonus *
          result.duplication_penalty *
          result.observation_depth_bonus
      );

      expect(result.final_kp).toBe(expected);
    });

    it('should never produce negative KP', () => {
      const result = calculateKnowledgePoints(
        mockAdaptation,
        [],
        150,
        mockStableEcosystem
      );
      expect(result.final_kp).toBeGreaterThanOrEqual(0);
    });

    it('should include breakdown explanation', () => {
      const result = calculateKnowledgePoints(
        mockAdaptation,
        [],
        150,
        mockStableEcosystem
      );
      expect(result.breakdown).toContain('KP');
      expect(result.breakdown).toContain('Base');
      expect(result.breakdown).toContain('Context');
    });
  });

  describe('Invalid Evidence Handling', () => {
    it('should reject adaptation with trait change below threshold', () => {
      const invalidAdaptation: AdaptationEvidence = {
        id: 'adapt_invalid',
        type: 'adaptation',
        world_seed: 12345,
        tick_discovered: 150,
        player_notes: 'Tiny trait change',
        knowledge_points_awarded: 0,
        signature_hash: 'noise',
        species_id: 'herbivore_1',
        trait_name: 'armor',
        trait_change: { from: 5, to: 5.1 },
        frequency_percent: 0.5, // Below 2% threshold
        generations: 1,
        environment_pressure: 'none',
        lineage_ids: [],
      };

      const result = calculateKnowledgePoints(
        invalidAdaptation,
        [],
        150,
        mockStableEcosystem
      );

      expect(result.final_kp).toBe(0);
      expect(result.breakdown).toContain('Invalid');
    });
  });
});
