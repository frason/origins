/**
 * Evidence-Threshold Classification for Evolution Truth (#276)
 *
 * Labels a lineage's trait trend as one of:
 *   - 'mutation-appearance' — a trait value never seen in any prior window of
 *     the lineage crossed the minimum-frequency floor this window.
 *   - 'selection'           — a directional trait shift big enough to matter,
 *     moving in the direction its own survival/reproduction correlation
 *     predicts, reproduced across multiple windows.
 *   - 'speciation'          — the lineage's trait distribution diverged from
 *     its own baseline beyond the divergence threshold, sustained across
 *     several consecutive windows, on multiple traits at once (a single-trait
 *     shift is selection/drift; multi-trait divergence is the speciation
 *     signature).
 *   - 'drift'               — a directional shift above the drift floor with
 *     NO survival or reproduction correlation (fitness-neutral change).
 *   - 'insufficient-evidence' — the default. Nothing crossed a documented
 *     threshold, so no label is guessed.
 *
 * Everything here is a pure function of the window data handed in: no RNG,
 * no clock, no global state. Identical inputs => identical verdicts, which is
 * what makes same-seed => same-label determinism hold end to end.
 */

/**
 * The evidence-based label for a lineage's trait trend.
 * 'insufficient-evidence' means "no documented threshold was crossed" —
 * deliberately NOT a guess between the other four.
 */
export type AdaptationLabel =
  | 'drift'
  | 'mutation-appearance'
  | 'selection'
  | 'speciation'
  | 'insufficient-evidence';

/**
 * Documented evidence thresholds. Every field is part of the public contract:
 * a label may only be assigned by crossing one of these, and every verdict
 * lists the thresholds it used in `reasons`.
 */
export interface AdaptationThresholds {
  /** Windows of history required before ANY label may be assigned. */
  minWindows: number;
  /** Members that must be alive at a window's start for that window to count. */
  minCohortSize: number;
  /** Frequency a newly-observed trait value must reach to count as a mutation appearance. */
  mutationMinFrequency: number;
  /**
   * For continuous traits: how far beyond the prior range (as a fraction of
   * that range's width) a value must jump to count as a mutation appearance.
   * A gradual selection/drift ratchet pushes the max past prior extremes a
   * little each window; a mutation is a JUMP. Discrete values cannot arise
     * by ratcheting, so they only need the frequency floor.
   */
  mutationMinExcursion: number;
  /** Minimum |point-biserial r| between trait value and survival/reproduction. */
  selectionCorrelation: number;
  /** How many of the last 3 windows must meet selectionCorrelation. */
  selectionCorrelatedWindows: number;
  /** Minimum normalized directional mean shift required alongside the correlation. */
  selectionMinShift: number;
  /** Minimum normalized mean shift to label an uncorrelated change as drift. */
  driftMinShift: number;
  /** Minimum normalized divergence from the lineage's baseline distribution. */
  speciationDivergence: number;
  /** Traits that must be simultaneously divergent for a speciation label. */
  speciationMinTraits: number;
  /** Consecutive windows at/above speciationDivergence required. */
  speciationMinWindows: number;
}

export const DEFAULT_ADAPTATION_THRESHOLDS: AdaptationThresholds = {
  minWindows: 3,
  minCohortSize: 6,
  mutationMinFrequency: 0.05,
  mutationMinExcursion: 0.5,
  selectionCorrelation: 0.35,
  selectionCorrelatedWindows: 2,
  selectionMinShift: 0.02,
  driftMinShift: 0.02,
  speciationDivergence: 0.35,
  speciationMinTraits: 2,
  speciationMinWindows: 3,
};

/** Outcome record for one cohort member (alive at window start) over one window. */
export interface CohortMemberOutcome {
  /** Creature id. Cohorts are iterated in id order for deterministic float sums. */
  id: string;
  /** The member's numeric value for the trait being classified. */
  traitValue: number;
  /** Still alive (lifecycleState === 'alive') when the window closed. */
  survived: boolean;
  /** Offspring produced during the window (cumulative counter delta). */
  offspringDelta: number;
  /** The member's value for a discrete trait (e.g. energyStrategy), if any. */
  discreteValue?: string;
}

/**
 * Observed evidence for one trait over one window: who was present at the
 * start, what their trait value was, and what happened to them. The raw
 * material every threshold below is computed from — never a pre-digested
 * guess.
 */
