import { describe, expect, it } from 'vitest';
import {
  buildFounderTraits,
  founderTraitOverrides,
  FOUNDER_TRAIT_PRESETS,
} from '../simulation/founderTraits';
import { DEFAULT_TRAITS } from '../utils/traits';

describe('founder trait selection', () => {
  it('builds a selected strategy with bounded functional trait overrides', () => {
    const traits = buildFounderTraits('herbivore', FOUNDER_TRAIT_PRESETS.efficient);

    expect(traits).toMatchObject({
      energyStrategy: 'herbivore',
      size: 0.7,
      speed: 0.8,
      metabolism: 0.65,
    });
    expect(traits.hearingRange).toBe(DEFAULT_TRAITS.hearingRange);
  });

  it('rejects invalid and unsupported recipe input', () => {
    expect(() => buildFounderTraits('omnivore', { speed: Number.NaN })).toThrow('speed');
    expect(() => buildFounderTraits(
      'omnivore',
      { hearingRange: 20 } as never
    )).toThrow('Unsupported founder trait');
  });

  it('extracts only selectable values that differ from balanced defaults', () => {
    const traits = buildFounderTraits('carnivore', { speed: 2, thermalTolerance: 0.6 });
    expect(founderTraitOverrides(traits)).toEqual({ speed: 2, thermalTolerance: 0.6 });
  });
});
