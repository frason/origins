/**
 * Trait Frequency Tracking for Evolution Truth
 * Measures trait spread within lineages and generates evidence-based adaptation labels
 *
 * Core idea: Show natural selection as measurable changes within lineages rather than
 * relying only on births, mutation counts, or species labels.
 */

import type { Creature } from './creature';
import type { CreatureSnapshot } from '../state/store';
import type { SimEvent } from './events';
import type { Traits } from '../utils/traits';

/**
 * A bounded summary of trait frequencies within a lineage at a specific time window.
 * Used to detect trait spread (selection) vs. random drift.
 */
export interface TraitFrequencySummary {
  speciesId: string;
  lineageId: string;
  startTick: number;
  endTick: number;
  populationSize: number;
  sampleSize: number; // how many individuals sampled (≤ populationSize)
  traitFrequencies: Record<string, TraitDistribution>;
  survivalRate?: number; // fraction of individuals that survived to next window
  reproductionRate?: number; // offspring per individual in this window
  fitnessShift?: number; // relative change in avg fitness vs parent lineage
}

/**
 * Distribution snapshot for a single trait within a time window
 */
export interface TraitDistribution {
  mean: number;
  median: number;
  min: number;
  max: number;
  variance: number;
  frequency?: Record<string | number, number>; // for discrete traits
}

/**
 * Evidence-based adaptation label with confidence and supporting data
 */
export interface AdaptationEvidence {
  speciesId: string;
  lineageId: string;
  trait: keyof Traits;
  startTick: number;
  endTick: number;
  direction: 'increase' | 'decrease' | 'shift';
  magnitude: number; // 0-1 normalized change
  confidence: number; // 0-1; 1.0 = mutation appearance, 0.5-0.9 = selection, <0.5 = drift
  evidence: AdaptationEvidenceReason[];
  linkedFitness?: number; // correlation with survival or reproduction
}

export type AdaptationEvidenceReason =
  | 'mutation-appearance' // trait first observed in this window
  | 'frequency-increase' // trait became more common
  | 'frequency-decrease' // trait became less common
  | 'survival-linked' // trait correlates with survival
  | 'reproduction-linked' // trait correlates with reproduction
  | 'all-individuals-carry' // trait fixed in population
  | 'none-individuals-carry' // trait lost from population
  | 'neutral-shift'; // change with no fitness correlation (drift)

/**
 * Classification of an evolutionary change
 */
export type EvolutionaryChangeType =
  | 'drift' // random change in trait frequency
  | 'mutation-appearance' // new mutation first seen
  | 'selection' // directional change linked to fitness
  | 'speciation' // lineage diverges beyond threshold
  | 'neutral-shift' // change in frequency but no fitness effect
  | 'unknown'; // insufficient data to classify

/**
 * Compute trait frequencies for a lineage in a time window
 */
export function computeTraitFrequencies(
  lineageCreatures: CreatureSnapshot[],
  startTick: number,
  endTick: number,
  speciesId: string,
  lineageId: string
): TraitFrequencySummary | null {
  if (lineageCreatures.length === 0) return null;

  const sampleSize = lineageCreatures.length;
  const frequencies: Record<string, TraitDistribution> = {};
  const traitKeys = lineageCreatures[0].traits
    ? (Object.keys(lineageCreatures[0].traits) as (keyof Traits)[])
    : [];

  for (const trait of traitKeys) {
    const values: number[] = [];
    const discreteValues = new Map<string | number, number>();

    for (const creature of lineageCreatures) {
      const value = creature.traits[trait];
      if (typeof value === 'number') {
        values.push(value);
      } else if (typeof value === 'string') {
        discreteValues.set(value, (discreteValues.get(value) ?? 0) + 1);
      }
    }

    if (values.length > 0) {
      values.sort((a, b) => a - b);
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      const median = values[Math.floor(values.length / 2)];
      const variance =
        values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;

      frequencies[trait] = {
        mean,
        median,
        min: Math.min(...values),
        max: Math.max(...values),
        variance,
      };
    } else if (discreteValues.size > 0) {
      const freqMap: Record<string | number, number> = {};
      for (const [val, count] of discreteValues) {
        freqMap[val] = count / sampleSize;
      }
      frequencies[trait] = {
        mean: 0,
        median: 0,
        min: 0,
        max: 1,
        variance: 0,
        frequency: freqMap,
      };
    }
  }

  return {
    speciesId,
    lineageId,
    startTick,
    endTick,
    populationSize: sampleSize,
    sampleSize,
    traitFrequencies: frequencies,
  };
}

/**
 * Measure trait divergence between two frequency summaries
 * Returns normalized distance [0, 1]
 */
