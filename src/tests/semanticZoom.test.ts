import { describe, it, expect } from 'vitest';
import {
  getZoomLevel,
  clusterCreaturesByZoom,
  shouldRenderIndividually,
  getLineageFocus,
  getRegionFocus,
  calculateCameraDistanceForRegion,
  type CreatureCluster,
  type ZoomLevel,
} from '../prototype/semanticZoom';
import type { PrototypeWorldSnapshot, PrototypeCreature } from '../prototype/worldSnapshot';

/**
 * Create a minimal test snapshot with controllable creatures and world size.
 */
function createTestSnapshot(worldWidth: number, worldHeight: number, creatures: PrototypeCreature[]): PrototypeWorldSnapshot {
  const cells = Array.from({ length: worldWidth * worldHeight }, (_, i) => ({
    x: i % worldWidth,
    y: Math.floor(i / worldWidth),
    biome: 'grassland' as const,
    elevation: 0,
    moisture: 0.5,
    temperature: 20,
    producerBiomass: 100,
    toxicity: 0,
    energy: 50,
  }));

  return {
    version: 1,
    source: { seed: 42, tick: 0 },
    world: { width: worldWidth, height: worldHeight, cells },
    creatures,
    events: [],
  };
}

describe('semantic zoom levels', () => {
  it('determines zoom level based on camera distance in world units', () => {
    const worldWidth = 100;
    const worldHeight = 100;

    // Very far away: world view (> 120 units)
    expect(getZoomLevel(worldWidth, worldHeight, 150)).toBe('world');
    expect(getZoomLevel(worldWidth, worldHeight, 130)).toBe('world');
    expect(getZoomLevel(worldWidth, worldHeight, 121)).toBe('world');

    // Closer: region view (60 < distance ≤ 120)
    expect(getZoomLevel(worldWidth, worldHeight, 120)).toBe('region');
    expect(getZoomLevel(worldWidth, worldHeight, 90)).toBe('region');
    expect(getZoomLevel(worldWidth, worldHeight, 61)).toBe('region');

    // Even closer: habitat view (30 < distance ≤ 60)
    expect(getZoomLevel(worldWidth, worldHeight, 60)).toBe('habitat');
    expect(getZoomLevel(worldWidth, worldHeight, 45)).toBe('habitat');
    expect(getZoomLevel(worldWidth, worldHeight, 31)).toBe('habitat');

    // Very close: local view (distance ≤ 30)
    expect(getZoomLevel(worldWidth, worldHeight, 30)).toBe('local');
    expect(getZoomLevel(worldWidth, worldHeight, 15)).toBe('local');
    expect(getZoomLevel(worldWidth, worldHeight, 8)).toBe('local');
  });

  it('validates zoom levels across OrbitControls isometric distance range (20–180)', () => {
    // Production renderer uses OrbitControls with minDistance 20, maxDistance 180 for isometric
    // This test verifies all zoom tiers are reachable within this range

    // At minimum distance (20): local zoom
    expect(getZoomLevel(100, 100, 20)).toBe('local');

    // Transition from local to habitat (around 30)
    expect(getZoomLevel(100, 100, 29.9)).toBe('local');
    expect(getZoomLevel(100, 100, 30.1)).toBe('habitat');

    // Mid-range: habitat and region
    expect(getZoomLevel(100, 100, 45)).toBe('habitat');
    expect(getZoomLevel(100, 100, 65)).toBe('region');

    // Initial isometric position distance ≈ 131.7 (camera at (78, 72, 78))
    const isometricDistance = Math.sqrt(78 * 78 + 72 * 72 + 78 * 78);
    expect(getZoomLevel(100, 100, isometricDistance)).toBe('world');

    // At maximum distance (180): world zoom
    expect(getZoomLevel(100, 100, 180)).toBe('world');
  });

  it('validates zoom levels across OrbitControls globe distance range (18–75)', () => {
    // Production renderer uses OrbitControls with minDistance 18, maxDistance 75 for globe
    // This test verifies the zoom experience for globe mode

    // At minimum distance (18): local zoom
    expect(getZoomLevel(100, 100, 18)).toBe('local');

    // Initial globe position distance ≈ 31.3 (camera at (0, 8, 31))
    const globeDistance = Math.sqrt(0 * 0 + 8 * 8 + 31 * 31);
    expect(getZoomLevel(100, 100, globeDistance)).toBe('habitat');

    // At maximum distance (75): habitat/region boundary, but reachable for wide world view
    expect(getZoomLevel(100, 100, 75)).toBe('region');

    // Mid-range exploration
    expect(getZoomLevel(100, 100, 40)).toBe('habitat');
  });

  it('handles non-square worlds consistently (world size does not affect thresholds)', () => {
    // Thresholds are based purely on camera distance, not world dimensions
    // Tall world
    const tallZoom1 = getZoomLevel(50, 100, 140);
    expect(tallZoom1).toBe('world');

    const tallZoom2 = getZoomLevel(50, 100, 45);
    expect(tallZoom2).toBe('habitat');

    // Wide world (same distances produce same zoom levels)
    const wideZoom1 = getZoomLevel(100, 50, 140);
    expect(wideZoom1).toBe('world');

    const wideZoom2 = getZoomLevel(100, 50, 45);
    expect(wideZoom2).toBe('habitat');
  });

  it('initializes at world zoom with default isometric camera distance', () => {
    // Initial camera position (78, 72, 78) has distance ≈ 131.7 units
    const initialDistance = Math.sqrt(78 * 78 + 72 * 72 + 78 * 78);
    expect(initialDistance).toBeGreaterThan(120);
    expect(getZoomLevel(100, 100, initialDistance)).toBe('world');
  });
});

