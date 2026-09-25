/**
 * Challenge Management Hook
 *
 * Integrates the challenge framework with the simulation UI.
 * Allows players to:
 * - Create and select challenges
 * - Track progress toward objectives
 * - Export outcomes for sharing
 * - Import and compare outcomes
 */

import { useCallback, useState } from 'react';
import type { Challenge, ChallengeSummary, ChallengeComparison } from '../simulation/challenges';
import {
  buildChallengeSummary,
  compareChallengeOutcomes,
  serializeChallengeSummary,
  parseChallengeSummary,
} from '../simulation/challenges';
import type { SessionSummary } from './sessionSummary';
import type { WorldRecipe } from './worldRecipe';

export interface ChallengeSession {
  challenge: Challenge;
  startedAt: number;
  milestones: Array<{ tick: number; description: string }>;
  evidence: Array<{ tick: number; type: string; description: string }>;
}

/**
 * Hook to manage challenge state and operations
 */
export function useChallenges() {
  const [activeChallenge, setActiveChallenge] = useState<Challenge | null>(null);
  const [challengeSession, setChallengeSession] = useState<ChallengeSession | null>(null);
  const [exportedOutcome, setExportedOutcome] = useState<string | null>(null);
  const [importedSummary, setImportedSummary] = useState<ChallengeSummary | null>(null);
  const [comparison, setComparison] = useState<ChallengeComparison | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);

  /**
   * Start a new challenge session
   */
  const startChallenge = useCallback((challenge: Challenge) => {
    setActiveChallenge(challenge);
    setChallengeSession({
      challenge,
      startedAt: Date.now(),
      milestones: [],
      evidence: [],
    });
  }, []);

  /**
   * End the current challenge and build an outcome summary
   */
  const endChallenge = useCallback(
    (sessionSummary: SessionSummary, currentTick: number) => {
      if (!activeChallenge || !challengeSession) {
        return null;
      }

      const summary = buildChallengeSummary(
        activeChallenge,
        sessionSummary,
        currentTick,
        challengeSession.milestones.map((m) => ({
          tick: m.tick,
          description: m.description,
        })),
        challengeSession.evidence.map((e) => ({
          type: e.type as any,
          tick: e.tick,
          description: e.description,
        }))
      );

      return summary;
    },
    [activeChallenge, challengeSession]
  );

  /**
   * Export an outcome summary to JSON
   */
  const exportOutcome = useCallback((summary: ChallengeSummary) => {
    const json = serializeChallengeSummary(summary);
    setExportedOutcome(json);
    return json;
  }, []);

  /**
   * Import an outcome summary from JSON
   */
  const importOutcome = useCallback((jsonText: string): boolean => {
    const result = parseChallengeSummary(jsonText);
    if ('error' in result) {
      setComparisonError(result.error);
      return false;
    }
    setImportedSummary(result.summary);
    setComparisonError(null);
    return true;
  }, []);

  /**
   * Compare two outcomes
   */
  const compareOutcomes = useCallback(
    (summary1: ChallengeSummary, summary2: ChallengeSummary) => {
      const comp = compareChallengeOutcomes(summary1, summary2);
      setComparison(comp);
      return comp;
    },
    []
  );

  /**
   * Clear all challenge state
   */
  const clearChallenge = useCallback(() => {
    setActiveChallenge(null);
    setChallengeSession(null);
    setExportedOutcome(null);
    setImportedSummary(null);
    setComparison(null);
    setComparisonError(null);
  }, []);

  return {
    // State
    activeChallenge,
    challengeSession,
    exportedOutcome,
    importedSummary,
    comparison,
    comparisonError,

    // Actions
    startChallenge,
    endChallenge,
    exportOutcome,
    importOutcome,
    compareOutcomes,
    clearChallenge,
  };
}
