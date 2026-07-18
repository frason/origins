import { SIMULATION_CONSTANTS, type SimulationConstants } from '../utils/constants';

export interface GodModeSliderConfig {
  label: string;
  key: keyof SimulationConstants;
  min: number;
  max: number;
  step: number;
  formatter?: (value: number) => string;
}

export interface GodModeControlGroup {
  id: string;
  label: string;
  description: string;
  controls: GodModeSliderConfig[];
}

const fixed = (digits: number) => (value: number) => value.toFixed(digits);

export const GOD_MODE_GROUPS: GodModeControlGroup[] = [
  {
    id: 'energy-growth', label: 'Energy & Growth',
    description: 'Solar input, world falloff, and producer growth.',
    controls: [
      { label: 'Base Solar Energy', key: 'baseSolarEnergy', min: 1, max: 50, step: 1 },
      { label: 'Solar Edge Falloff Factor', key: 'solarEdgeFalloffFactor', min: 0, max: 1, step: 0.05, formatter: fixed(2) },
      { label: 'Solar Falloff Curve', key: 'solarFalloffExponent', min: 0.25, max: 4, step: 0.25, formatter: fixed(2) },
      { label: 'Producer Growth Rate', key: 'producerGrowthRate', min: 0.01, max: 0.5, step: 0.01, formatter: fixed(3) },
    ],
  },
  {
    id: 'creature-energy', label: 'Creature Energy & Reproduction',
    description: 'Daily energy use, feeding return, and breeding investment.',
    controls: [
      { label: 'Base Metabolism', key: 'baseMetabolism', min: 0.5, max: 10, step: 0.5, formatter: fixed(1) },
      { label: 'Feeding Efficiency', key: 'feedingEfficiency', min: 0.1, max: 1, step: 0.05, formatter: fixed(2) },
      { label: 'Reproduction Energy Threshold', key: 'reproductionEnergyThreshold', min: 50, max: 500, step: 10 },
      { label: 'Reproduction Energy Cost', key: 'reproductionEnergyCost', min: 25, max: 300, step: 5 },
    ],
  },
  {
    id: 'lifespan-decomposition', label: 'Lifespan & Decomposition',
    description: 'Aging, corpse persistence, toxicity, and scavenging.',
    controls: [
      { label: 'Max Creature Age Ticks', key: 'maxCreatureAgeTicks', min: 100, max: 2000, step: 50 },
      { label: 'Corpse Decay Rate', key: 'corpseDecayRate', min: 0.01, max: 0.5, step: 0.01, formatter: fixed(3) },
      { label: 'Corpse Duration Ticks', key: 'corpseDecayDurationTicks', min: 5, max: 200, step: 5 },
      { label: 'Corpse Toxicity', key: 'corpseToxicityPerTick', min: 0, max: 5, step: 0.1, formatter: fixed(1) },
      { label: 'Toxicity Radius', key: 'corpseToxicityRadius', min: 0, max: 10, step: 1 },
      { label: 'Toxicity Retention', key: 'toxicityRetention', min: 0, max: 1, step: 0.05, formatter: fixed(2) },
      { label: 'Scavenging Rate', key: 'scavengingRate', min: 0.05, max: 1, step: 0.05, formatter: fixed(2) },
    ],
  },
  {
    id: 'evolution', label: 'Evolution',
    description: 'How often offspring branch and how far traits drift.',
    controls: [
      { label: 'Default Mutation Rate', key: 'defaultMutationRate', min: 0.01, max: 0.2, step: 0.01, formatter: fixed(3) },
      { label: 'Mutation Drift', key: 'mutationDrift', min: 0, max: 0.5, step: 0.01, formatter: fixed(2) },
    ],
  },
  {
    id: 'biodiversity', label: 'Biodiversity Pressure',
    description: 'Dominance checks, population capacity, and crowding pressure.',
    controls: [
      { label: 'Monoculture Threshold', key: 'monocultureDominanceThreshold', min: 0.5, max: 1, step: 0.05, formatter: fixed(2) },
      { label: 'Monoculture Mortality', key: 'monocultureMortalityPenalty', min: 0, max: 0.5, step: 0.01, formatter: fixed(2) },
      { label: 'Monoculture Reproduction Limit', key: 'monocultureReproductionLimit', min: 1, max: 500, step: 5 },
      { label: 'Population Capacity', key: 'maxGlobalPopulation', min: 50, max: 2000, step: 50 },
      { label: 'Overcrowding Mortality', key: 'overcrowdingMortalityRate', min: 0, max: 0.5, step: 0.01, formatter: fixed(2) },
    ],
  },
];

export function defaultValueFor(config: GodModeSliderConfig): number {
  return SIMULATION_CONSTANTS[config.key];
}
