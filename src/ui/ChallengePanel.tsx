/**
 * Challenge Panel Component
 *
 * UI for creating, playing, and comparing challenges.
 * Enables players to share ecosystem challenges without real-time multiplayer.
 *
 * Features:
 * - Challenge selection and creation
 * - Objective tracking
 * - Outcome export (JSON)
 * - Outcome import and comparison
 * - Privacy-safe sharing (no server required)
 */

import React, { useState, useEffect } from 'react';
import { useChallenges } from './useChallenges';
import {
  createDailyChallenge,
  serializeChallengeSummary,
  CURRENT_ENGINE_VERSION,
  type Challenge,
  type ChallengeSummary,
} from '../simulation/challenges';
import type { WorldRecipe } from './worldRecipe';
import type { SessionSummary } from './sessionSummary';
import styles from './ChallengePanel.module.css';

export interface ChallengePanelProps {
  isVisible: boolean;
  sessionSummary: SessionSummary | null;
  currentTick: number;
  currentRecipe: WorldRecipe | null;
  onStart?: (challenge: Challenge, recipe: WorldRecipe) => void;
  onExport?: (json: string) => void;
}

/**
 * Get example challenges based on current world recipe
 */
function getExampleChallenges(currentRecipe: WorldRecipe | null): Challenge[] {
  // Use current recipe if available, otherwise use a fallback
  const recipe = currentRecipe || {
    version: 1,
    seed: 12345,
    throughTick: 500,
    initialSettings: {
      baseSolarEnergy: 10,
      producerGrowthRate: 0.1,
      feedingEfficiency: 0.8,
    },
    actions: [
      {
        type: 'introduce-species',
        tick: 0,
        strategy: 'herbivore',
        origin: { x: 50, y: 50 },
        speciesId: 'starter-herbivore',
        founderCount: 3,
      },
    ],
  };
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  return [
    createDailyChallenge(
      today,
      recipe,
      `Daily Challenge: ${today}`,
      'A fresh ecosystem awaits. Can you guide a simple herbivore population to thrive for 500 ticks?',
      'easy'
    ) as Challenge,
    {
      id: 'survival-intro',
      title: 'Survival 101',
      description:
        'Introduce a herbivore species and watch it adapt. The world is harsh but fair.',
      difficulty: 'tutorial',
      recipe: { ...recipe, throughTick: 200 },
      engineVersion: CURRENT_ENGINE_VERSION,
      recipeVersion: 1,
      author: 'Origins Team',
      objectives: [
        {
          id: 'obj-survive',
          title: 'Keep at least one creature alive',
          description: 'Maintain population > 0 for the full duration',
          type: 'survive',
          targetMetric: {
            metric: 'population',
            threshold: 1,
            direction: 'increase',
          },
        },
      ],
    },
  ];
}

