import type { SimulationConstants } from '../utils/constants';
import type { EcosystemPressure } from './ecosystemPressures';
import type { EcosystemTrajectories } from './ecosystemTrajectory';

export interface RecommendedConstantChange {
  constant: keyof SimulationConstants;
  label: string;
  before: number;
  after: number;
}

export interface GodModeRecommendation {
  id: string;
  title: string;
  reason: string;
  priority: number;
  changes: RecommendedConstantChange[];
  guidance?: string;
}

function rounded(value: number, precision = 2): number {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function change(
  constants: SimulationConstants,
  constant: keyof SimulationConstants,
  label: string,
  after: number
): RecommendedConstantChange | null {
  const before = constants[constant];
  return before === after ? null : { constant, label, before, after };
}

function compact(
  changes: Array<RecommendedConstantChange | null>
): RecommendedConstantChange[] {
  return changes.filter((item): item is RecommendedConstantChange => item !== null);
}

/** Offer bounded stewardship choices from measured state; no recommendation mutates state. */
export function getGodModeRecommendations(
  pressures: EcosystemPressure[],
  trajectories: EcosystemTrajectories,
  constants: SimulationConstants,
  limit = 3
): GodModeRecommendation[] {
  const pressureIds = new Set(pressures.map((pressure) => pressure.id));
  const recommendations: GodModeRecommendation[] = [];

  if (pressureIds.has('collapse')) {
    recommendations.push({
      id: 'restore-life',
      title: 'Seed a new ecological foothold',
      reason: 'No living creatures remain, so settings alone cannot restart animal life.',
      priority: 110,
      changes: [],
      guidance: 'Select a habitable tile, choose a founder strategy, and use Introduce species.',
    });
  }

  if (pressureIds.has('cause:starvation') || pressureIds.has('low-energy')) {
    const changes = compact([
      change(
        constants,
        'producerGrowthRate',
        'Producer growth',
        Math.min(0.5, rounded(constants.producerGrowthRate * 1.25, 3))
      ),
      change(
        constants,
        'baseMetabolism',
        'Base metabolism',
        Math.max(0.5, rounded(constants.baseMetabolism * 0.8, 1))
      ),
    ]);
    if (changes.length > 0) recommendations.push({
      id: 'energy-relief',
      title: 'Ease the energy squeeze',
      reason: pressureIds.has('cause:starvation')
        ? 'Recorded starvation indicates that available energy is not reaching creatures fast enough.'
        : 'Many creatures are below 30% of their energy capacity.',
      priority: 100,
      changes,
    });
  }

  if (pressureIds.has('cause:overcrowding') || pressureIds.has('capacity')) {
    const changes = compact([
      change(
        constants,
        'reproductionEnergyThreshold',
        'Reproduction threshold',
        Math.min(500, Math.round(constants.reproductionEnergyThreshold * 1.2 / 10) * 10)
      ),
    ]);
    if (changes.length > 0) recommendations.push({
      id: 'slow-reproduction',
      title: 'Slow population growth',
      reason: 'The population is pressing against its configured carrying capacity.',
      priority: 90,
      changes,
    });
  }

  if (pressureIds.has('dominance') || pressureIds.has('cause:monoculture-pressure')) {
    const changes = compact([
      change(
        constants,
        'monocultureMortalityPenalty',
        'Monoculture mortality',
        Math.min(0.5, rounded(constants.monocultureMortalityPenalty + 0.02))
      ),
      change(
        constants,
        'monocultureReproductionLimit',
        'Dominant reproduction limit',
        Math.max(1, Math.round(constants.monocultureReproductionLimit * 0.8))
      ),
    ]);
    if (changes.length > 0) recommendations.push({
      id: 'counter-dominance',
      title: 'Give rarer species more room',
      reason: 'One species holds a disproportionate share of the living population.',
      priority: 80,
      changes,
    });
  }

  if (pressureIds.has('toxicity')) {
    const changes = compact([
      change(
        constants,
        'corpseToxicityPerTick',
        'Corpse toxicity',
        Math.max(0, rounded(constants.corpseToxicityPerTick * 0.75, 1))
      ),
      change(
        constants,
        'toxicityRetention',
        'Toxicity retention',
        Math.max(0, rounded(constants.toxicityRetention - 0.05))
      ),
    ]);
    if (changes.length > 0) recommendations.push({
      id: 'clear-toxicity',
      title: 'Let ecological scars clear sooner',
      reason: 'Elevated toxicity is affecting a meaningful part of the landscape.',
      priority: 70,
      changes,
    });
  }

  if (trajectories.exploration.label === 'Quieting') {
    const changes = compact([
      change(
        constants,
        'defaultMutationRate',
        'Mutation rate',
        Math.min(0.2, rounded(constants.defaultMutationRate + 0.02, 3))
      ),
    ]);
    if (changes.length > 0) recommendations.push({
      id: 'invite-exploration',
      title: 'Invite more evolutionary experiments',
      reason: trajectories.exploration.explanation,
      priority: 60,
      changes,
    });
  }

  return recommendations
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit));
}

export function recommendationPatch(
  recommendation: GodModeRecommendation
): Partial<SimulationConstants> {
  return Object.fromEntries(
    recommendation.changes.map((item) => [item.constant, item.after])
  ) as Partial<SimulationConstants>;
}
