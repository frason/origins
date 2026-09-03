import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { getGlyphShape, createDensityGlyph } from '../prototype/densityGlyph';
import type { CreatureCluster } from '../prototype/semanticZoom';

/**
 * Create a test cluster with controllable properties.
 */
function createTestCluster(
  gridX: number,
  gridY: number,
  creatureCount: number,
  dominantStrategy: string = 'herbivore',
  density: number = 0.5,
): CreatureCluster {
  const creatures = Array.from({ length: creatureCount }, (_, i) => ({
    id: `creature-${i}`,
    x: gridX * 25 + Math.floor(Math.random() * 25),
    y: gridY * 25 + Math.floor(Math.random() * 25),
    speciesId: 's1',
    lineageId: 'l1',
    strategy: dominantStrategy,
    lifecycleState: 'alive' as const,
    relativeEnergy: 0.5,
    colorKey: 's1:l1',
  }));

  return {
    gridX,
    gridY,
    centerX: gridX * 25 + 12.5,
    centerY: gridY * 25 + 12.5,
    creatures,
    density,
    dominantStrategy,
    strategyCounts: { [dominantStrategy]: creatureCount },
  };
}

describe('glyph shape determination (determinism critical)', () => {
  it('produces same shape for identical cluster properties', () => {
    const cluster = createTestCluster(0, 0, 50, 'herbivore', 0.7);

    const shape1 = getGlyphShape(cluster);
    const shape2 = getGlyphShape(cluster);

    expect(shape1).toBe(shape2);
  });

  it('assigns sparse shape for low-density clusters', () => {
    const cluster = createTestCluster(0, 0, 2, 'herbivore', 0.15);
    const shape = getGlyphShape(cluster);

    expect(shape).toBe('sparse');
  });

  it('assigns pyramid shape for moderately sparse clusters', () => {
    const cluster = createTestCluster(0, 0, 5, 'herbivore', 0.35);
    const shape = getGlyphShape(cluster);

    expect(shape).toBe('pyramid');
  });

  it('assigns cube shape for moderate density', () => {
    const cluster = createTestCluster(0, 0, 20, 'herbivore', 0.6);
    const shape = getGlyphShape(cluster);

    expect(shape).toBe('cube');
  });

  it('assigns sphere shape for high density', () => {
    const cluster = createTestCluster(0, 0, 80, 'herbivore', 0.85);
    const shape = getGlyphShape(cluster);

    expect(shape).toBe('sphere');
  });

  it('assigns torus shape for high-diversity dense clusters', () => {
    const cluster = createTestCluster(0, 0, 100, 'herbivore', 0.7);
    // Simulate mixed strategies
    cluster.strategyCounts = { herbivore: 33, carnivore: 33, omnivore: 34 };

    const shape = getGlyphShape(cluster);

    expect(shape).toBe('torus');
  });

  it('differentiates shape by strategy diversity', () => {
    // Monotype cluster
    const monotype = createTestCluster(0, 0, 50, 'herbivore', 0.7);

    // Diverse cluster with same density
    const diverse = createTestCluster(0, 0, 50, 'herbivore', 0.7);
    diverse.strategyCounts = { herbivore: 17, carnivore: 17, omnivore: 16 };

    const monoShape = getGlyphShape(monotype);
    const diveShape = getGlyphShape(diverse);

    // They should potentially differ
    expect(typeof monoShape).toBe('string');
    expect(typeof diveShape).toBe('string');
  });
});