export interface TraitCohortWindow {
  startTick: number;
  endTick: number;
  /** Members alive at window start (== members.length). */
  cohortSize: number;
  /** Mean trait value over the cohort at window start. */
  traitMean: number;
  traitMin: number;
  traitMax: number;
  /** Per-member outcomes, sorted by id for deterministic arithmetic. */
  members: CohortMemberOutcome[];
  /**
   * For discrete traits only: fraction of the cohort carrying each value.
   * Discrete traits get mutation-appearance classification; without member
   * weighting the richer numeric paths do not apply to them.
   */
  discreteFrequency?: Record<string, number>;
}

/** The verdict for one trait: the label plus the thresholds that produced it. */
export interface TraitTrendVerdict {
  label: AdaptationLabel;
  /** Greppable explanations, e.g. "correlation 0.61 >= 0.35 in 2/3 windows". */
  reasons: string[];
  survivalCorrelation: number;
  reproductionCorrelation: number;
  /** |Δmean| / union range, latest window vs the one before it. */
  normalizedShift: number;
  /** |Δmean| / union range, latest window vs the lineage's baseline window. */
  divergenceFromBaseline: number;
}

const EPSILON = 1e-9;

/** Population standard deviation. */
function stddev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / values.length;
  return Math.sqrt(Math.max(0, variance));
}

/**
 * Point-biserial correlation between a continuous trait value and a binary
 * outcome (survived / did not). Returns 0 when there is no contrast to
 * measure (all survived, all died, or zero trait spread).
 */
export function pointBiserial(
  values: number[],
  survivedFlags: boolean[]
): number {
  const n = Math.min(values.length, survivedFlags.length);
  if (n === 0) return 0;

  const survivors: number[] = [];
  const nonSurvivors: number[] = [];
  for (let i = 0; i < n; i++) {
    (survivedFlags[i] ? survivors : nonSurvivors).push(values[i]);
  }
  if (survivors.length === 0 || nonSurvivors.length === 0) return 0;

  const all = [...survivors, ...nonSurvivors];
  const meanAll = all.reduce((a, b) => a + b, 0) / all.length;
  const sd = stddev(all, meanAll);
  if (sd < EPSILON) return 0;

  const meanSurv = survivors.reduce((a, b) => a + b, 0) / survivors.length;
  const meanNonSurv = nonSurvivors.reduce((a, b) => a + b, 0) / nonSurvivors.length;
  const p = survivors.length / all.length;

  return ((meanSurv - meanNonSurv) / sd) * Math.sqrt(p * (1 - p));
}

/** Pearson correlation between two continuous samples; 0 when either is constant. */
export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  if (den < EPSILON) return 0;

  return num / den;
}

/** Union value range of two windows, used to normalize mean shifts. */
function unionRange(a: TraitCohortWindow, b: TraitCohortWindow): number {
  const lo = Math.min(a.traitMin, b.traitMin);
  const hi = Math.max(a.traitMax, b.traitMax);
  const range = hi - lo;
  return range > EPSILON ? range : 1;
}

function survivalCorrelation(window: TraitCohortWindow): number {
  const members = [...window.members].sort((a, b) => (a.id < b.id ? -1 : 1));
  return pointBiserial(
    members.map((m) => m.traitValue),
    members.map((m) => m.survived)
  );
}

function reproductionCorrelation(window: TraitCohortWindow): number {
  const members = [...window.members].sort((a, b) => (a.id < b.id ? -1 : 1));
  return pearson(
    members.map((m) => m.traitValue),
    members.map((m) => m.offspringDelta)
  );
}

/**
 * Classify one trait's trend from its cohort windows.
 *
 * @param windows         Chronological cohort windows for the trait.
 * @param thresholds      Documented evidence thresholds.
 * @param traitsDivergent How many traits in this lineage currently meet the
 *                        speciation divergence requirement (speciation is a
 *                        multi-trait event; supply 1 when classifying in
 *                        isolation so a lone divergent trait can never be
 *                        labeled speciation on its own).
 */
