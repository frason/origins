import { describe, expect, it } from 'vitest';
import { getBiodiversityState, getEcosystemHealth } from '../ui/ecosystemHealth';

describe('ecosystem health indicators', () => {
  it('classifies biodiversity at the requested thresholds', () => {
    expect(getBiodiversityState(0).tone).toBe('danger');
    expect(getBiodiversityState(1).tone).toBe('danger');
    expect(getBiodiversityState(2).tone).toBe('warning');
    expect(getBiodiversityState(4).tone).toBe('warning');
    expect(getBiodiversityState(5).tone).toBe('healthy');
  });

  it('reports collapse when creatures or producer biomass reach zero', () => {
    expect(getEcosystemHealth({
      speciesCount: 4,
      totalPopulation: 0,
      totalBiomass: 100,
      tick: 10,
      previousPopulation: 5,
    }).label).toBe('Collapsing');
    expect(getEcosystemHealth({
      speciesCount: 4,
      totalPopulation: 10,
      totalBiomass: 0,
      tick: 10,
      previousPopulation: 10,
    }).label).toBe('Collapsing');
  });

  it('keeps low-diversity and rapidly declining ecosystems at risk', () => {
    expect(getEcosystemHealth({
      speciesCount: 2,
      totalPopulation: 20,
      totalBiomass: 100,
      tick: 200,
      previousPopulation: 20,
    }).label).toBe('At Risk');
    expect(getEcosystemHealth({
      speciesCount: 6,
      totalPopulation: 80,
      totalBiomass: 100,
      tick: 200,
      previousPopulation: 100,
    }).label).toBe('At Risk');
  });

  it('distinguishes stable from established thriving ecosystems', () => {
    expect(getEcosystemHealth({
      speciesCount: 4,
      totalPopulation: 20,
      totalBiomass: 100,
      tick: 50,
      previousPopulation: 20,
    }).label).toBe('Stable');
    expect(getEcosystemHealth({
      speciesCount: 5,
      totalPopulation: 20,
      totalBiomass: 100,
      tick: 101,
      previousPopulation: 20,
    }).label).toBe('Thriving');
  });
});
