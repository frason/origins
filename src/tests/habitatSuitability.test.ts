import { describe, expect, it } from 'vitest';
import type { CellSnapshot } from '../state/store';
import { describeFounderSuitability, describeHabitatSuitability } from '../ui/habitatSuitability';
import { DEFAULT_TRAITS } from '../utils/traits';

const cell = (overrides: Partial<CellSnapshot> = {}): CellSnapshot => ({
  energy: 10, nutrients: 10, producerBiomass: 10, toxicity: 0,
  elevation: 0.5, moisture: 0.5, temperature: 0.5,
  biome: 'grassland', producerArchetype: 'ground-cover', ...overrides,
});

describe('habitat suitability explanations', () => {
  it('identifies cold and water pressure in harsh habitat', () => {
    const result = describeHabitatSuitability(
      cell({ biome: 'tundra', temperature: 0, moisture: 0 }),
      DEFAULT_TRAITS,
      false
    );
    expect(result.rating).toBe('harsh');
    expect(result.summary).toContain('cold exposure');
    expect(result.summary).toContain('limited water');
  });

  it('explains expressed adaptations and their tradeoff', () => {
    const result = describeHabitatSuitability(
      cell({ biome: 'tundra', temperature: 0 }),
      { ...DEFAULT_TRAITS, thermalTolerance: 1 },
      false
    );
    expect(result.adaptations).toContain('thermal tolerance');
    expect(result.summary).toContain('specialization energy cost');
  });

  it('previews strategy-specific food suitability for introductions', () => {
    const empty = cell({ producerBiomass: 0 });
    expect(describeFounderSuitability(empty, 'carnivore', 0, false)).toContain('food is scarce');
    expect(describeFounderSuitability(empty, 'carnivore', 2, false)).toContain('food is locally available');
  });
});
