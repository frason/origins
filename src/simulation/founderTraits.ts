import {
  DEFAULT_TRAITS,
  TRAIT_MAX,
  TRAIT_MIN,
  type EnergyStrategy,
  type Traits,
} from '../utils/traits';

export type FounderTraitKey =
  | 'size'
  | 'speed'
  | 'visionRange'
  | 'camouflage'
  | 'metabolism'
  | 'thermalTolerance'
  | 'waterRetention'
  | 'aquaticAffinity'
  | 'terrainGrip'
  | 'toxinResistance';

export type FounderTraitOverrides = Partial<Pick<Traits, FounderTraitKey>>;

export interface FounderTraitControl {
  key: FounderTraitKey;
  label: string;
  min: number;
  max: number;
  step: number;
  description: string;
}

export const FOUNDER_TRAIT_CONTROLS: FounderTraitControl[] = [
  { key: 'size', label: 'Size', min: 0.5, max: 2, step: 0.1, description: 'Larger bodies cost more energy but improve strength.' },
  { key: 'speed', label: 'Speed', min: 0.5, max: 3, step: 0.1, description: 'Faster movement finds food sooner but costs more energy.' },
  { key: 'visionRange', label: 'Vision', min: 2, max: 15, step: 1, description: 'Longer searches improve awareness but increase movement effort.' },
  { key: 'camouflage', label: 'Camouflage', min: 0, max: 1, step: 0.1, description: 'Better concealment reduces predator detection.' },
  { key: 'metabolism', label: 'Metabolism', min: 0.5, max: 2, step: 0.1, description: 'Higher throughput improves activity while burning energy faster.' },
  { key: 'thermalTolerance', label: 'Cold tolerance', min: 0, max: 1, step: 0.1, description: 'Reduces tundra cold stress at an adaptation cost.' },
  { key: 'waterRetention', label: 'Water retention', min: 0, max: 1, step: 0.1, description: 'Reduces desert dehydration at an adaptation cost.' },
  { key: 'aquaticAffinity', label: 'Aquatic affinity', min: 0, max: 1, step: 0.1, description: 'Improves movement through wetland and shallow water.' },
  { key: 'terrainGrip', label: 'Terrain grip', min: 0, max: 1, step: 0.1, description: 'Improves movement through tundra and steep terrain.' },
  { key: 'toxinResistance', label: 'Toxin resistance', min: 0, max: 1, step: 0.1, description: 'Reduces damage from environmental toxicity.' },
];

export const FOUNDER_TRAIT_PRESETS = {
  balanced: {},
  efficient: { size: 0.7, speed: 0.8, visionRange: 4, metabolism: 0.65 },
  explorer: { size: 0.9, speed: 2, visionRange: 10, metabolism: 1.35 },
  adaptable: {
    size: 0.9,
    metabolism: 1.2,
    thermalTolerance: 0.5,
    waterRetention: 0.5,
    aquaticAffinity: 0.5,
    terrainGrip: 0.5,
    toxinResistance: 0.5,
  },
} satisfies Record<string, FounderTraitOverrides>;

export type FounderTraitPreset = keyof typeof FOUNDER_TRAIT_PRESETS;

export function buildFounderTraits(
  strategy: EnergyStrategy,
  overrides: FounderTraitOverrides = {}
): Traits {
  const traits: Traits = { ...DEFAULT_TRAITS, energyStrategy: strategy };
  const supported = new Set(FOUNDER_TRAIT_CONTROLS.map((control) => control.key));
  for (const [rawKey, rawValue] of Object.entries(overrides)) {
    if (!supported.has(rawKey as FounderTraitKey)) {
      throw new RangeError(`Unsupported founder trait: ${rawKey}`);
    }
    const key = rawKey as FounderTraitKey;
    if (
      typeof rawValue !== 'number' || !Number.isFinite(rawValue) ||
      rawValue < Number(TRAIT_MIN[key]) || rawValue > Number(TRAIT_MAX[key])
    ) {
      throw new RangeError(`Founder ${key} is outside the supported range`);
    }
    traits[key] = rawValue;
  }
  return traits;
}

export function founderTraitOverrides(traits: Traits): FounderTraitOverrides {
  const overrides: FounderTraitOverrides = {};
  for (const { key } of FOUNDER_TRAIT_CONTROLS) {
    if (traits[key] !== DEFAULT_TRAITS[key]) overrides[key] = traits[key];
  }
  return overrides;
}