export default function ChallengePanel({
  isVisible,
  sessionSummary,
  currentTick,
  currentRecipe,
  onStart,
  onExport,
}: ChallengePanelProps) {
  const challenges = useChallenges();
  const [tab, setTab] = useState<'browser' | 'export' | 'import' | 'compare'>('browser');
  const [importText, setImportText] = useState('');
  const [availableChallenges, setAvailableChallenges] = useState(() => getExampleChallenges(currentRecipe));

  // Update available challenges when currentRecipe changes
  useEffect(() => {
    setAvailableChallenges(getExampleChallenges(currentRecipe));
  }, [currentRecipe]);

  if (!isVisible) {
    return null;
  }

  /**
   * Handle starting a challenge
   */
  const handleStartChallenge = (challenge: Challenge) => {
    challenges.startChallenge(challenge);
    onStart?.(challenge, challenge.recipe);
  };

  /**
   * Handle ending and exporting current challenge
   */
  const handleExportCurrent = () => {
    if (!sessionSummary || !challenges.activeChallenge) {
      alert('No active challenge to export');
      return;
    }

    const summary = challenges.endChallenge(sessionSummary, currentTick);
    if (!summary) {
      alert('Failed to build challenge summary');
      return;
    }

    const json = challenges.exportOutcome(summary);
    onExport?.(json);
    alert('Outcome exported! Copy from the text area or download.');
  };

  /**
   * Handle importing a friend's outcome
   */
  const handleImport = () => {
    if (!importText.trim()) {
      alert('Paste a challenge outcome JSON');
      return;
    }

    const success = challenges.importOutcome(importText);
    if (!success) {
      alert(`Import failed: ${challenges.comparisonError}`);
      return;
    }

    setTab('compare');
  };

  /**
   * Handle comparing outcomes
   */
  const handleCompare = () => {
    if (!challenges.exportedOutcome || !challenges.importedSummary) {
      alert('Need both your outcome and a friend\'s outcome to compare');
      return;
    }

    const myResult = JSON.parse(challenges.exportedOutcome);
    challenges.compareOutcomes(myResult, challenges.importedSummary);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3>Shared Challenges</h3>
        <p className={styles.subtitle}>
          Create, share, and compare ecosystem simulations without multiplayer.
        </p>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'browser' ? styles.active : ''}`}
          onClick={() => setTab('browser')}
        >
          Browse
        </button>
        <button
          className={`${styles.tab} ${tab === 'export' ? styles.active : ''}`}
          onClick={() => setTab('export')}
        >
          Export
        </button>
        <button
          className={`${styles.tab} ${tab === 'import' ? styles.active : ''}`}
          onClick={() => setTab('import')}
        >
          Import
        </button>
        <button
          className={`${styles.tab} ${tab === 'compare' ? styles.active : ''}`}
          onClick={() => setTab('compare')}
        >
          Compare
        </button>
      </div>

      <div className={styles.content}>
        {/* Browser Tab */}
        {tab === 'browser' && (
          <div className={styles.section}>
            <h4>Available Challenges</h4>
            <div className={styles.challengeList}>
              {availableChallenges.map((challenge) => (
                <div key={challenge.id} className={styles.challengeCard}>
                  <div className={styles.challengeInfo}>
                    <h5>{challenge.title}</h5>
                    <p>{challenge.description}</p>
                    <div className={styles.metadata}>
                      <span className={styles.difficulty}>{challenge.difficulty}</span>
                      {'date' in challenge && (
                        <span className={styles.date}>
                          {(challenge as any).date}
                        </span>
                      )}
                    </div>
                    {challenge.objectives && challenge.objectives.length > 0 && (
                      <div className={styles.objectives}>
                        <strong>Objectives:</strong>
                        <ul>
                          {challenge.objectives.map((obj) => (
                            <li key={obj.id}>{obj.title}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <button
                    className={styles.playButton}
                    onClick={() => handleStartChallenge(challenge)}
                  >
                    Play Challenge
                  </button>
                </div>
              ))}
            </div>
            <div className={styles.note}>
              <p>
                <strong>Privacy & Sharing:</strong> All challenges are deterministic. Two players
                running the same challenge with the same seed will get identical starting
                conditions. No server required — outcomes are shared as JSON files.
              </p>
            </div>
          </div>
        )}

        {/* Export Tab */}
        {tab === 'export' && (
          <div className={styles.section}>
            <h4>Export Outcome</h4>
            {challenges.activeChallenge ? (
              <>
                <p>
                  Playing: <strong>{challenges.activeChallenge.title}</strong>
                </p>
                <p>Current tick: {currentTick}</p>
                <button
                  className={styles.exportButton}
                  onClick={handleExportCurrent}
                >
                  Export This Run
                </button>
                {challenges.exportedOutcome && (
                  <div className={styles.exportOutput}>
                    <h5>Outcome JSON:</h5>
                    <textarea
                      readOnly
                      value={challenges.exportedOutcome}
                      className={styles.textarea}
                    />
                    <button
                      className={styles.copyButton}
                      onClick={() => {
                        navigator.clipboard.writeText(challenges.exportedOutcome || '');
                        alert('Copied to clipboard!');
                      }}
                    >
                      Copy to Clipboard
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className={styles.notice}>
                Start a challenge first to export an outcome.
              </p>
            )}
          </div>
        )}

        {/* Import Tab */}
        {tab === 'import' && (
          <div className={styles.section}>
            <h4>Import Friend's Outcome</h4>
            <p>Paste a friend's exported challenge outcome to compare:</p>
            <textarea
              className={styles.textarea}
              placeholder="Paste JSON outcome here..."
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <button className={styles.importButton} onClick={handleImport}>
              Import Outcome
            </button>
            {challenges.comparisonError && (
              <div className={styles.error}>{challenges.comparisonError}</div>
            )}
          </div>
        )}

        {/* Compare Tab */}
        {tab === 'compare' && (
          <div className={styles.section}>
            <h4>Compare Outcomes</h4>
            {challenges.comparison ? (
              <div className={styles.comparison}>
                <div className={styles.summary}>{challenges.comparison.summary}</div>
                <div className={styles.divergence}>
                  <h5>Divergence Type: {challenges.comparison.divergenceType}</h5>
                  {challenges.comparison.divergenceReason && (
                    <p className={styles.reason}>{challenges.comparison.divergenceReason}</p>
                  )}
                </div>
                <div className={styles.deltas}>
                  <h5>Outcome Differences:</h5>
                  <table className={styles.table}>
                    <tbody>
                      <tr>
                        <td>Final Tick</td>
                        <td>{challenges.comparison.deltas.finalTick}</td>
                      </tr>
                      <tr>
                        <td>Population</td>
                        <td>{challenges.comparison.deltas.population}</td>
                      </tr>
                      <tr>
                        <td>Active Species</td>
                        <td>{challenges.comparison.deltas.activeSpecies}</td>
                      </tr>
                      <tr>
                        <td>Peak Population</td>
                        <td>{challenges.comparison.deltas.peakPopulation}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : challenges.importedSummary ? (
              <>
                <p>Friend's outcome imported.</p>
                <button className={styles.compareButton} onClick={handleCompare}>
                  Compare with Your Outcome
                </button>
              </>
            ) : (
              <p className={styles.notice}>Import a friend's outcome first.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
