import { describe, expect, it } from 'vitest';
import { classifyBiome, generateTerrain, World } from '../simulation/world';
import { SIMULATION_CONSTANTS } from '../utils/constants';

describe('deterministic terrain', () => {
  it('generates identical terrain from the same seed', () => {
    expect(generateTerrain(24, 18, 42)).toEqual(generateTerrain(24, 18, 42));
  });

  it('generates different terrain from different seeds', () => {
    expect(generateTerrain(24, 18, 42)).not.toEqual(generateTerrain(24, 18, 43));
  });

  it('keeps environmental values normalized and creates multiple biomes', () => {
    const terrain = generateTerrain(100, 100, 12345);
    const biomes = new Set<string>();

    for (const row of terrain) {
      for (const cell of row) {
        expect(cell.elevation).toBeGreaterThanOrEqual(0);
        expect(cell.elevation).toBeLessThanOrEqual(1);
        expect(cell.moisture).toBeGreaterThanOrEqual(0);
        expect(cell.moisture).toBeLessThanOrEqual(1);
        expect(cell.temperature).toBeGreaterThanOrEqual(0);
        expect(cell.temperature).toBeLessThanOrEqual(1);
        biomes.add(cell.biome);
      }
    }

    expect(biomes.size).toBeGreaterThanOrEqual(4);
  });

  it('classifies representative environmental niches', () => {
    expect(classifyBiome(0.2, 0.5, 0.5)).toBe('ocean');
    expect(classifyBiome(0.9, 0.5, 0.5)).toBe('mountain');
    expect(classifyBiome(0.5, 0.5, 0.1)).toBe('tundra');
    expect(classifyBiome(0.5, 0.1, 0.7)).toBe('desert');
    expect(classifyBiome(0.5, 0.8, 0.7)).toBe('wetland');
    expect(classifyBiome(0.5, 0.6, 0.7)).toBe('forest');
    expect(classifyBiome(0.5, 0.4, 0.7)).toBe('grassland');
  });

  it('preserves terrain through world serialization', () => {
    const original = new World(20, 20, { ...SIMULATION_CONSTANTS, worldWidth: 20, worldHeight: 20 }, 77);
    const restored = World.fromJSON(original.toJSON());

    expect(restored.getCell(7, 11)).toEqual(original.getCell(7, 11));
  });
});