export function classifyTraitTrend(
  windows: TraitCohortWindow[],
  thresholds: AdaptationThresholds = DEFAULT_ADAPTATION_THRESHOLDS,
  traitsDivergent = 1
): TraitTrendVerdict {
  const latest = windows[windows.length - 1];
  const previous = windows[windows.length - 2];

  const baseVerdict: TraitTrendVerdict = {
    label: 'insufficient-evidence',
    reasons: [],
    survivalCorrelation: latest ? survivalCorrelation(latest) : 0,
    reproductionCorrelation: latest ? reproductionCorrelation(latest) : 0,
    normalizedShift: 0,
    divergenceFromBaseline: 0,
  };

  // Gate 1: history depth.
  if (windows.length < thresholds.minWindows) {
    return {
      ...baseVerdict,
      reasons: [
        `windows ${windows.length} < minWindows ${thresholds.minWindows}`,
      ],
    };
  }

  // Gate 2: sample size in every window used below.
  const used = windows.slice(-Math.max(thresholds.minWindows, thresholds.speciationMinWindows));
  if (used.some((w) => w.cohortSize < thresholds.minCohortSize)) {
    const smallest = Math.min(...used.map((w) => w.cohortSize));
    return {
      ...baseVerdict,
      reasons: [
        `cohort ${smallest} < minCohortSize ${thresholds.minCohortSize}`,
      ],
    };
  }

  const normalizedShift = previous
    ? Math.abs(latest.traitMean - previous.traitMean) / unionRange(latest, previous)
    : 0;
  const baseline = windows[0];
  const divergenceFromBaseline =
    Math.abs(latest.traitMean - baseline.traitMean) / unionRange(latest, baseline);

  const verdict: TraitTrendVerdict = {
    ...baseVerdict,
    normalizedShift,
    divergenceFromBaseline,
  };

  // 1) Mutation appearance: a value never observed in ANY prior window that
  //    now crosses the frequency floor.
  if (latest.discreteFrequency && previous?.discreteFrequency) {
    const priorValues = new Set<string>();
    for (const w of windows.slice(0, -1)) {
      for (const value of Object.keys(w.discreteFrequency ?? {})) {
        priorValues.add(value);
      }
    }
    for (const [value, freq] of Object.entries(latest.discreteFrequency)) {
      if (!priorValues.has(value) && freq >= thresholds.mutationMinFrequency) {
        return {
          ...verdict,
          label: 'mutation-appearance',
          reasons: [
            `new discrete value "${value}" freq ${freq.toFixed(3)} >= ${thresholds.mutationMinFrequency} and absent from all ${windows.length - 1} prior windows`,
          ],
        };
      }
    }
  } else if (previous && !latest.discreteFrequency) {
    // Continuous trait: fraction of members outside the union range of ALL
    // prior windows by a JUMP-sized margin (>= mutationMinExcursion of the
    // prior range width). A ratcheting max from selection/drift stays inside
    // the margin; a mutation leaps past it.
    const priorLo = Math.min(...windows.slice(0, -1).map((w) => w.traitMin));
    const priorHi = Math.max(...windows.slice(0, -1).map((w) => w.traitMax));
    const priorWidth = Math.max(EPSILON, priorHi - priorLo);
    const margin = priorWidth * thresholds.mutationMinExcursion;
    const continuousFloor = thresholds.mutationMinFrequency * 2;
    const beyond = latest.members.filter(
      (m) =>
        m.traitValue < priorLo - margin - EPSILON ||
        m.traitValue > priorHi + margin + EPSILON
    );
    const beyondFraction = beyond.length / Math.max(1, latest.members.length);
    if (beyondFraction >= continuousFloor) {
      return {
        ...verdict,
        label: 'mutation-appearance',
        reasons: [
          `${beyond.length}/${latest.members.length} members beyond prior range [${priorLo.toFixed(3)}, ${priorHi.toFixed(3)}] by >= ${(thresholds.mutationMinExcursion * 100).toFixed(0)}% of its width: fraction ${beyondFraction.toFixed(3)} >= ${continuousFloor}`,
        ],
      };
    }
  }

  // 2) Speciation: sustained divergence from the lineage's own baseline on
  //    enough traits at once. Divergence streak is measured per trait here;
  //    the multi-trait count is supplied by the caller.
  let streak = 0;
  for (let i = windows.length - 1; i >= 0; i--) {
    const d =
      Math.abs(windows[i].traitMean - baseline.traitMean) /
      unionRange(windows[i], baseline);
    if (d >= thresholds.speciationDivergence) streak++;
    else break;
  }
  if (
    streak >= thresholds.speciationMinWindows &&
    traitsDivergent >= thresholds.speciationMinTraits
  ) {
    return {
      ...verdict,
      label: 'speciation',
      reasons: [
        `divergence ${divergenceFromBaseline.toFixed(3)} >= ${thresholds.speciationDivergence} for ${streak} consecutive windows (>= ${thresholds.speciationMinWindows}) across ${traitsDivergent} traits (>= ${thresholds.speciationMinTraits})`,
      ],
    };
  }

  // 3) Selection: correlation between the trait value and actual
  //    survival/reproduction outcomes, reproduced across windows, WITH a
  //    directional shift that agrees with the correlation's sign.
  const recent = windows.slice(-3);
  const correlations = recent.map((w) => ({
    survival: survivalCorrelation(w),
    reproduction: reproductionCorrelation(w),
  }));
  const strongest = correlations.map((c) =>
    Math.abs(c.survival) >= Math.abs(c.reproduction) ? c.survival : c.reproduction
  );
  const correlatedWindows = strongest.filter(
    (r) => Math.abs(r) >= thresholds.selectionCorrelation
  ).length;

  const latestSurv = correlations[correlations.length - 1].survival;
  const latestRepro = correlations[correlations.length - 1].reproduction;

  if (
    correlatedWindows >= thresholds.selectionCorrelatedWindows &&
    normalizedShift >= thresholds.selectionMinShift &&
    previous
  ) {
    // The shift must move the way the fitness correlation predicts. Use the
    // summed signed correlation across the recent windows (dominated by the
    // correlated ones) so an exhausted latest window can't veto a consistent
    // trend — but genuinely contradictory evidence sums toward 0 and refuses.
    const correlationSign = Math.sign(strongest.reduce((a, b) => a + b, 0));
    const shiftDirection = Math.sign(latest.traitMean - previous.traitMean);
    if (shiftDirection !== 0 && shiftDirection === correlationSign) {
      return {
        ...verdict,
        label: 'selection',
        reasons: [
          `correlation |r| >= selectionCorrelation ${thresholds.selectionCorrelation} in ${correlatedWindows}/${recent.length} recent windows (latest survival r=${latestSurv.toFixed(3)}, reproduction r=${latestRepro.toFixed(3)})`,
          `directional shift ${normalizedShift.toFixed(3)} >= selectionMinShift ${thresholds.selectionMinShift}, direction agrees with correlation sign`,
        ],
      };
    }
  }

  // 4) Drift: a directional shift above the drift floor with NO fitness
  //    correlation strong enough to explain it.
  if (normalizedShift >= thresholds.driftMinShift && correlatedWindows === 0) {
    return {
      ...verdict,
      label: 'drift',
      reasons: [
        `directional shift ${normalizedShift.toFixed(3)} >= driftMinShift ${thresholds.driftMinShift} with fitness correlation below selectionCorrelation ${thresholds.selectionCorrelation} in all recent windows`,
      ],
    };
  }

  // 5) Default: no threshold crossed — unlabeled, not guessed.
  return {
    ...verdict,
    reasons: [
      `no threshold crossed: shift ${normalizedShift.toFixed(3)}, latest |survival r| ${Math.abs(latestSurv).toFixed(3)}, |reproduction r| ${Math.abs(latestRepro).toFixed(3)}, divergence ${divergenceFromBaseline.toFixed(3)}`,
    ],
  };
}