describe('creature clustering (determinism critical)', () => {
  it('produces identical clustering for same seed and zoom level', () => {
    const creatures: PrototypeCreature[] = Array.from({ length: 50 }, (_, i) => ({
      id: `creature-${i}`,
      x: Math.floor(Math.random() * 100),
      y: Math.floor(Math.random() * 100),
      speciesId: `species-${i % 5}`,
      lineageId: `lineage-${i % 3}`,
      strategy: ['herbivore', 'carnivore', 'omnivore'][i % 3],
      lifecycleState: 'alive',
      relativeEnergy: 0.7,
      colorKey: `${i % 5}:${i % 3}`,
    }));

    const snapshot = createTestSnapshot(100, 100, creatures);

    // Cluster twice with same data
    const clusters1 = clusterCreaturesByZoom(snapshot, 'region');
    const clusters2 = clusterCreaturesByZoom(snapshot, 'region');

    // Should produce identical clusters
    expect(clusters1.size).toBe(clusters2.size);

    clusters1.forEach((cluster1, key) => {
      const cluster2 = clusters2.get(key);
      expect(cluster2).toBeDefined();
      expect(cluster2!.creatures.length).toBe(cluster1.creatures.length);
      expect(cluster2!.density).toBe(cluster1.density);
      expect(cluster2!.dominantStrategy).toBe(cluster1.dominantStrategy);
    });
  });

  it('distributes creatures into correct clusters at each zoom level', () => {
    const creatures: PrototypeCreature[] = [
      // Region 0,0 (0-24, 0-24)
      { id: '1', x: 5, y: 5, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
      { id: '2', x: 10, y: 10, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
      // Region 1,0 (25-49, 0-24)
      { id: '3', x: 30, y: 15, speciesId: 's2', lineageId: 'l2', strategy: 'carnivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's2:l2' },
      // Dead creature (should not be clustered)
      { id: '4', x: 50, y: 50, speciesId: 's3', lineageId: 'l3', strategy: 'omnivore', lifecycleState: 'dead', relativeEnergy: 0.0, colorKey: 's3:l3' },
    ];

    const snapshot = createTestSnapshot(100, 100, creatures);
    const clusters = clusterCreaturesByZoom(snapshot, 'world');

    // Find cluster containing creature 1 and 2
    const cluster0 = clusters.get('0,0');
    expect(cluster0).toBeDefined();
    expect(cluster0!.creatures.length).toBeGreaterThanOrEqual(2);

    // Find cluster containing creature 3
    const cluster1 = clusters.get('1,0');
    expect(cluster1).toBeDefined();

    // Dead creatures should not be in any cluster
    const allAlive = Array.from(clusters.values()).flatMap((c) => c.creatures);
    expect(allAlive.every((c) => c.lifecycleState === 'alive')).toBe(true);
  });

  it('calculates density correctly', () => {
    const creatures: PrototypeCreature[] = Array.from({ length: 100 }, (_, i) => ({
      id: `creature-${i}`,
      x: Math.floor(i % 25),
      y: Math.floor(i / 25),
      speciesId: 's1',
      lineageId: 'l1',
      strategy: 'herbivore',
      lifecycleState: 'alive',
      relativeEnergy: 0.5,
      colorKey: 's1:l1',
    }));

    const snapshot = createTestSnapshot(100, 100, creatures);
    const clusters = clusterCreaturesByZoom(snapshot, 'world');

    // Cluster 0,0 should be dense
    const denseCluster = clusters.get('0,0');
    expect(denseCluster).toBeDefined();
    expect(denseCluster!.density).toBeGreaterThan(0.5);

    // Sparse region should have low density
    const sparseCluster = clusters.get('3,3');
    expect(sparseCluster!.density).toBeLessThan(0.1);
  });

  it('identifies dominant strategy correctly', () => {
    const creatures: PrototypeCreature[] = [
      { id: '1', x: 5, y: 5, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
      { id: '2', x: 6, y: 6, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
      { id: '3', x: 7, y: 7, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
      { id: '4', x: 8, y: 8, speciesId: 's2', lineageId: 'l2', strategy: 'carnivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's2:l2' },
    ];

    const snapshot = createTestSnapshot(100, 100, creatures);
    const clusters = clusterCreaturesByZoom(snapshot, 'world');
    const cluster = clusters.get('0,0');

    expect(cluster!.dominantStrategy).toBe('herbivore'); // 3 herbivores vs 1 carnivore
  });

  it('handles empty regions gracefully', () => {
    const creatures: PrototypeCreature[] = [
      { id: '1', x: 5, y: 5, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
    ];

    const snapshot = createTestSnapshot(100, 100, creatures);
    const clusters = clusterCreaturesByZoom(snapshot, 'region');

    // Most clusters will be empty
    let emptyCount = 0;
    clusters.forEach((cluster) => {
      if (cluster.creatures.length === 0) emptyCount++;
    });

    expect(emptyCount).toBeGreaterThan(0);
    expect(clusters.size).toBeGreaterThan(emptyCount);
  });
});

describe('individual rendering decision', () => {
  it('renders all creatures individually at local zoom', () => {
    const creatures: PrototypeCreature[] = Array.from({ length: 50 }, (_, i) => ({
      id: `creature-${i}`,
      x: Math.floor(Math.random() * 100),
      y: Math.floor(Math.random() * 100),
      speciesId: 's1',
      lineageId: 'l1',
      strategy: 'herbivore',
      lifecycleState: 'alive',
      relativeEnergy: 0.5,
      colorKey: 's1:l1',
    }));

    const snapshot = createTestSnapshot(100, 100, creatures);
    const clusters = clusterCreaturesByZoom(snapshot, 'local');

    clusters.forEach((cluster) => {
      cluster.creatures.forEach((creature) => {
        expect(shouldRenderIndividually(creature, 'local', cluster)).toBe(true);
      });
    });
  });

  it('does not render creatures individually at world zoom', () => {
    const creatures: PrototypeCreature[] = [
      { id: '1', x: 5, y: 5, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
    ];

    const snapshot = createTestSnapshot(100, 100, creatures);
    const clusters = clusterCreaturesByZoom(snapshot, 'world');

    clusters.forEach((cluster) => {
      cluster.creatures.forEach((creature) => {
        expect(shouldRenderIndividually(creature, 'world', cluster)).toBe(false);
      });
    });
  });

  it('renders sparse clusters individually at middle zoom levels', () => {
    const creatures: PrototypeCreature[] = [
      // Single creature in a region
      { id: '1', x: 5, y: 5, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
    ];

    const snapshot = createTestSnapshot(100, 100, creatures);
    const clusters = clusterCreaturesByZoom(snapshot, 'region');

    clusters.forEach((cluster) => {
      if (cluster.creatures.length <= 1) {
        cluster.creatures.forEach((creature) => {
          expect(shouldRenderIndividually(creature, 'region', cluster)).toBe(true);
        });
      }
    });
  });
});

describe('lineage focus', () => {
  it('returns creatures of target lineage plus nearby context', () => {
    const creatures: PrototypeCreature[] = [
      { id: '1', x: 10, y: 10, speciesId: 's1', lineageId: 'target', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:target' },
      { id: '2', x: 11, y: 11, speciesId: 's1', lineageId: 'target', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:target' },
      { id: '3', x: 12, y: 12, speciesId: 's1', lineageId: 'other', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:other' },
      { id: '4', x: 50, y: 50, speciesId: 's1', lineageId: 'other', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:other' },
    ];

    const snapshot = createTestSnapshot(100, 100, creatures);
    const focused = getLineageFocus(snapshot, 'target');

    // Should include target lineage creatures
    expect(focused.some((c) => c.lineageId === 'target')).toBe(true);
    expect(focused.length).toBeGreaterThanOrEqual(2);

    // Should include nearby context creature
    expect(focused.some((c) => c.id === '3')).toBe(true);

    // Should NOT include distant other creatures
    expect(focused.some((c) => c.id === '4')).toBe(false);
  });

  it('returns empty array for non-existent lineage', () => {
    const creatures: PrototypeCreature[] = [
      { id: '1', x: 10, y: 10, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
    ];

    const snapshot = createTestSnapshot(100, 100, creatures);
    const focused = getLineageFocus(snapshot, 'nonexistent');

    expect(focused).toEqual([]);
  });

  it('excludes dead creatures from lineage focus', () => {
    const creatures: PrototypeCreature[] = [
      { id: '1', x: 10, y: 10, speciesId: 's1', lineageId: 'target', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:target' },
      { id: '2', x: 11, y: 11, speciesId: 's1', lineageId: 'target', strategy: 'herbivore', lifecycleState: 'dead', relativeEnergy: 0.0, colorKey: 's1:target' },
    ];

    const snapshot = createTestSnapshot(100, 100, creatures);
    const focused = getLineageFocus(snapshot, 'target');

    expect(focused.every((c) => c.lifecycleState === 'alive')).toBe(true);
  });
});

describe('region focus', () => {
  it('returns creatures within specified region', () => {
    const creatures: PrototypeCreature[] = [
      { id: '1', x: 10, y: 10, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
      { id: '2', x: 20, y: 20, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
      { id: '3', x: 50, y: 50, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
    ];

    const snapshot = createTestSnapshot(100, 100, creatures);
    const focused = getRegionFocus(snapshot, 5, 25, 5, 25);

    expect(focused.length).toBe(2); // creatures 1 and 2
    expect(focused.some((c) => c.id === '1')).toBe(true);
    expect(focused.some((c) => c.id === '2')).toBe(true);
    expect(focused.some((c) => c.id === '3')).toBe(false);
  });

  it('returns empty array for empty region', () => {
    const creatures: PrototypeCreature[] = [
      { id: '1', x: 10, y: 10, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
    ];

    const snapshot = createTestSnapshot(100, 100, creatures);
    const focused = getRegionFocus(snapshot, 50, 60, 50, 60);

    expect(focused).toEqual([]);
  });

  it('excludes dead creatures from region focus', () => {
    const creatures: PrototypeCreature[] = [
      { id: '1', x: 10, y: 10, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
      { id: '2', x: 15, y: 15, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'dead', relativeEnergy: 0.0, colorKey: 's1:l1' },
    ];

    const snapshot = createTestSnapshot(100, 100, creatures);
    const focused = getRegionFocus(snapshot, 5, 20, 5, 20);

    expect(focused.length).toBe(1);
    expect(focused[0].lifecycleState).toBe('alive');
  });
});

describe('camera distance calculation', () => {
  it('calculates appropriate distances for each zoom level', () => {
    const region = { minX: 0, maxX: 25, minY: 0, maxY: 25 };

    const worldDist = calculateCameraDistanceForRegion(region, 'world', 'isometric');
    const regionDist = calculateCameraDistanceForRegion(region, 'region', 'isometric');
    const habitatDist = calculateCameraDistanceForRegion(region, 'habitat', 'isometric');
    const localDist = calculateCameraDistanceForRegion(region, 'local', 'isometric');

    // Distances should be in descending order (farther = larger world view)
    expect(worldDist).toBeGreaterThan(regionDist);
    expect(regionDist).toBeGreaterThan(habitatDist);
    expect(habitatDist).toBeGreaterThan(localDist);
  });

  it('produces different distances for globe vs isometric', () => {
    const region = { minX: 10, maxX: 30, minY: 10, maxY: 30 };

    const isometricDist = calculateCameraDistanceForRegion(region, 'region', 'isometric');
    const globeDist = calculateCameraDistanceForRegion(region, 'region', 'globe');

    expect(isometricDist).not.toBe(globeDist);
  });
});
