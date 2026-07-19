import { SIMULATION_CONSTANTS, type SimulationConstants } from '../utils/constants';

export interface GodModeSliderConfig {
  label: string;
  key: keyof SimulationConstants;
  min: number;
  max: number;
  step: number;
  description: string;
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
      { label: 'Base Solar Energy', key: 'baseSolarEnergy', min: 1, max: 50, step: 1, description: 'Energy entering every world tile each tick. Higher input supports more producer growth and animals, but can hide scarcity and encourage population surges.' },
      { label: 'Solar Edge Falloff Factor', key: 'solarEdgeFalloffFactor', min: 0, max: 1, step: 0.05, formatter: fixed(2), description: 'Reduces solar energy toward the world edges. Higher values create stronger low-energy margins and concentrate viable habitat nearer the center.' },
      { label: 'Solar Falloff Curve', key: 'solarFalloffExponent', min: 0.25, max: 4, step: 0.25, formatter: fixed(2), description: 'Shapes how quickly sunlight changes from the center toward the edges. Higher values preserve a broad bright center followed by a sharper outer decline.' },
      { label: 'Producer Growth Rate', key: 'producerGrowthRate', min: 0.01, max: 0.5, step: 0.01, formatter: fixed(3), description: 'Controls how quickly producer biomass converts local energy into food. Higher growth feeds herbivores faster but can weaken the consequences of overgrazing.' },
    ],
  },
  {
    id: 'creature-energy', label: 'Creature Energy & Reproduction',
    description: 'Daily energy use, feeding return, and breeding investment.',
    controls: [
      { label: 'Base Metabolism', key: 'baseMetabolism', min: 0.5, max: 10, step: 0.5, formatter: fixed(1), description: 'Baseline energy spent by creatures each tick before trait and environment costs. Higher metabolism increases food pressure and starvation risk.' },
      { label: 'Feeding Efficiency', key: 'feedingEfficiency', min: 0.1, max: 1, step: 0.05, formatter: fixed(2), description: 'Share of consumed food converted into creature energy. Higher efficiency supports survival and reproduction with less food, reducing ecological waste.' },
      { label: 'Reproduction Energy Threshold', key: 'reproductionEnergyThreshold', min: 50, max: 500, step: 10, description: 'Energy a mature creature must hold before breeding. Higher thresholds delay births and favor well-fed parents, but can prevent recovery during scarcity.' },
      { label: 'Reproduction Energy Cost', key: 'reproductionEnergyCost', min: 25, max: 300, step: 5, description: 'Energy a parent invests when producing offspring. Higher costs slow population growth and leave parents more vulnerable after breeding.' },
      { label: 'Maturity Age Ticks', key: 'reproductionMaturityAgeTicks', min: 0, max: 100, step: 1, description: 'Default minimum age before creatures can reproduce. Later maturity reduces rapid growth but can be dangerous for short-lived species.' },
      { label: 'Reproduction Cooldown Ticks', key: 'reproductionCooldownTicks', min: 0, max: 100, step: 1, description: 'Minimum wait between births by the same parent. Longer cooldowns limit repeated breeding and make population recovery slower.' },
      { label: 'Adaptive Evidence Deaths', key: 'adaptiveReproductionMinDeaths', min: 1, max: 500, step: 1, description: 'Deaths required before a species can adjust reproductive timing. Higher values make adaptation slower but less sensitive to early outliers.' },
      { label: 'Maturity Lifespan Share', key: 'adaptiveMaturityLifespanShare', min: 0.1, max: 0.6, step: 0.05, formatter: fixed(2), description: 'Target maturity as a share of observed lifespan. Lower values permit earlier breeding once enough evidence exists.' },
      { label: 'Urgency Start Share', key: 'reproductiveUrgencyAgeShare', min: 0.3, max: 0.9, step: 0.05, formatter: fixed(2), description: 'Point in expected lifespan when late-life breeding urgency begins.' },
      { label: 'Urgency Threshold Discount', key: 'reproductiveUrgencyThresholdDiscount', min: 0, max: 0.75, step: 0.05, formatter: fixed(2), description: 'Maximum reduction to breeding energy requirements near expected death. Larger discounts increase rescue births but risk exhausting parents.' },
      { label: 'Early Breeding Cost', key: 'earlyReproductionCostMultiplier', min: 1, max: 2, step: 0.05, formatter: fixed(2), description: 'Extra parent energy spent when adaptive timing advances reproduction. Higher values make early breeding a stronger survival tradeoff.' },
      { label: 'Low Energy Urgency Start', key: 'lowEnergyUrgencyStartShare', min: 0.1, max: 1, step: 0.05, formatter: fixed(2), description: 'Energy reserve share where a weak pre-evidence breeding response begins. Higher values help founders react sooner but can spend scarce energy earlier.' },
    ],
  },
  {
    id: 'lifespan-decomposition', label: 'Lifespan & Decomposition',
    description: 'Aging, corpse persistence, toxicity, and scavenging.',
    controls: [
      { label: 'Max Creature Age Ticks', key: 'maxCreatureAgeTicks', min: 100, max: 2000, step: 50, description: 'Hard upper lifespan before age death. Longer lives preserve adults and knowledge of habitat, but can increase crowding and slow generational change.' },
      { label: 'Corpse Decay Rate', key: 'corpseDecayRate', min: 0.01, max: 0.5, step: 0.01, formatter: fixed(3), description: 'Fraction of corpse energy lost to decomposition each tick. Faster decay shortens scavenger food windows and releases corpse effects sooner.' },
      { label: 'Corpse Duration Ticks', key: 'corpseDecayDurationTicks', min: 5, max: 200, step: 5, description: 'Maximum time dead creatures persist in the world as corpses. Longer duration feeds scavengers for longer but extends local toxicity and rendering load.' },
      { label: 'Corpse Toxicity', key: 'corpseToxicityPerTick', min: 0, max: 5, step: 0.1, formatter: fixed(1), description: 'Toxicity released around each decomposing corpse per tick. Higher values make die-offs damage nearby life and producer growth.' },
      { label: 'Toxicity Radius', key: 'corpseToxicityRadius', min: 0, max: 10, step: 1, description: 'Distance corpse toxicity spreads across neighboring tiles. Larger radii turn clustered deaths into wider ecological hazards.' },
      { label: 'Toxicity Retention', key: 'toxicityRetention', min: 0, max: 1, step: 0.05, formatter: fixed(2), description: 'Share of existing tile toxicity retained each tick. Values near one create long-lived scars; lower values let contaminated habitat recover quickly.' },
      { label: 'Scavenging Rate', key: 'scavengingRate', min: 0.05, max: 1, step: 0.05, formatter: fixed(2), description: 'Rate at which scavengers convert corpse energy into food. Higher rates improve scavenger survival but exhaust shared carcasses sooner.' },
    ],
  },
  {
    id: 'evolution', label: 'Evolution',
    description: 'How often offspring branch and how far traits drift.',
    controls: [
      { label: 'Default Mutation Rate', key: 'defaultMutationRate', min: 0.01, max: 0.2, step: 0.01, formatter: fixed(3), description: 'Chance that an offspring receives trait changes. Higher rates create more experiments, including harmful mutations, and reduce lineage stability.' },
      { label: 'Mutation Drift', key: 'mutationDrift', min: 0, max: 0.5, step: 0.01, formatter: fixed(2), description: 'Maximum size of individual trait changes during mutation. Larger drift explores faster but produces more poorly adapted offspring.' },
    ],
  },
  {
    id: 'biodiversity', label: 'Biodiversity Pressure',
    description: 'Dominance checks, population capacity, and crowding pressure.',
    controls: [
      { label: 'Monoculture Threshold', key: 'monocultureDominanceThreshold', min: 0.5, max: 1, step: 0.05, formatter: fixed(2), description: 'Population share where one species is considered dominant. Lower thresholds trigger diversity pressure sooner; higher values tolerate stronger dominance.' },
      { label: 'Monoculture Mortality', key: 'monocultureMortalityPenalty', min: 0, max: 0.5, step: 0.01, formatter: fixed(2), description: 'Additional mortality pressure applied when a species exceeds the dominance threshold. Higher values resist monocultures but can cause abrupt declines.' },
      { label: 'Monoculture Reproduction Limit', key: 'monocultureReproductionLimit', min: 1, max: 500, step: 5, description: 'Population size above which a dominant species faces reproduction limits. Lower values constrain common species earlier and protect ecological room for others.' },
      { label: 'Population Capacity', key: 'maxGlobalPopulation', min: 50, max: 2000, step: 50, description: 'Soft global creature capacity used by crowding governance. Higher capacity permits larger worlds but increases food competition and processing cost.' },
      { label: 'Overcrowding Mortality', key: 'overcrowdingMortalityRate', min: 0, max: 0.5, step: 0.01, formatter: fixed(2), description: 'Mortality pressure when total population exceeds capacity. Higher rates restore performance faster but can create sudden population crashes.' },
    ],
  },
];

export function defaultValueFor(config: GodModeSliderConfig): number {
  return SIMULATION_CONSTANTS[config.key];
}