export function measureTraitDivergence(
  summary1: TraitFrequencySummary,
  summary2: TraitFrequencySummary
): number {
  const divergences: number[] = [];

  for (const trait of Object.keys(summary1.traitFrequencies)) {
    if (!(trait in summary2.traitFrequencies)) continue;

    const dist1 = summary1.traitFrequencies[trait];
    const dist2 = summary2.traitFrequencies[trait];

    if (dist1.frequency && dist2.frequency) {
      // Discrete trait: measure maximum frequency shift for any value
      let maxShift = 0;
      for (const value of new Set([
        ...Object.keys(dist1.frequency),
        ...Object.keys(dist2.frequency),
      ])) {
        const shift = Math.abs((dist1.frequency[value] ?? 0) - (dist2.frequency[value] ?? 0));
        maxShift = Math.max(maxShift, shift);
      }
      divergences.push(maxShift);
    } else if (!dist1.frequency && !dist2.frequency) {
      // Continuous trait: measure relative change in mean
      // Use the range to normalize
      const range = Math.max(0.1, dist2.max - dist2.min, dist1.max - dist1.min);
      const meanDiff = Math.abs(dist2.mean - dist1.mean);
      const relativeDiff = Math.min(1, meanDiff / range);
      divergences.push(relativeDiff);
    }
  }

  // Return average divergence across all traits
  return divergences.length > 0
    ? divergences.reduce((a, b) => a + b, 0) / divergences.length
    : 0;
}

/**
 * Detect if a trait is new to the lineage (mutation appearance)
 */
export function isMutationAppearance(
  trait: keyof Traits,
  summary: TraitFrequencySummary,
  previousSummary: TraitFrequencySummary | null
): boolean {
  if (!previousSummary) return true; // first window, can't distinguish

  const current = summary.traitFrequencies[trait];
  const previous = previousSummary.traitFrequencies[trait];

  if (!current || !previous) return false;

  // For discrete traits, check if a value wasn't present before
  if (current.frequency && previous.frequency) {
    for (const value of Object.keys(current.frequency)) {
      if (!(value in previous.frequency)) return true;
    }
  }

  return false;
}

/**
 * Classify an evolutionary change based on frequency and fitness data
 */
export function classifyChange(
  current: TraitFrequencySummary,
  previous: TraitFrequencySummary | null,
  trait: keyof Traits,
  survivalDelta?: number,
  reproductionDelta?: number
): EvolutionaryChangeType {
  if (!previous) return 'unknown'; // need baseline for classification

  const currentDist = current.traitFrequencies[trait];
  const previousDist = previous.traitFrequencies[trait];

  if (!currentDist || !previousDist) return 'unknown';

  // Check for mutation appearance
  if (isMutationAppearance(trait, current, previous)) {
    return 'mutation-appearance';
  }

  // Check for fitness correlation
  const hasSurvivalCorr = survivalDelta !== undefined && Math.abs(survivalDelta) > 0.1;
  const hasReproductionCorr =
    reproductionDelta !== undefined && Math.abs(reproductionDelta) > 0.15;

  if (hasSurvivalCorr || hasReproductionCorr) {
    return 'selection';
  }

  // Check for neutral shift (frequency change but no fitness effect)
  const divergence = measureTraitDivergence(current, previous);
  if (divergence > 0.15) {
    return 'neutral-shift';
  }

  // Small frequency change with no fitness correlation = drift
  return 'drift';
}

/**
 * Generate evidence-based adaptation labels for trait changes
 */
export function generateAdaptationEvidence(
  current: TraitFrequencySummary,
  previous: TraitFrequencySummary | null,
  trait: keyof Traits,
  survivalRate?: number,
  reproductionRate?: number
): AdaptationEvidence | null {
  if (!previous) return null; // need baseline

  const currentDist = current.traitFrequencies[trait];
  const previousDist = previous.traitFrequencies[trait];

  if (!currentDist || !previousDist) return null;

  const evidence: AdaptationEvidenceReason[] = [];
  let direction: 'increase' | 'decrease' | 'shift' = 'shift';
  let magnitude = 0;

  // Detect direction and magnitude
  if (currentDist.frequency && previousDist.frequency) {
    // Discrete trait
    let maxFreqShift = 0;
    let shiftedValue: string | null = null;

    for (const value of Object.keys(currentDist.frequency)) {
      const prev = previousDist.frequency[value] ?? 0;
      const curr = currentDist.frequency[value];
      const shift = curr - prev;
      if (Math.abs(shift) > maxFreqShift) {
        maxFreqShift = Math.abs(shift);
        shiftedValue = value;
        direction = shift > 0 ? 'increase' : 'decrease';
      }
    }
    magnitude = Math.min(1, Math.abs(maxFreqShift));
  } else if (!currentDist.frequency && !previousDist.frequency) {
    // Continuous trait
    const meanChange = currentDist.mean - previousDist.mean;
    magnitude = Math.min(
      1,
      Math.abs(meanChange) / Math.max(0.1, Math.abs(previousDist.mean))
    );
    direction = meanChange > 0 ? 'increase' : 'decrease';
  }

  // Check for mutation appearance
  if (isMutationAppearance(trait, current, previous)) {
    evidence.push('mutation-appearance');
  }

  // Frequency changes
  if (magnitude > 0.1) {
    evidence.push(direction === 'increase' ? 'frequency-increase' : 'frequency-decrease');
  }

  // Check for fixation or loss
  if (currentDist.frequency) {
    for (const [value, freq] of Object.entries(currentDist.frequency)) {
      if (freq > 0.99) {
        evidence.push('all-individuals-carry');
      } else if (freq < 0.01 && ((previousDist.frequency?.[value]) ?? 0) > 0.01) {
        evidence.push('none-individuals-carry');
      }
    }
  }

  // Fitness correlation
  let linkedFitness: number | undefined;
  if (survivalRate !== undefined && survivalRate > 0.5) {
    evidence.push('survival-linked');
    linkedFitness = survivalRate;
  }
  if (reproductionRate !== undefined && reproductionRate > 0.5) {
    evidence.push('reproduction-linked');
    linkedFitness = linkedFitness !== undefined ? (linkedFitness + reproductionRate) / 2 : reproductionRate;
  }

  // Confidence score
  let confidence = 0.3; // base confidence
  if (evidence.includes('mutation-appearance')) confidence = 1.0;
  else if (evidence.includes('survival-linked') || evidence.includes('reproduction-linked'))
    confidence = 0.75;
  else if (magnitude > 0.3) confidence = 0.55;
  else confidence = 0.35;

  return {
    speciesId: current.speciesId,
    lineageId: current.lineageId,
    trait,
    startTick: current.startTick,
    endTick: current.endTick,
    direction,
    magnitude,
    confidence,
    evidence: evidence.length > 0 ? evidence : ['neutral-shift'],
    linkedFitness,
  };
}

