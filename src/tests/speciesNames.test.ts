import { describe, expect, it } from 'vitest';
import {
  customSpeciesName,
  introducedSpeciesId,
  lineageDisplayName,
  normalizeSpeciesName,
  speciesDisplayName,
  suggestedIntroducedSpeciesName,
} from '../simulation/speciesNames';
import { FOUNDER_SPECIES } from '../simulation/founderSpecies';

describe('reproducible species names', () => {
  it('returns the same pseudo-Latin name for the same stable ID', () => {
    expect(speciesDisplayName('herbivore_001')).toBe(
      speciesDisplayName('herbivore_001')
    );
    expect(speciesDisplayName('herbivore_001')).toMatch(/^[A-Z][a-z]+ [a-z]+$/);
  });

  it('uses readable, distinct names for the eight founding starter species', () => {
    const names = FOUNDER_SPECIES.map((species) => speciesDisplayName(species.id));
    expect(names).toEqual(FOUNDER_SPECIES.map((species) => species.name));
    expect(new Set(names).size).toBe(8);
  });

  it('keeps the genus while giving mutated lineages distinct names', () => {
    const founder = lineageDisplayName('herbivore_001', 'herbivore_001');
    const branch = lineageDisplayName('herbivore_001', 'lineage_12345678_abcdef');

    expect(branch.split(' ')[0]).toBe(founder.split(' ')[0]);
    expect(branch).not.toBe(founder);
  });

  it('recognizes explicit root lineage IDs as founders', () => {
    expect(lineageDisplayName('grazer', 'grazer_root')).toBe(
      speciesDisplayName('grazer')
    );
  });

  it('normalizes and preserves player names in species and lineage labels', () => {
    const id = introducedSpeciesId('herbivore', 1, '  Little   Snow Walkers\n');

    expect(normalizeSpeciesName('  Little   Snow Walkers\n')).toBe('Little Snow Walkers');
    expect(customSpeciesName(id)).toBe('Little Snow Walkers');
    expect(speciesDisplayName(id)).toBe('Little Snow Walkers');
    expect(lineageDisplayName(id, 'mutated_branch')).toMatch(/^Little Snow Walkers — /);
  });

  it('uses its deterministic suggestion when a requested name is blank', () => {
    const id = introducedSpeciesId('scavenger', 2, '   ');
    expect(speciesDisplayName(id)).toBe(suggestedIntroducedSpeciesName('scavenger', 2));
  });
});
