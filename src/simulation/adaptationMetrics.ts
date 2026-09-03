/**
 * Adaptation Metrics Integration
 * Ties trait frequency tracking into the simulation loop and provides
 * evidence-based adaptation claims for UI surfaces (timeline, lineage, journal)
 */

import type { Creature } from './creature';
import type { CreatureSnapshot, EventSnapshot } from '../state/store';
import type { SimEvent } from './events';
import {
  computeTraitFrequencies,
  generateAdaptationEvidence,
  classifyChange,
  type TraitFrequencySummary,
  type AdaptationEvidence,
  type EvolutionaryChangeType,
  createTraitFrequencyHistory,
  appendTraitFrequency,
  type TraitFrequencyHistory,
} from './traitFrequency';
import type { Traits } from '../utils/traits';

/**
 * Empirical observation of adaptation in a lineage with supporting evidence
 */
export interface AdaptationObservation {
  speciesId: string;
  lineageId: string;
  tick: number;
  trait: keyof Traits;
  changeType: EvolutionaryChangeType;
  evidence: AdaptationEvidence | null;
  populationSize: number;
}

/**
 * Lineage-specific adaptation history with time-windowed evidence
 */
export interface LineageAdaptationHistory {
  speciesId: string;
  lineageId: string;
  traitFrequencies: TraitFrequencyHistory;
  adaptationEvents: AdaptationObservation[];
  lastSummaryTick: number;
}

/**
 * Configuration for adaptation detection
 */
export interface AdaptationDetectionConfig {
  windowSize: number; // ticks between trait frequency samples
  minPopulationSize: number; // minimum creatures to report frequency
  confidenceThreshold: number; // min confidence for reporting adaptation
  divergenceThreshold: number; // min trait divergence to report as change
}

export const DEFAULT_ADAPTATION_CONFIG: AdaptationDetectionConfig = {
  windowSize: 50, // sample trait frequencies every 50 ticks
  minPopulationSize: 2, // need at least 2 creatures to compute meaningful stats
  confidenceThreshold: 0.5, // report if confidence >= 50%
  divergenceThreshold: 0.05, // report changes of 5%+ in trait distribution
};

/**
 * Track adaptation metrics for all active lineages
 */
export class AdaptationMetricsTracker {
  private lineageHistories: Map<string, LineageAdaptationHistory> = new Map();
  private lastSampleTick: Map<string, number> = new Map();
  private config: AdaptationDetectionConfig;

  constructor(config: Partial<AdaptationDetectionConfig> = {}) {
    this.config = { ...DEFAULT_ADAPTATION_CONFIG, ...config };
  }

  /**
   * Update adaptation metrics for a tick
   * Call this once per tick in the simulation loop
   */
  updateMetrics(
    tick: number,
    creatures: CreatureSnapshot[],
    _events: EventSnapshot[]
  ): AdaptationObservation[] {
    const observations: AdaptationObservation[] = [];

    // Group creatures by lineage
    const byLineage = new Map<string, CreatureSnapshot[]>();
    for (const creature of creatures) {
      if (creature.lifecycleState !== 'alive') continue;

      const key = `${creature.speciesId}:${creature.lineageId}`;
      if (!byLineage.has(key)) {
        byLineage.set(key, []);
      }
      byLineage.get(key)!.push(creature);
    }

    // Sample trait frequencies at configured interval
    for (const [key, lineageCreatures] of byLineage) {
      const lastSample = this.lastSampleTick.get(key) ?? 0;

      if (tick - lastSample >= this.config.windowSize) {
        const [speciesId, lineageId] = key.split(':');
        const summary = computeTraitFrequencies(
          lineageCreatures,
          lastSample,
          tick,
          speciesId,
          lineageId
        );

        if (!summary || summary.populationSize < this.config.minPopulationSize) {
          continue;
        }

        // Get or create lineage history
        let history = this.lineageHistories.get(key);
        if (!history) {
          history = {
            speciesId,
            lineageId,
            traitFrequencies: createTraitFrequencyHistory(),
            adaptationEvents: [],
            lastSummaryTick: lastSample,
          };
          this.lineageHistories.set(key, history);
        }

        // Append summary to bounded history
        history.traitFrequencies = appendTraitFrequency(
          history.traitFrequencies,
          summary
        );
        history.lastSummaryTick = tick;

        // Generate adaptation evidence from recent change
        const previous =
          history.traitFrequencies.recentWindow.length >= 2
            ? history.traitFrequencies.recentWindow[
                history.traitFrequencies.recentWindow.length - 2
              ]
            : null;

        if (previous) {
          for (const trait of Object.keys(summary.traitFrequencies) as (keyof Traits)[]) {
            const evidence = generateAdaptationEvidence(
              summary,
              previous,
              trait,
              summary.survivalRate,
              summary.reproductionRate
            );

            if (evidence && evidence.confidence >= this.config.confidenceThreshold) {
              const changeType = classifyChange(
                summary,
                previous,
                trait,
                summary.survivalRate,
                summary.reproductionRate
              );

              const observation: AdaptationObservation = {
                speciesId,
                lineageId,
                tick,
                trait,
                changeType,
                evidence,
                populationSize: summary.populationSize,
              };

              history.adaptationEvents.push(observation);
              observations.push(observation);
            }
          }
        }

        this.lastSampleTick.set(key, tick);
      }
    }

    return observations;
  }