/**
 * Bounded storage for trait frequency history
 * Keeps recent summaries at high resolution, older data at lower resolution
 */
export interface TraitFrequencyHistory {
  recentWindow: TraitFrequencySummary[]; // last 10 windows at full resolution
  compressedArchive: CompressedTraitHistory[]; // older data, thinned
  maxRecentWindows: number;
  compressionRatio: number;
}

export interface CompressedTraitHistory {
  startTick: number;
  endTick: number;
  avgPopulationSize: number;
  summarizedTraits: Record<string, TraitDistribution>; // mean of distributions
}

/**
 * Add a new summary, compressing old data if needed
 */
export function appendTraitFrequency(
  history: TraitFrequencyHistory,
  summary: TraitFrequencySummary,
  maxRecentWindows: number = 10
): TraitFrequencyHistory {
  const recent = [...history.recentWindow, summary];

  // Compress old data when recent window fills
  if (recent.length > maxRecentWindows) {
    const toCompress = recent.splice(0, Math.floor(maxRecentWindows * 0.5));
    const compressed = compressTraitSummaries(toCompress);
    const archive = [...history.compressedArchive, compressed];

    // Prune very old archives (keep last 100)
    if (archive.length > 100) {
      archive.splice(0, archive.length - 100);
    }

    return { ...history, recentWindow: recent, compressedArchive: archive };
  }

  return { ...history, recentWindow: recent };
}

/**
 * Compress a batch of trait summaries into one compressed record
 */
function compressTraitSummaries(summaries: TraitFrequencySummary[]): CompressedTraitHistory {
  if (summaries.length === 0) {
    return {
      startTick: 0,
      endTick: 0,
      avgPopulationSize: 0,
      summarizedTraits: {},
    };
  }

  const startTick = summaries[0].startTick;
  const endTick = summaries[summaries.length - 1].endTick;
  const avgPopulationSize =
    summaries.reduce((sum, s) => sum + s.populationSize, 0) / summaries.length;

  const summarizedTraits: Record<string, TraitDistribution> = {};

  // Get all trait keys
  const allTraits = new Set<string>();
  for (const summary of summaries) {
    for (const trait of Object.keys(summary.traitFrequencies)) {
      allTraits.add(trait);
    }
  }

  // Average distributions
  for (const trait of allTraits) {
    const distributions = summaries
      .map((s) => s.traitFrequencies[trait])
      .filter((d) => d);

    if (distributions.length > 0) {
      const mean =
        distributions.reduce((sum, d) => sum + d.mean, 0) / distributions.length;
      const variance =
        distributions.reduce((sum, d) => sum + d.variance, 0) / distributions.length;

      summarizedTraits[trait] = {
        mean,
        median:
          distributions.reduce((sum, d) => sum + d.median, 0) / distributions.length,
        min: Math.min(...distributions.map((d) => d.min)),
        max: Math.max(...distributions.map((d) => d.max)),
        variance,
      };
    }
  }

  return {
    startTick,
    endTick,
    avgPopulationSize,
    summarizedTraits,
  };
}

/**
 * Create an empty trait frequency history
 */
export function createTraitFrequencyHistory(): TraitFrequencyHistory {
  return {
    recentWindow: [],
    compressedArchive: [],
    maxRecentWindows: 10,
    compressionRatio: 2,
  };
}