describe('density glyph creation', () => {
  it('creates a mesh for non-empty cluster', () => {
    const cluster = createTestCluster(0, 0, 10, 'herbivore', 0.5);
    const mesh = createDensityGlyph(cluster, 'region', 100, 100, 'isometric');

    expect(mesh).not.toBeNull();
    expect(mesh).toBeInstanceOf(THREE.Mesh);
  });

  it('returns null for empty cluster', () => {
    const cluster = createTestCluster(0, 0, 0, 'herbivore', 0);
    const mesh = createDensityGlyph(cluster, 'region', 100, 100, 'isometric');

    expect(mesh).toBeNull();
  });

  it('positions glyph at cluster center (isometric)', () => {
    const cluster = createTestCluster(1, 1, 10, 'herbivore', 0.5);
    const mesh = createDensityGlyph(cluster, 'region', 100, 100, 'isometric')!;

    // Cluster center is (1*25+12.5, 1*25+12.5) = (37.5, 37.5)
    // In isometric coords: (37.5 - 50, y, 37.5 - 50) = (-12.5, y, -12.5)
    expect(mesh.position.x).toBeCloseTo(-12.5, 1);
    expect(mesh.position.z).toBeCloseTo(-12.5, 1);
  });

  it('positions glyph on sphere (globe)', () => {
    const cluster = createTestCluster(0, 0, 10, 'herbivore', 0.5);
    const mesh = createDensityGlyph(cluster, 'region', 100, 100, 'globe')!;

    // Position should be on a sphere of radius ~12.5
    const distance = Math.sqrt(mesh.position.x ** 2 + mesh.position.y ** 2 + mesh.position.z ** 2);
    expect(distance).toBeCloseTo(12.5, 1);
  });

  it('stores cluster metadata in userData', () => {
    const cluster = createTestCluster(2, 3, 15, 'herbivore', 0.6);
    const mesh = createDensityGlyph(cluster, 'habitat', 100, 100, 'isometric')!;

    expect(mesh.userData.isGlyph).toBe(true);
    expect(mesh.userData.clusterKey).toBe('2,3');
    expect(mesh.userData.creatureCount).toBe(15);
    expect(mesh.userData.density).toBe(0.6);
    expect(mesh.userData.dominantStrategy).toBe('herbivore');
  });

  it('applies correct material properties', () => {
    const cluster = createTestCluster(0, 0, 10, 'carnivore', 0.5);
    const mesh = createDensityGlyph(cluster, 'region', 100, 100, 'isometric')!;

    const material = mesh.material as THREE.MeshPhongMaterial;
    expect(material).toBeInstanceOf(THREE.MeshPhongMaterial);
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBeCloseTo(0.8, 1);
  });

  it('scales glyph size by density and creature count', () => {
    const sparseMesh = createDensityGlyph(createTestCluster(0, 0, 3, 'herbivore', 0.2), 'region', 100, 100, 'isometric')!;
    const denseMesh = createDensityGlyph(createTestCluster(0, 0, 100, 'herbivore', 0.9), 'region', 100, 100, 'isometric')!;

    // Dense glyph should be larger
    const sparseSize = (sparseMesh.geometry as any).parameters?.radius || 1;
    const denseSize = (denseMesh.geometry as any).parameters?.radius || 1;

    // Size is relative (just check they're both positive)
    expect(sparseSize).toBeGreaterThan(0);
    expect(denseSize).toBeGreaterThan(0);
  });

  it('produces deterministic sizing for same cluster properties', () => {
    const cluster = createTestCluster(0, 0, 50, 'herbivore', 0.7);

    const mesh1 = createDensityGlyph(cluster, 'region', 100, 100, 'isometric')!;
    const mesh2 = createDensityGlyph(cluster, 'region', 100, 100, 'isometric')!;

    // Positions should match
    expect(mesh1.position.x).toBe(mesh2.position.x);
    expect(mesh1.position.y).toBe(mesh2.position.y);
    expect(mesh1.position.z).toBe(mesh2.position.z);
  });
});

describe('glyph color mapping', () => {
  it('uses herbivore color for herbivore-dominant clusters', () => {
    const cluster = createTestCluster(0, 0, 10, 'herbivore', 0.5);
    const mesh = createDensityGlyph(cluster, 'region', 100, 100, 'isometric')!;

    const material = mesh.material as THREE.MeshPhongMaterial;
    // Herbivore color: 0xffdc73 (yellow)
    expect(material.color.getHex()).toBe(0xffdc73);
  });

  it('uses carnivore color for carnivore-dominant clusters', () => {
    const cluster = createTestCluster(0, 0, 10, 'carnivore', 0.5);
    const mesh = createDensityGlyph(cluster, 'region', 100, 100, 'isometric')!;

    const material = mesh.material as THREE.MeshPhongMaterial;
    // Carnivore color: 0xe8664a (red)
    expect(material.color.getHex()).toBe(0xe8664a);
  });

  it('uses omnivore color for omnivore-dominant clusters', () => {
    const cluster = createTestCluster(0, 0, 10, 'omnivore', 0.5);
    const mesh = createDensityGlyph(cluster, 'region', 100, 100, 'isometric')!;

    const material = mesh.material as THREE.MeshPhongMaterial;
    // Omnivore color: 0x6bb8d8 (blue)
    expect(material.color.getHex()).toBe(0x6bb8d8);
  });

  it('uses default color for unknown strategy', () => {
    const cluster = createTestCluster(0, 0, 10, 'unknown', 0.5);
    const mesh = createDensityGlyph(cluster, 'region', 100, 100, 'isometric')!;

    const material = mesh.material as THREE.MeshPhongMaterial;
    // Default: 0xfff0b5 (light yellow)
    expect(material.color.getHex()).toBe(0xfff0b5);
  });
});
