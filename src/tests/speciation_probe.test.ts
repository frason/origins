import { describe, it, expect } from 'vitest';
import { computeTraitFrequencies, classifyChange } from '../simulation/traitFrequency';
import { DEFAULT_TRAITS } from '../utils/traits';

function mk(i: number, overrides: any) {
  return {
    id: `c${i}`,
    traits: { ...DEFAULT_TRAITS, ...overrides.traits },
  } as any;
}

describe('karen probe: speciation reachability', () => {
  it('classifies energyStrategy shift as speciation when thresholds crossed', () => {
    const herb = Array.from({ length: 3 }, (_, i) => mk(i, { traits: { speed: 1.0, energyStrategy: 'herbivore' } }));
    const carn = Array.from({ length: 3 }, (_, i) => mk(i, { traits: { speed: 2.5, energyStrategy: 'carnivore' } }));
    const s1 = computeTraitFrequencies(herb, 10, 20, 'sp', 'lin');
    const s2 = computeTraitFrequencies(carn, 20, 30, 'sp', 'lin');
    console.log('s1 energyStrategy dist', JSON.stringify(s1?.traitFrequencies['energyStrategy']));
    console.log('s2 energyStrategy dist', JSON.stringify(s2?.traitFrequencies['energyStrategy']));
    const result = classifyChange(s2!, s1!, 'energyStrategy' as any);
    console.log('classification result:', result);
    expect(result).toBe('speciation');
  });
});