/**
 * Classify every tracked trait of a lineage at once, so speciation (a
 * multi-trait event) can be judged with the full picture: a trait only gets
 * the speciation label when enough OTHER traits diverged alongside it.
 *
 * @param windowsByTrait Chronological cohort windows per trait name.
 * @param thresholds     Documented evidence thresholds.
 */
export function classifyLineageTrends(
  windowsByTrait: Record<string, TraitCohortWindow[]>,
  thresholds: AdaptationThresholds = DEFAULT_ADAPTATION_THRESHOLDS
): Record<string, TraitTrendVerdict> {
  // Count numeric traits currently meeting the divergence requirement.
  const divergentTraits = new Set<string>();
  for (const [trait, windows] of Object.entries(windowsByTrait)) {
    if (windows.length < thresholds.minWindows) continue;
    if (windows[windows.length - 1].discreteFrequency) continue;
    if (windows.some((w) => w.cohortSize < thresholds.minCohortSize)) continue;

    const baseline = windows[0];
    let streak = 0;
    for (let i = windows.length - 1; i >= 0; i--) {
      const d =
        Math.abs(windows[i].traitMean - baseline.traitMean) /
        unionRange(windows[i], baseline);
      if (d >= thresholds.speciationDivergence) streak++;
      else break;
    }
    if (streak >= thresholds.speciationMinWindows) divergentTraits.add(trait);
  }

  const verdicts: Record<string, TraitTrendVerdict> = {};
  for (const [trait, windows] of Object.entries(windowsByTrait)) {
    verdicts[trait] = classifyTraitTrend(
      windows,
      thresholds,
      divergentTraits.size
    );
  }
  return verdicts;
}

/** Map an evidence label onto the pre-existing EvolutionaryChangeType union. */
export function labelToChangeType(
  label: AdaptationLabel
): 'drift' | 'mutation-appearance' | 'selection' | 'speciation' | 'unknown' {
  switch (label) {
    case 'drift':
    case 'mutation-appearance':
    case 'selection':
    case 'speciation':
      return label;
    default:
      return 'unknown';
  }
}
