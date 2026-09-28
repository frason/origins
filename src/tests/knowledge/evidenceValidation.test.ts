/**
 * Unit tests for Evidence Validation
 *
 * Tests ecological validity thresholds and anti-farming detection.
 * Ensures invalid/trivial observations are rejected.
 */

import { describe, it, expect } from 'vitest';
import {
  validateEvidence,
  hashEvidenceSignature,
  type AdaptationEvidence,
  type CausalInvestigationEvidence,
  type LineageDiscoveryEvidence,
  type ForecastingEvidence,
} from '../../simulation/knowledge';
import { DEFAULT_KNOWLEDGE_CONSTANTS } from '../../constants/knowledge';

describe('Evidence Validation', () => {
  describe('Adaptation Evidence Validation', () => {
    const validAdaptation: AdaptationEvidence = {
      id: 'adapt_001',
      type: 'adaptation',
      world_seed: 12345,
      tick_discovered: 150,
      player_notes: 'Herbivores evolved armor',
      knowledge_points_awarded: 55,
      signature_hash: 'hash1',
      species_id: 'herbivore_1',
      trait_name: 'armor',
      trait_change: { from: 2, to: 6 },
      frequency_percent: 76,
      generations: 3,
      environment_pressure: 'toxicity_spike',
      lineage_ids: ['lineage_1'],
    };

    it('should validate valid adaptation evidence', () => {
      const result = validateEvidence(validAdaptation);
      expect(result.valid).toBe(true);
    });

    it('should reject adaptation below trait change threshold', () => {
      const invalid: AdaptationEvidence = {
        ...validAdaptation,
        frequency_percent: 1.5, // Below 2% threshold
      };

      const result = validateEvidence(invalid);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('below minimum');
    });

    it('should reject adaptation with insufficient generations', () => {
      const invalid: AdaptationEvidence = {
        ...validAdaptation,
        generations: 1, // Below 2 generations
      };

      const result = validateEvidence(invalid);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('generations');
    });

    it('should accept adaptation at exactly threshold', () => {
      const borderline: AdaptationEvidence = {
        ...validAdaptation,
        frequency_percent: 2.0, // At threshold
        generations: 2, // At minimum
      };

      const result = validateEvidence(borderline);
      expect(result.valid).toBe(true);
    });
  });

  describe('Causal Investigation Validation', () => {
    const validInvestigation: CausalInvestigationEvidence = {
      id: 'causal_001',
      type: 'causal_investigation',
      world_seed: 12345,
      tick_discovered: 175,
      player_notes: 'Nutrient intervention increased population',
      knowledge_points_awarded: 75,
      signature_hash: 'hash2',
      intervention_tick: 150,
      intervention_x: 50,
      intervention_y: 50,
      intervention_type: 'add_nutrients',
      intervention_amount: 20,
      baseline_snapshot: { energy: 100, population: 10, toxicity: 5 },
      outcome_tick_10: { energy: 85, population: 12, toxicity: 5 },
      outcome_tick_25: { energy: 70, population: 14, toxicity: 5 },
      outcome_summary: 'Population increased 40%',
    };

    it('should validate valid causal investigation', () => {
      const result = validateEvidence(validInvestigation);
      expect(result.valid).toBe(true);
    });

    it('should reject investigation with insufficient outcome change', () => {
      const invalid: CausalInvestigationEvidence = {
        ...validInvestigation,
        outcome_tick_25: { energy: 99, population: 10.3, toxicity: 5 }, // Only 3% change
      };

      const result = validateEvidence(invalid);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('below minimum');
    });

    it('should accept intervention at exactly threshold', () => {
      const borderline: CausalInvestigationEvidence = {
        ...validInvestigation,
        outcome_tick_25: { energy: 95, population: 10.5, toxicity: 5 }, // 5% change
      };

      const result = validateEvidence(borderline);
      expect(result.valid).toBe(true);
    });
  });

  describe('Lineage Discovery Validation', () => {
    const validLineage: LineageDiscoveryEvidence = {
      id: 'lineage_001',
      type: 'lineage_discovery',
      world_seed: 12345,
      tick_discovered: 200,
      player_notes: 'Tracked niche specialization',
      knowledge_points_awarded: 225,
      signature_hash: 'hash3',
      lineage_id: 'founder_carnivore_001',
      species_id: 'carnivore_1',
      founder_tick: 0,
      duration_ticks: 250,
      total_individuals: 12,
      specialization_type: 'niche',
      specialization_description: 'Adapted to scavenging in toxicity zones',
      milestone_ticks: [50, 100, 150, 200],
    };

    it('should validate valid lineage evidence', () => {
      const result = validateEvidence(validLineage);
      expect(result.valid).toBe(true);
    });

    it('should reject lineage with insufficient population', () => {
      const invalid: LineageDiscoveryEvidence = {
        ...validLineage,
        total_individuals: 1, // Below 2 threshold
      };

      const result = validateEvidence(invalid);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('size');
    });

    it('should reject lineage with insufficient duration', () => {
      const invalid: LineageDiscoveryEvidence = {
        ...validLineage,
        duration_ticks: 5, // Below 10 ticks
      };

      const result = validateEvidence(invalid);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('duration');
    });

    it('should reject lineage without specialization', () => {
      const invalid: LineageDiscoveryEvidence = {
        ...validLineage,
        specialization_type: null, // No specialization
      };

      const result = validateEvidence(invalid);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('specialization');
    });

    it('should accept lineage at exactly thresholds', () => {
      const borderline: LineageDiscoveryEvidence = {
        ...validLineage,
        total_individuals: 2, // At minimum
        duration_ticks: 10, // At minimum
      };

      const result = validateEvidence(borderline);
      expect(result.valid).toBe(true);
    });
  });

  describe('Forecasting Evidence Validation', () => {
    const validForecast: ForecastingEvidence = {
      id: 'forecast_001',
      type: 'forecasting',
      world_seed: 12345,
      tick_discovered: 175,
      player_notes: 'Prediction validated',
      knowledge_points_awarded: 198,
      signature_hash: 'hash4',
      prediction_tick: 150,
      prediction_statement: 'Carnivore population will reach 15±5 by tick 180',
      predicted_variable: 'carnivore_population',
      predicted_value: 15,
      predicted_tolerance: 5,
      forecast_window_end: 180,
      actual_value: 16,
      accuracy_percent: 93,
      confidence_level: 'high',
      baseline_knowledge: 'Observed rising trend',
    };

    it('should validate valid forecast evidence', () => {
      const result = validateEvidence(validForecast);
      expect(result.valid).toBe(true);
    });

    it('should reject forecast with excessive tolerance', () => {
      const invalid: ForecastingEvidence = {
        ...validForecast,
        predicted_tolerance: 25, // Exceeds 20% threshold
      };

      const result = validateEvidence(invalid);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('tolerance');
    });

    it('should reject forecast with accuracy > 100%', () => {
      const invalid: ForecastingEvidence = {
        ...validForecast,
        accuracy_percent: 150, // Invalid
      };

      const result = validateEvidence(invalid);
      expect(result.valid).toBe(false);
    });

    it('should accept forecast at exactly threshold', () => {
      const borderline: ForecastingEvidence = {
        ...validForecast,
        predicted_tolerance: 20, // At threshold
      };

      const result = validateEvidence(borderline);
      expect(result.valid).toBe(true);
    });
  });

  describe('Signature Hashing for Duplication', () => {
    const adaptation1: AdaptationEvidence = {
      id: 'adapt_001',
      type: 'adaptation',
      world_seed: 12345,
      tick_discovered: 150,
      player_notes: 'First observation',
      knowledge_points_awarded: 55,
      signature_hash: '',
      species_id: 'herbivore_1',
      trait_name: 'armor',
      trait_change: { from: 2, to: 6 },
      frequency_percent: 76,
      generations: 3,
      environment_pressure: 'toxicity_spike',
      lineage_ids: ['lineage_1'],
    };

    const adaptation2: AdaptationEvidence = {
      ...adaptation1,
      id: 'adapt_002',
      tick_discovered: 160,
      player_notes: 'Similar observation',
      signature_hash: '',
    };

    it('should create deterministic signature hash', () => {
      const hash1 = hashEvidenceSignature(adaptation1);
      const hash2 = hashEvidenceSignature(adaptation1);
      expect(hash1).toBe(hash2); // Deterministic
    });

    it('should create same hash for identical evidence', () => {
      const hash1 = hashEvidenceSignature(adaptation1);
      const hash2 = hashEvidenceSignature(adaptation2);
      expect(hash1).toBe(hash2); // Same species, trait, environment
    });

    it('should create different hash for different traits', () => {
      const modified: AdaptationEvidence = {
        ...adaptation1,
        trait_name: 'speed', // Different trait
      };

      const hash1 = hashEvidenceSignature(adaptation1);
      const hash2 = hashEvidenceSignature(modified);
      expect(hash1).not.toBe(hash2);
    });

    it('should create different hash for different environment', () => {
      const modified: AdaptationEvidence = {
        ...adaptation1,
        environment_pressure: 'food_scarcity', // Different pressure
      };

      const hash1 = hashEvidenceSignature(adaptation1);
      const hash2 = hashEvidenceSignature(modified);
      expect(hash1).not.toBe(hash2);
    });

    it('should create different hash for different evidence types', () => {
      const causal: CausalInvestigationEvidence = {
        id: 'causal_001',
        type: 'causal_investigation',
        world_seed: 12345,
        tick_discovered: 150,
        player_notes: 'Test',
        knowledge_points_awarded: 75,
        signature_hash: '',
        intervention_tick: 150,
        intervention_x: 50,
        intervention_y: 50,
        intervention_type: 'add_nutrients',
        intervention_amount: 20,
        baseline_snapshot: { energy: 100, population: 10 },
        outcome_tick_10: { energy: 85, population: 12 },
        outcome_tick_25: { energy: 70, population: 14 },
        outcome_summary: 'Test',
      };

      const hashAdapt = hashEvidenceSignature(adaptation1);
      const hashCausal = hashEvidenceSignature(causal);
      expect(hashAdapt).not.toBe(hashCausal);
    });
  });

  describe('Anti-Farming Thresholds', () => {
    it('should use configurable constants for validation', () => {
      expect(DEFAULT_KNOWLEDGE_CONSTANTS.TRAIT_CHANGE_MIN_PERCENT).toBe(2.0);
      expect(DEFAULT_KNOWLEDGE_CONSTANTS.POPULATION_CHANGE_MIN_PERCENT).toBe(5.0);
      expect(DEFAULT_KNOWLEDGE_CONSTANTS.LINEAGE_MIN_SIZE).toBe(2);
      expect(DEFAULT_KNOWLEDGE_CONSTANTS.LINEAGE_MIN_DURATION_TICKS).toBe(10);
      expect(DEFAULT_KNOWLEDGE_CONSTANTS.FORECAST_TOLERANCE_MAX_PERCENT).toBe(20);
    });

    it('should allow custom constants for validation', () => {
      const customConstants = { ...DEFAULT_KNOWLEDGE_CONSTANTS, TRAIT_CHANGE_MIN_PERCENT: 5.0 };

      const adaptation: AdaptationEvidence = {
        id: 'adapt_001',
        type: 'adaptation',
        world_seed: 12345,
        tick_discovered: 150,
        player_notes: 'Test',
        knowledge_points_awarded: 55,
        signature_hash: 'hash',
        species_id: 'herbivore_1',
        trait_name: 'armor',
        trait_change: { from: 2, to: 6 },
        frequency_percent: 3.0, // Below custom threshold but above default
        generations: 3,
        environment_pressure: 'toxicity_spike',
        lineage_ids: ['lineage_1'],
      };

      // Should fail with custom constants
      const resultCustom = validateEvidence(adaptation, customConstants);
      expect(resultCustom.valid).toBe(false);

      // Should pass with default constants
      const resultDefault = validateEvidence(adaptation);
      expect(resultDefault.valid).toBe(true);
    });
  });
});
