/**
 * Unit tests for Player Progress persistence
 *
 * Tests localStorage serialization, instrument unlocking, and state management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createPlayerProgress,
  savePlayerProgress,
  loadPlayerProgress,
  clearPlayerProgress,
  addEvidenceAndAwardKP,
  isInstrumentUnlocked,
  updateUnlockedInstruments,
  getUnlockedInstruments,
  estimateStorageSize,
  exportPlayerProgress,
  importPlayerProgress,
  type LocalPlayerProgress,
} from '../../state/playerProgress';
import { DEFAULT_KNOWLEDGE_CONSTANTS } from '../../constants/knowledge';
import { type AdaptationEvidence } from '../../simulation/knowledge';

describe('Player Progress Persistence', () => {
  let progress: LocalPlayerProgress;

  beforeEach(() => {
    progress = createPlayerProgress();
    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Progress Creation', () => {
    it('should create new player progress with defaults', () => {
      expect(progress.session_id).toBeDefined();
      expect(progress.created_at).toBeGreaterThan(0);
      expect(progress.last_updated_at).toBeGreaterThan(0);
      expect(progress.total_knowledge_points).toBe(0);
      expect(progress.unlocked_instruments.size).toBe(0);
      expect(progress.evidence_log).toHaveLength(0);
      expect(progress.worlds_played.size).toBe(0);
      expect(progress.field_journal).toHaveLength(0);
    });

    it('should have sensible default settings', () => {
      expect(progress.settings.show_knowledge_hints).toBe(true);
      expect(progress.settings.auto_offer_evidence).toBe(true);
    });
  });

  describe('localStorage Persistence', () => {
    it('should save player progress to localStorage', () => {
      progress.total_knowledge_points = 150;
      progress.unlocked_instruments.add('overlays');

      const saved = savePlayerProgress(progress);
      expect(saved).toBe(true);

      const json = localStorage.getItem('origins_player_progress');
      expect(json).toBeDefined();
      expect(json).toContain('150');
      expect(json).toContain('overlays');
    });

    it('should load player progress from localStorage', () => {
      progress.total_knowledge_points = 200;
      progress.unlocked_instruments.add('branch_checkpoint');
      savePlayerProgress(progress);

      const loaded = loadPlayerProgress();
      expect(loaded).toBeDefined();
      expect(loaded?.total_knowledge_points).toBe(200);
      expect(loaded?.unlocked_instruments.has('branch_checkpoint')).toBe(true);
    });

    it('should preserve session ID across save/load', () => {
      const originalSessionId = progress.session_id;
      savePlayerProgress(progress);

      const loaded = loadPlayerProgress();
      expect(loaded?.session_id).toBe(originalSessionId);
    });

    it('should return null if no progress saved', () => {
      localStorage.clear();
      const loaded = loadPlayerProgress();
      expect(loaded).toBeNull();
    });

    it('should clear player progress', () => {
      savePlayerProgress(progress);
      expect(localStorage.getItem('origins_player_progress')).toBeDefined();

      const cleared = clearPlayerProgress();
      expect(cleared).toBe(true);
      expect(localStorage.getItem('origins_player_progress')).toBeNull();
    });
  });

  describe('Instrument Unlocking', () => {
    it('should unlock instruments at KP thresholds', () => {
      progress.total_knowledge_points = 100;
      updateUnlockedInstruments(progress);
      expect(progress.unlocked_instruments.has('stability_meter')).toBe(true);
      expect(progress.unlocked_instruments.has('watchlist')).toBe(true);
    });

    it('should unlock Field Journal Export at 150 KP', () => {
      progress.total_knowledge_points = 150;
      updateUnlockedInstruments(progress);
      expect(progress.unlocked_instruments.has('export')).toBe(true);
    });

    it('should unlock Overlays at 200 KP', () => {
      progress.total_knowledge_points = 200;
      updateUnlockedInstruments(progress);
      expect(progress.unlocked_instruments.has('overlays')).toBe(true);
    });

    it('should unlock Branch Checkpoint at 250 KP', () => {
      progress.total_knowledge_points = 250;
      updateUnlockedInstruments(progress);
      expect(progress.unlocked_instruments.has('branch_checkpoint')).toBe(true);
    });

    it('should unlock Scenario Builder at 500 KP', () => {
      progress.total_knowledge_points = 500;
      updateUnlockedInstruments(progress);
      expect(progress.unlocked_instruments.has('scenario_builder')).toBe(true);
    });

    it('should unlock Scenario Library at 600 KP', () => {
      progress.total_knowledge_points = 600;
      updateUnlockedInstruments(progress);
      expect(progress.unlocked_instruments.has('scenario_library')).toBe(true);
    });

    it('should support checking if instrument is unlocked', () => {
      progress.total_knowledge_points = 200;
      updateUnlockedInstruments(progress);
      expect(isInstrumentUnlocked(progress, 'overlays')).toBe(true);
      expect(isInstrumentUnlocked(progress, 'scenario_builder')).toBe(false);
    });

    it('should progressively unlock as KP increases', () => {
      // Start at 0
      expect(getUnlockedInstruments(progress)).toHaveLength(0);

      // 100 KP
      progress.total_knowledge_points = 100;
      updateUnlockedInstruments(progress);
      expect(getUnlockedInstruments(progress)).toHaveLength(2); // stability_meter, watchlist

      // 300 KP
      progress.total_knowledge_points = 300;
      updateUnlockedInstruments(progress);
      const unlocked = getUnlockedInstruments(progress);
      expect(unlocked).toContain('export');
      expect(unlocked).toContain('overlays');
      expect(unlocked).toContain('frequency_chart');
    });
  });

  describe('Evidence Management', () => {
    it('should add evidence and award KP', () => {
      const mockEvidence: AdaptationEvidence = {
        id: 'adapt_001',
        type: 'adaptation',
        world_seed: 12345,
        tick_discovered: 150,
        player_notes: 'Test adaptation',
        knowledge_points_awarded: 55,
        signature_hash: 'test_hash',
        species_id: 'herbivore_1',
        trait_name: 'armor',
        trait_change: { from: 2, to: 6 },
        frequency_percent: 76,
        generations: 3,
        environment_pressure: 'toxicity_spike',
        lineage_ids: ['lineage_1'],
      };

      expect(progress.total_knowledge_points).toBe(0);
      addEvidenceAndAwardKP(progress, mockEvidence);
      expect(progress.total_knowledge_points).toBe(55);
      expect(progress.evidence_log).toHaveLength(1);
    });

    it('should accumulate KP from multiple evidence', () => {
      const evidence1: AdaptationEvidence = {
        id: 'adapt_001',
        type: 'adaptation',
        world_seed: 12345,
        tick_discovered: 150,
        player_notes: 'First adaptation',
        knowledge_points_awarded: 60,
        signature_hash: 'hash1',
        species_id: 'herbivore_1',
        trait_name: 'armor',
        trait_change: { from: 2, to: 6 },
        frequency_percent: 76,
        generations: 3,
        environment_pressure: 'toxicity_spike',
        lineage_ids: ['lineage_1'],
      };

      const evidence2: AdaptationEvidence = {
        ...evidence1,
        id: 'adapt_002',
        tick_discovered: 200,
        knowledge_points_awarded: 50,
        signature_hash: 'hash2',
      };

      addEvidenceAndAwardKP(progress, evidence1);
      addEvidenceAndAwardKP(progress, evidence2);

      expect(progress.total_knowledge_points).toBe(110);
      expect(progress.evidence_log).toHaveLength(2);
    });

    it('should trigger instrument unlock when adding evidence', () => {
      const mockEvidence: AdaptationEvidence = {
        id: 'adapt_001',
        type: 'adaptation',
        world_seed: 12345,
        tick_discovered: 150,
        player_notes: 'Test adaptation',
        knowledge_points_awarded: 150, // Enough to unlock export
        signature_hash: 'test_hash',
        species_id: 'herbivore_1',
        trait_name: 'armor',
        trait_change: { from: 2, to: 6 },
        frequency_percent: 76,
        generations: 3,
        environment_pressure: 'toxicity_spike',
        lineage_ids: ['lineage_1'],
      };

      addEvidenceAndAwardKP(progress, mockEvidence);
      expect(progress.unlocked_instruments.has('export')).toBe(true);
    });
  });

  describe('Storage Estimation', () => {
    it('should estimate storage size', () => {
      const size = estimateStorageSize(progress);
      expect(size).toBeGreaterThan(0);
      expect(typeof size).toBe('number');
    });

    it('should increase storage size with more evidence', () => {
      const size1 = estimateStorageSize(progress);

      const mockEvidence: AdaptationEvidence = {
        id: 'adapt_001',
        type: 'adaptation',
        world_seed: 12345,
        tick_discovered: 150,
        player_notes: 'Test adaptation with long description about the ecosystem',
        knowledge_points_awarded: 50,
        signature_hash: 'test_hash',
        species_id: 'herbivore_1',
        trait_name: 'armor',
        trait_change: { from: 2, to: 6 },
        frequency_percent: 76,
        generations: 3,
        environment_pressure: 'toxicity_spike',
        lineage_ids: ['lineage_1'],
      };

      progress.evidence_log.push(mockEvidence);
      const size2 = estimateStorageSize(progress);

      expect(size2).toBeGreaterThan(size1);
    });
  });

  describe('Export/Import', () => {
    it('should export player progress as JSON', () => {
      progress.total_knowledge_points = 150;
      progress.unlocked_instruments.add('overlays');

      const json = exportPlayerProgress(progress);
      expect(json).toBeDefined();
      expect(json).toContain('150');
      expect(json).toContain('overlays');
      expect(json).toContain('session_id');
    });

    it('should import player progress from JSON', () => {
      progress.total_knowledge_points = 200;
      progress.unlocked_instruments.add('branch_checkpoint');

      const json = exportPlayerProgress(progress);
      const imported = importPlayerProgress(json);

      expect(imported).toBeDefined();
      expect(imported?.total_knowledge_points).toBe(200);
      expect(imported?.unlocked_instruments.has('branch_checkpoint')).toBe(true);
    });

    it('should preserve state through export/import round-trip', () => {
      progress.total_knowledge_points = 350;
      progress.unlocked_instruments.add('overlays');
      progress.unlocked_instruments.add('forecast_dashboard');

      const json = exportPlayerProgress(progress);
      const imported = importPlayerProgress(json);

      expect(imported?.total_knowledge_points).toBe(350);
      expect(imported?.unlocked_instruments.size).toBe(2);
      expect(imported?.session_id).toBe(progress.session_id);
    });

    it('should handle invalid JSON on import', () => {
      const imported = importPlayerProgress('invalid json {]');
      expect(imported).toBeNull();
    });
  });

  describe('Cross-World Progression', () => {
    it('should persist progress across world seeds', () => {
      // Simulate playing World 1
      progress.total_knowledge_points = 100;
      progress.worlds_played.set(12345, {
        world_seed: 12345,
        world_name: 'World 1',
        created_at: Date.now(),
        last_played_at: Date.now(),
        final_tick: 150,
        final_species_count: 3,
        interventions_count: 2,
        evidence_collected: ['adapt_001'],
      });

      savePlayerProgress(progress);

      // Simulate playing World 2 with new progress
      const loaded = loadPlayerProgress()!;
      loaded.total_knowledge_points = 200;
      loaded.worlds_played.set(54321, {
        world_seed: 54321,
        world_name: 'World 2',
        created_at: Date.now(),
        last_played_at: Date.now(),
        final_tick: 200,
        final_species_count: 5,
        interventions_count: 3,
        evidence_collected: ['adapt_002', 'forecast_001'],
      });

      savePlayerProgress(loaded);

      // Verify both worlds in progress
      const final = loadPlayerProgress()!;
      expect(final.total_knowledge_points).toBe(200);
      expect(final.worlds_played.size).toBe(2);
      expect(final.worlds_played.has(12345)).toBe(true);
      expect(final.worlds_played.has(54321)).toBe(true);
    });
  });
});