  /**
   * Get adaptation history for a specific lineage
   */
  getLineageHistory(speciesId: string, lineageId: string): LineageAdaptationHistory | null {
    return this.lineageHistories.get(`${speciesId}:${lineageId}`) ?? null;
  }

  /**
   * Get recent adaptation observations for a lineage
   */
  getRecentAdaptations(
    speciesId: string,
    lineageId: string,
    lookbackTicks: number = 500
  ): AdaptationObservation[] {
    const history = this.getLineageHistory(speciesId, lineageId);
    if (!history) return [];

    const threshold = Math.max(
      0,
      (history.lastSummaryTick || 0) - lookbackTicks
    );
    return history.adaptationEvents.filter((obs) => obs.tick >= threshold);
  }

  /**
   * Get summary of adaptation types across a lineage
   */
  getAdaptationSummary(
    speciesId: string,
    lineageId: string
  ): Record<EvolutionaryChangeType, number> {
    const history = this.getLineageHistory(speciesId, lineageId);
    const summary: Record<EvolutionaryChangeType, number> = {
      drift: 0,
      'mutation-appearance': 0,
      selection: 0,
      speciation: 0,
      'neutral-shift': 0,
      unknown: 0,
    };

    if (!history) return summary;

    for (const obs of history.adaptationEvents) {
      summary[obs.changeType]++;
    }

    return summary;
  }

  /**
   * Get all active lineage histories
   */
  getAllLineageHistories(): LineageAdaptationHistory[] {
    return Array.from(this.lineageHistories.values());
  }

  /**
   * Clear old data to manage memory (call periodically)
   */
  pruneOldData(maxHistoriesPerSpecies: number = 50): void {
    const bySpecies = new Map<string, Map<string, LineageAdaptationHistory>>();

    for (const [key, history] of this.lineageHistories) {
      const speciesId = history.speciesId;
      if (!bySpecies.has(speciesId)) {
        bySpecies.set(speciesId, new Map());
      }
      bySpecies.get(speciesId)!.set(key, history);
    }

    for (const [speciesId, lineages] of bySpecies) {
      if (lineages.size > maxHistoriesPerSpecies) {
        // Sort by last update tick and remove oldest
        const sorted = Array.from(lineages.values())
          .sort((a, b) => a.lastSummaryTick - b.lastSummaryTick);

        for (let i = 0; i < sorted.length - maxHistoriesPerSpecies; i++) {
          const key = `${sorted[i].speciesId}:${sorted[i].lineageId}`;
          this.lineageHistories.delete(key);
          this.lastSampleTick.delete(key);
        }
      }
    }
  }
}

/**
 * Describe an evolutionary change in human-readable terms
 */
export function describeChange(
  observation: AdaptationObservation,
  speciesName: string,
  lineageName: string
): string {
  const traitName = observation.trait.replace(/([A-Z])/g, ' $1').toLowerCase();
  const types: Record<EvolutionaryChangeType, string> = {
    'mutation-appearance': 'A new mutation in',
    selection: 'Natural selection increased',
    drift: 'Random drift in',
    'neutral-shift': 'A shift in',
    speciation: 'Speciation event affecting',
    unknown: 'A change in',
  };

  return `${types[observation.changeType]} ${traitName} in ${lineageName} (${speciesName}) at tick ${observation.tick}`;
}

/**
 * Rate adaptation evidence quality (0-1 scale)
 * Higher = more reliable adaptation claim
 */
export function rateEvidenceQuality(evidence: AdaptationEvidence | null): number {
  if (!evidence) return 0;

  let quality = evidence.confidence; // base score

  // Boost for strong fitness correlation
  if (evidence.linkedFitness && evidence.linkedFitness > 0.7) {
    quality = Math.min(1, quality + 0.2);
  }

  // Reduce for drift
  if (evidence.evidence.includes('neutral-shift')) {
    quality = Math.max(0, quality - 0.2);
  }

  return quality;
}
