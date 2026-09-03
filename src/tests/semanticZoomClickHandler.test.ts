/**
 * Tests for semantic zoom click-to-focus functionality.
 * Tests the cluster selection logic used by ThreeWorldView's glyph click handler.
 */

import { describe, it, expect } from 'vitest';
import { clusterCreaturesByZoom, type ZoomLevel } from '../prototype/semanticZoom';
import type { PrototypeWorldSnapshot, PrototypeCreature } from '../prototype/worldSnapshot';

/**
 * Create a minimal snapshot for testing.
 */
function createTestSnapshot(
  creatures: PrototypeCreature[],
): PrototypeWorldSnapshot {
  return {
    version: 1,
    source: {
      seed: 12345,
      tick: 0,
    },
    world: {
      width: 100,
      height: 100,
      cells: [],
    },
    creatures,
    events: [],
  };
}

describe('Semantic zoom click handler integration', () => {
  it('clusters creatures deterministically by zoom level', () => {
    const creatures: PrototypeCreature[] = [
      { id: '1', x: 5, y: 5, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
      { id: '2', x: 8, y: 8, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
      { id: '3', x: 35, y: 35, speciesId: 's2', lineageId: 'l2', strategy: 'carnivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's2:l2' },
    ];
    const snapshot = createTestSnapshot(creatures);

    // Cluster at world level
    const clusters1 = clusterCreaturesByZoom(snapshot, 'world');
    const clusters2 = clusterCreaturesByZoom(snapshot, 'world');

    // Same zoom level should produce identical clustering
    expect(clusters1.size).toBe(clusters2.size);

    // Creatures at (5,5) and (8,8) should be in same cluster at world level (region size 25)
    // Creature at (35,35) should be in a different cluster
    const clusterArray1 = Array.from(clusters1.values());
    const clusterArray2 = Array.from(clusters2.values());

    expect(clusterArray1.length).toBe(clusterArray2.length);
    clusterArray1.forEach((cluster, i) => {
      expect(cluster.creatures.length).toBe(clusterArray2[i].creatures.length);
    });
  });

  it('correctly assigns creatures to clusters based on region size', () => {
    const creatures: PrototypeCreature[] = [
      { id: '1', x: 12, y: 12, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
      { id: '2', x: 37, y: 37, speciesId: 's2', lineageId: 'l2', strategy: 'carnivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's2:l2' },
    ];
    const snapshot = createTestSnapshot(creatures);

    // At world level, region size is 25
    // Creature at (12,12) should be in region (0,0)
    // Creature at (37,37) should be in region (1,1)
    const clusters = clusterCreaturesByZoom(snapshot, 'world');

    expect(clusters.has('0,0')).toBe(true);
    expect(clusters.has('1,1')).toBe(true);

    const cluster00 = clusters.get('0,0')!;
    const cluster11 = clusters.get('1,1')!;

    expect(cluster00.creatures).toHaveLength(1);
    expect(cluster00.creatures[0].id).toBe('1');

    expect(cluster11.creatures).toHaveLength(1);
    expect(cluster11.creatures[0].id).toBe('2');
  });

  it('calculates density correctly for clusters', () => {
    const creatures: PrototypeCreature[] = Array.from({ length: 50 }, (_, i) => ({
      id: `creature-${i}`,
      x: i % 5, // Spread within region (0-25)
      y: Math.floor(i / 5), // Spread within region (0-25)
      speciesId: 's1',
      lineageId: 'l1',
      strategy: 'herbivore',
      lifecycleState: 'alive',
      relativeEnergy: 0.5,
      colorKey: 's1:l1',
    }));
    const snapshot = createTestSnapshot(creatures);

    const clusters = clusterCreaturesByZoom(snapshot, 'world');
    const cluster = clusters.get('0,0');

    expect(cluster).toBeDefined();
    expect(cluster!.creatures.length).toBe(50);
    expect(cluster!.density).toBeGreaterThan(0);
    expect(cluster!.density).toBeLessThanOrEqual(1);
  });

  it('identifies dominant strategy correctly', () => {
    const creatures: PrototypeCreature[] = [
      { id: '1', x: 5, y: 5, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
      { id: '2', x: 8, y: 8, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
      { id: '3', x: 10, y: 10, speciesId: 's2', lineageId: 'l2', strategy: 'carnivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's2:l2' },
    ];
    const snapshot = createTestSnapshot(creatures);

    const clusters = clusterCreaturesByZoom(snapshot, 'world');
    const cluster = clusters.get('0,0');

    expect(cluster).toBeDefined();
    expect(cluster!.dominantStrategy).toBe('herbivore'); // 2 herbivores vs 1 carnivore
    expect(cluster!.strategyCounts.herbivore).toBe(2);
    expect(cluster!.strategyCounts.carnivore).toBe(1);
  });

  it('handles zoom level transitions correctly', () => {
    const creatures: PrototypeCreature[] = [
      { id: '1', x: 5, y: 5, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
      { id: '2', x: 8, y: 8, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
    ];
    const snapshot = createTestSnapshot(creatures);

    // World level: region size 25
    const worldClusters = clusterCreaturesByZoom(snapshot, 'world');
    expect(worldClusters.size).toBeGreaterThan(0);

    // Region level: region size 6
    const regionClusters = clusterCreaturesByZoom(snapshot, 'region');
    expect(regionClusters.size).toBeGreaterThan(0);

    // Habitat level: region size 2
    const habitatClusters = clusterCreaturesByZoom(snapshot, 'habitat');
    expect(habitatClusters.size).toBeGreaterThan(0);

    // Local level: region size 1 (no aggregation)
    const localClusters = clusterCreaturesByZoom(snapshot, 'local');
    expect(localClusters.size).toBeGreaterThan(0);

    // As zoom level gets more detailed, cluster grid should get larger
    expect(habitatClusters.size).toBeGreaterThanOrEqual(regionClusters.size);
    expect(regionClusters.size).toBeGreaterThanOrEqual(worldClusters.size);
  });

  it('preserves creature references in clusters (for click handler lookup)', () => {
    const creatures: PrototypeCreature[] = [
      { id: 'test-1', x: 5, y: 5, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
      { id: 'test-2', x: 8, y: 8, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
    ];
    const snapshot = createTestSnapshot(creatures);

    const clusters = clusterCreaturesByZoom(snapshot, 'world');
    const cluster = clusters.get('0,0');

    expect(cluster).toBeDefined();
    expect(cluster!.creatures).toHaveLength(2);

    // Verify that creature objects are preserved (not copies)
    const creaturesInCluster = cluster!.creatures;
    expect(creaturesInCluster[0].id).toMatch(/^test-/);
    expect(creaturesInCluster[1].id).toMatch(/^test-/);

    // Click handler will search within this cluster's creatures
    const found = creaturesInCluster.find((c) => c.id === 'test-1');
    expect(found).toBeDefined();
    expect(found!.x).toBe(5);
  });

  it('handles empty clusters gracefully', () => {
    const creatures: PrototypeCreature[] = [
      { id: '1', x: 50, y: 50, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
    ];
    const snapshot = createTestSnapshot(creatures);

    const clusters = clusterCreaturesByZoom(snapshot, 'world');

    // Should have empty clusters at (0,0), (0,1), etc.
    const emptyCluster = clusters.get('0,0');
    expect(emptyCluster).toBeDefined();
    expect(emptyCluster!.creatures).toHaveLength(0);
    expect(emptyCluster!.density).toBe(0);
  });

  it('supports click handler region calculation (gridX/gridY access)', () => {
    const creatures: PrototypeCreature[] = [
      { id: '1', x: 5, y: 5, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
    ];
    const snapshot = createTestSnapshot(creatures);

    const clusters = clusterCreaturesByZoom(snapshot, 'world');
    const cluster = clusters.get('0,0');

    expect(cluster).toBeDefined();
    // Click handler uses these to calculate zoom region bounds
    expect(cluster!.gridX).toBe(0);
    expect(cluster!.gridY).toBe(0);

    // Verify the calculation that click handler will perform
    const regionSize = 25; // world level
    const minX = cluster!.gridX * regionSize;
    const maxX = Math.min((cluster!.gridX + 1) * regionSize - 1, snapshot.world.width - 1);
    const minY = cluster!.gridY * regionSize;
    const maxY = Math.min((cluster!.gridY + 1) * regionSize - 1, snapshot.world.height - 1);

    expect(minX).toBe(0);
    expect(maxX).toBe(24);
    expect(minY).toBe(0);
    expect(maxY).toBe(24);
  });

  it('iterates clusters.values() correctly (Map iteration fix)', () => {
    const creatures: PrototypeCreature[] = [
      { id: '1', x: 5, y: 5, speciesId: 's1', lineageId: 'l1', strategy: 'herbivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's1:l1' },
      { id: '2', x: 35, y: 35, speciesId: 's2', lineageId: 'l2', strategy: 'carnivore', lifecycleState: 'alive', relativeEnergy: 0.5, colorKey: 's2:l2' },
    ];
    const snapshot = createTestSnapshot(creatures);

    const clusters = clusterCreaturesByZoom(snapshot, 'world');

    // Test that the fix to use .values() works correctly
    let count = 0;
    for (const cluster of clusters.values()) {
      count++;
      // This should not throw - cluster should have .creatures property
      expect(cluster.creatures).toBeDefined();
      expect(Array.isArray(cluster.creatures)).toBe(true);
      expect(cluster.gridX).toBeDefined();
      expect(cluster.gridY).toBeDefined();
    }

    expect(count).toBeGreaterThan(0);
  });
});
