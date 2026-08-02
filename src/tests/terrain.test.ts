import { describe, expect, it } from 'vitest';
import { classifyBiome, generateTerrain, World } from '../simulation/world';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import { getProducerArchetype } from '../simulation/producerTypes';
import type { Biome, TerrainCell } from '../simulation/world';

function biomeCells(terrain: TerrainCell[][], biome: Biome): Array<[number, number]> {
  return terrain.flatMap((row, y) =>
    row.flatMap((cell, x) => cell.biome === biome ? [[x, y] as [number, number]] : [])
  );
}

function largestWrappedComponent(terrain: TerrainCell[][], biome: Biome): number {
  const height = terrain.length;
  const width = terrain[0]?.length ?? 0;
  const remaining = new Set(biomeCells(terrain, biome).map(([x, y]) => `${x}:${y}`));
  let largest = 0;
  while (remaining.size > 0) {
    const first = remaining.values().next().value as string;
    remaining.delete(first);
    const queue = [first];
    let size = 0;
    while (queue.length > 0) {
      const [x, y] = queue.pop()!.split(':').map(Number);
      size++;
      for (const [nextX, nextY] of [
        [(x + width - 1) % width, y],
        [(x + 1) % width, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        const key = `${nextX}:${nextY}`;
        if (nextY < 0 || nextY >= height || !remaining.delete(key)) continue;
        queue.push(key);
      }
    }
    largest = Math.max(largest, size);
  }
  return largest;
}

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

  it('assigns a fitting producer archetype to every biome', () => {
    expect(getProducerArchetype('ocean')).toBe('photic-algae');
    expect(getProducerArchetype('desert')).toBe('xerophyte-mat');
    expect(getProducerArchetype('grassland')).toBe('ground-cover');
    expect(getProducerArchetype('forest')).toBe('canopy-colony');
    expect(getProducerArchetype('wetland')).toBe('marsh-biofilm');
    expect(getProducerArchetype('tundra')).toBe('frost-lichen');
    expect(getProducerArchetype('mountain')).toBe('lithotroph');
  });

  it('preserves terrain through world serialization', () => {
    const original = new World(20, 20, { ...SIMULATION_CONSTANTS, worldWidth: 20, worldHeight: 20 }, 77);
    const restored = World.fromJSON(original.toJSON());

    expect(restored.getCell(7, 11)).toEqual(original.getCell(7, 11));
  });

  it('forms connected mountain ranges and regional deserts across approved seeds', () => {
    for (const seed of [42, 12345, 54321, 99999]) {
      const terrain = generateTerrain(100, 100, seed);
      const mountains = biomeCells(terrain, 'mountain');
      const deserts = biomeCells(terrain, 'desert');

      expect(mountains.length, `seed ${seed} mountain coverage`).toBeGreaterThan(20);
      expect(
        largestWrappedComponent(terrain, 'mountain') / mountains.length,
        `seed ${seed} connected mountain share`
      ).toBeGreaterThan(0.3);
      if (deserts.length > 0) {
        expect(
          largestWrappedComponent(terrain, 'desert') / deserts.length,
          `seed ${seed} regional desert share`
        ).toBeGreaterThan(0.15);
      }
    }
  });

  it('uses latitude for polar tundra, temperate forests, and central grassland', () => {
    for (const seed of [42, 12345, 54321, 99999]) {
      const terrain = generateTerrain(100, 100, seed);
      const tundra = biomeCells(terrain, 'tundra');
      const grassland = biomeCells(terrain, 'grassland');
      const forest = biomeCells(terrain, 'forest');
      const polarShare = tundra.filter(([, y]) => y < 25 || y >= 75).length /
        Math.max(1, tundra.length);
      const temperateGrassShare = grassland.filter(([, y]) => y >= 20 && y < 80).length /
        Math.max(1, grassland.length);
      const transitionForests = forest.filter(([, y]) =>
        (y >= 12 && y < 38) || (y >= 62 && y < 88)
      ).length;

      expect(polarShare, `seed ${seed} polar tundra`).toBeGreaterThan(0.8);
      expect(temperateGrassShare, `seed ${seed} temperate grass`).toBeGreaterThan(0.7);
      expect(transitionForests, `seed ${seed} forest transition`).toBeGreaterThan(0);
    }
  });

  it('wraps east and west without an anomalous environmental seam', () => {
    for (const seed of [42, 12345, 54321, 99999]) {
      const terrain = generateTerrain(100, 100, seed);
      const boundaryDifferences = Array.from({ length: terrain[0].length }, (_, leftX) => {
        const rightX = (leftX + 1) % terrain[0].length;
        return terrain.reduce((sum, row) =>
          sum +
          Math.abs(row[leftX].elevation - row[rightX].elevation) +
          Math.abs(row[leftX].moisture - row[rightX].moisture) +
          Math.abs(row[leftX].temperature - row[rightX].temperature),
        0) / terrain.length;
      });
      const seamDifference = boundaryDifferences[boundaryDifferences.length - 1];
      const largestInteriorDifference = Math.max(...boundaryDifferences.slice(0, -1));

      expect(seamDifference, `seed ${seed} absolute seam`).toBeLessThan(0.2);
      expect(seamDifference, `seed ${seed} seam versus interior`).toBeLessThanOrEqual(
        largestInteriorDifference
      );
    }
  });

  it('represents every biome across the approved fixture set within budget', () => {
    const started = performance.now();
    const represented = new Set<Biome>();
    for (const seed of [42, 12345, 54321, 99999]) {
      for (const row of generateTerrain(100, 100, seed)) {
        for (const cell of row) represented.add(cell.biome);
      }
    }

    expect([...represented].sort()).toEqual([
      'desert', 'forest', 'grassland', 'mountain', 'ocean', 'tundra', 'wetland',
    ]);
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});
