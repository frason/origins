import { describe, expect, it } from 'vitest';
import {
  customSpeciesName,
  introducedSpeciesId,
  lineageDisplayName,
  normalizeSpeciesName,
  speciesDisplayName,
  suggestedIntroducedSpeciesName,
} from '../simulation/speciesNames';

describe('reproducible species names', () => {
  it('returns the same pseudo-Latin name for the same stable ID', () => {
    expect(speciesDisplayName('herbivore_001')).toBe(
      speciesDisplayName('herbivore_001')
    );
    expect(speciesDisplayName('herbivore_001')).toMatch(/^[A-Z][a-z]+ [a-z]+$/);
  });

  it('distinguishes the four founding starter species', () => {
    const names = [
      'herbivore_001',
      'omnivore_001',
      'carnivore_001',
      'scavenger_001',
    ].map(speciesDisplayName);

    expect(new Set(names).size).toBe(names.length);
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
