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
  createTraitFrequencyHistory,
  appendTraitFrequency,
  type TraitFrequencySummary,
  type AdaptationEvidence,
  type EvolutionaryChangeType,
  type TraitFrequencyHistory,
} from './traitFrequency';
import {
  classifyLineageTrends,
  labelToChangeType,
  DEFAULT_ADAPTATION_THRESHOLDS,
  type AdaptationLabel,
  type AdaptationThresholds,
  type TraitCohortWindow,
  type TraitTrendVerdict,
} from './adaptationEvidence';
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
  /**
   * Evidence-threshold label (#276). 'insufficient-evidence' means no
   * documented threshold was crossed — the changeType is then 'unknown',
   * never a guess.
   */
  label?: AdaptationLabel;
  /** Which documented thresholds produced (or denied) the label. */
  classificationReasons?: string[];
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

/** Cohort member snapshot taken at a window's start (used to resolve outcomes at the next window). */
interface CohortMemberStart {
  numericTraits: Record<string, number>;
  discreteValue?: string;
  offspringCount: number;
}

/** Maximum cohort windows retained per trait, matching TraitFrequencyHistory. */
const MAX_COHORT_WINDOWS = 10;

/**
 * Track adaptation metrics for all active lineages
 */
export class AdaptationMetricsTracker {
  private lineageHistories: Map<string, LineageAdaptationHistory> = new Map();
  private lastSampleTick: Map<string, number> = new Map();
  private config: AdaptationDetectionConfig;
  private thresholds: AdaptationThresholds;
  /** Cohort captured at the last sample, per lineage — outcomes resolved at the next sample. */
  private pendingCohorts: Map<
    string,
    { tick: number; members: Map<string, CohortMemberStart> }
  > = new Map();
  /** Resolved cohort windows per lineage, per trait (bounded, chronological). */
  private cohortWindows: Map<string, Record<string, TraitCohortWindow[]>> =
    new Map();

