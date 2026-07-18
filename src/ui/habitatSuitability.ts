import { getCellEnvironmentalStress } from '../simulation/biomeStress';
import type { CellSnapshot } from '../state/store';
import { DEFAULT_TRAITS, type EnergyStrategy, type Traits } from '../utils/traits';

export interface HabitatSuitability {
  rating: 'favorable' | 'mixed' | 'harsh';
  summary: string;
  adaptations: string[];
  stressPerTick: number;
}

const adaptationLabels: Array<[keyof Traits, string]> = [
  ['thermalTolerance', 'thermal tolerance'],
  ['waterRetention', 'water retention'],
  ['aquaticAffinity', 'aquatic affinity'],
  ['terrainGrip', 'terrain grip'],
];

export function describeHabitatSuitability(
  cell: CellSnapshot,
  traits: Traits,
  waterRelief: boolean
): HabitatSuitability {
  const stress = getCellEnvironmentalStress(traits, cell, waterRelief);
  const pressures: string[] = [];
  if (stress.temperatureCost > 0.03) pressures.push(cell.temperature < 0.28 ? 'cold exposure' : 'heat exposure');
  if (stress.hydrationCost > 0.03) pressures.push('limited water');
  if (stress.adaptationCost > 0) pressures.push('specialization energy cost');
  const rating = stress.totalCost >= 0.12 ? 'harsh' : stress.totalCost >= 0.04 ? 'mixed' : 'favorable';
  return {
    rating,
    stressPerTick: stress.totalCost,
    adaptations: adaptationLabels
      .filter(([trait]) => typeof traits[trait] === 'number' && Number(traits[trait]) > 0.5)
      .map(([, label]) => label),
    summary: pressures.length > 0
      ? `${rating[0].toUpperCase()}${rating.slice(1)} habitat: ${pressures.join(', ')}.`
      : 'Favorable habitat: no meaningful climate pressure.',
  };
}

export function describeFounderSuitability(
  cell: CellSnapshot,
  strategy: EnergyStrategy,
  livingCount: number,
  waterRelief: boolean
): string {
  const habitat = describeHabitatSuitability(cell, { ...DEFAULT_TRAITS, energyStrategy: strategy }, waterRelief);
  const foodReady = strategy === 'herbivore'
    ? cell.producerBiomass > 5
    : strategy === 'carnivore'
      ? livingCount > 0
      : cell.producerBiomass > 5 || livingCount > 0;
  return `${habitat.rating[0].toUpperCase()}${habitat.rating.slice(1)} introduction · ${foodReady ? 'food is locally available' : 'local food is scarce'} · ${habitat.summary}`;
}