  constructor(
    config: Partial<AdaptationDetectionConfig> = {},
    thresholds: AdaptationThresholds = DEFAULT_ADAPTATION_THRESHOLDS
  ) {
    this.config = { ...DEFAULT_ADAPTATION_CONFIG, ...config };
    this.thresholds = thresholds;
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

        // Resolve the previous window's cohort against the creatures present
        // now (the FULL array — corpses still carry final offspring counters),
        // then re-capture a fresh cohort for the next window. This is what
        // gives classification real survival/reproduction outcomes to
        // correlate against instead of guesses (#276).
        this.resolveCohortWindow(key, creatures, tick);
        this.captureCohort(key, lineageCreatures, tick);

        // Evidence-threshold classification over the lineage's cohort
        // windows. Until enough windows exist this returns
        // 'insufficient-evidence' for every trait — no label is guessed.
        const verdicts = classifyLineageTrends(
          this.cohortWindows.get(key) ?? {},
          this.thresholds
        );

        // Generate adaptation evidence from recent change
        const previous =
          history.traitFrequencies.recentWindow.length >= 2
            ? history.traitFrequencies.recentWindow[
                history.traitFrequencies.recentWindow.length - 2
              ]
            : null;

        for (const trait of Object.keys(summary.traitFrequencies) as (keyof Traits)[]) {
          const verdict: TraitTrendVerdict | undefined = verdicts[trait];
          const label: AdaptationLabel = verdict?.label ?? 'insufficient-evidence';
          const changeType: EvolutionaryChangeType = labelToChangeType(label);

          if (previous) {
            const evidence = generateAdaptationEvidence(
              summary,
              previous,
              trait,
              summary.survivalRate,
              summary.reproductionRate
            );

            // Emit when the legacy confidence gate passes OR the
            // evidence-threshold classifier crossed a documented threshold.
            if (
              (evidence && evidence.confidence >= this.config.confidenceThreshold) ||
              label !== 'insufficient-evidence'
            ) {
              const observation: AdaptationObservation = {
                speciesId,
                lineageId,
                tick,
                trait,
                changeType,
                evidence,
                populationSize: summary.populationSize,
                label,
                classificationReasons: verdict?.reasons ?? [
                  'no cohort windows yet — below minWindows threshold',
                ],
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
   * Capture the alive cohort of a lineage at a window boundary. Its members'
   * outcomes are resolved at the NEXT window boundary.
   */
  private captureCohort(
    key: string,
    lineageCreatures: CreatureSnapshot[],
    tick: number
  ): void {
    const members = new Map<string, CohortMemberStart>();
    for (const creature of lineageCreatures) {
      const numericTraits: Record<string, number> = {};
      let discreteValue: string | undefined;
      for (const [trait, value] of Object.entries(creature.traits)) {
        if (typeof value === 'number') {
          numericTraits[trait] = value;
        } else if (typeof value === 'string') {
          discreteValue = value;
        }
      }
      members.set(creature.id, {
        numericTraits,
        discreteValue,
        offspringCount: creature.offspringCount ?? 0,
      });
    }
    this.pendingCohorts.set(key, { tick, members });
  }

  /**
   * Resolve the pending cohort (captured at the previous window boundary)
   * into per-trait cohort windows using the creatures present now: alive
   * means survived, dead/corpse/absent means died, and offspring counters
   * give reproduction during the window.
   */
  private resolveCohortWindow(
    key: string,
    currentCreatures: CreatureSnapshot[],
    tick: number
  ): void {
    const pending = this.pendingCohorts.get(key);
    if (!pending || pending.members.size === 0) {
      return;
    }

    const currentById = new Map(currentCreatures.map((c) => [c.id, c]));

    // Member outcomes shared across all traits of this cohort window.
    const outcomes = new Map<
      string,
      { survived: boolean; offspringDelta: number }
    >();
    for (const [id, start] of pending.members) {
      const current = currentById.get(id);
      if (current && current.lifecycleState === 'alive') {
        outcomes.set(id, {
          survived: true,
          offspringDelta: (current.offspringCount ?? 0) - start.offspringCount,
        });
      } else {
        // Dead, corpse, or fully decomposed — did not survive the window.
        // Reproduction that happened before death still counts.
        const finalCount = current?.offspringCount ?? start.offspringCount;
        outcomes.set(id, {
          survived: false,
          offspringDelta: finalCount - start.offspringCount,
        });
      }
    }

    // Assemble one window per trait that any cohort member carries.
    const traitNames = new Set<string>();
    for (const member of pending.members.values()) {
      for (const trait of Object.keys(member.numericTraits)) {
        traitNames.add(trait);
      }
    }

    const windows: Record<string, TraitCohortWindow[]> =
      this.cohortWindows.get(key) ?? {};

    for (const trait of traitNames) {
      const memberOutcomes = [];
      for (const [id, start] of pending.members) {
        if (!(trait in start.numericTraits)) continue;
        memberOutcomes.push({
          id,
          traitValue: start.numericTraits[trait],
          survived: outcomes.get(id)?.survived ?? false,
          offspringDelta: outcomes.get(id)?.offspringDelta ?? 0,
        });
      }
      if (memberOutcomes.length === 0) continue;

      const values = memberOutcomes.map((m) => m.traitValue);
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      const window: TraitCohortWindow = {
        startTick: pending.tick,
        endTick: tick,
        cohortSize: memberOutcomes.length,
        traitMean: mean,
        traitMin: Math.min(...values),
        traitMax: Math.max(...values),
        members: memberOutcomes.sort((a, b) => (a.id < b.id ? -1 : 1)),
      };
      (windows[trait] ??= []).push(window);
      if (windows[trait].length > MAX_COHORT_WINDOWS) {
        windows[trait].splice(0, windows[trait].length - MAX_COHORT_WINDOWS);
      }
    }

    // Discrete trait (energyStrategy): frequency map for mutation-appearance.
    {
      const discreteMembers = [...pending.members.entries()]
        .filter(([, start]) => start.discreteValue !== undefined)
        .sort((a, b) => (a[0] < b[0] ? -1 : 1));
      if (discreteMembers.length > 0) {
        const freq: Record<string, number> = {};
        for (const [, start] of discreteMembers) {
          const value = start.discreteValue!;
          freq[value] = (freq[value] ?? 0) + 1 / discreteMembers.length;
        }
        const window: TraitCohortWindow = {
          startTick: pending.tick,
          endTick: tick,
          cohortSize: discreteMembers.length,
          traitMean: 0,
          traitMin: 0,
          traitMax: 1,
          members: discreteMembers.map(([id, start]) => ({
            id,
            traitValue: 0,
            survived: outcomes.get(id)?.survived ?? false,
            offspringDelta: outcomes.get(id)?.offspringDelta ?? 0,
            discreteValue: start.discreteValue,
          })),
          discreteFrequency: freq,
        };
        const discreteKey = 'energyStrategy';
        (windows[discreteKey] ??= []).push(window);
        if (windows[discreteKey].length > MAX_COHORT_WINDOWS) {
          windows[discreteKey].splice(
            0,
            windows[discreteKey].length - MAX_COHORT_WINDOWS
          );
        }
      }
    }

    this.cohortWindows.set(key, windows);
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
          this.pendingCohorts.delete(key);
          this.cohortWindows.delete(key);
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
