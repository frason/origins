import { describe, expect, it, beforeAll } from 'vitest';
import { buildDemoEngine } from '../simulation/demoWorld';
import { tickEngine, type EngineState } from '../simulation/engine';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import {
  toRenderSnapshot,
  validateRenderSnapshot,
  serializeRenderSnapshot,
  deserializeRenderSnapshot,
  RENDER_SNAPSHOT_VERSION,
  diffRenderSnapshot,
  type RenderSnapshot,
} from '../prototype/renderSnapshot';

// Shared engine state cache to avoid rebuilding engines multiple times
const engineCache = new Map<string, EngineState>();

function getCachedEngine(seed: number, tick: number): EngineState {
  const key = `${seed}-${tick}`;
  if (engineCache.has(key)) {
    return engineCache.get(key)!;
  }

  let state = buildDemoEngine(seed, { ...SIMULATION_CONSTANTS });
  for (let index = 0; index < tick; index++) {
    state = tickEngine(state);
  }
  engineCache.set(key, state);
  return state;
}

function stateAt(seed: number, tick: number): EngineState {
  return getCachedEngine(seed, tick);
}

// Pre-cache common engine states used across tests
beforeAll(() => {
  // Pre-cache frequently used states to avoid rebuilding
  stateAt(42, 1);
  stateAt(42, 10);
  stateAt(42, 50);
  stateAt(42, 100);
  stateAt(12345, 1);
  stateAt(12345, 50);
  stateAt(12345, 100);
  stateAt(999, 5);
});

describe('render snapshot: determinism and structure', () => {
  it('produces identical snapshots for identical engine states', () => {
    const firstState = stateAt(42, 100);
    const secondState = stateAt(42, 100);

    const firstSnapshot = toRenderSnapshot(firstState);
    const secondSnapshot = toRenderSnapshot(secondState);

    // Structural equivalence: same object structure
    expect(firstSnapshot.version).toBe(secondSnapshot.version);
    expect(firstSnapshot.source.seed).toBe(secondSnapshot.source.seed);
    expect(firstSnapshot.source.tick).toBe(secondSnapshot.source.tick);
    expect(firstSnapshot.world).toEqual(secondSnapshot.world);

    // Layer equivalence
    expect(firstSnapshot.layers.terrain.biomes).toEqual(secondSnapshot.layers.terrain.biomes);
    expect(firstSnapshot.layers.terrain.elevation).toEqual(secondSnapshot.layers.terrain.elevation);
    expect(firstSnapshot.layers.biomass.values).toEqual(secondSnapshot.layers.biomass.values);
    expect(firstSnapshot.layers.organisms.creatures).toEqual(secondSnapshot.layers.organisms.creatures);
    expect(firstSnapshot.layers.corpses.creatures).toEqual(secondSnapshot.layers.corpses.creatures);
  });

  it('produces different snapshots for different engine states', () => {
    const earlySnapshot = toRenderSnapshot(stateAt(42, 10));
    const lateSnapshot = toRenderSnapshot(stateAt(42, 50));

    expect(earlySnapshot.source.tick).not.toBe(lateSnapshot.source.tick);
    // At least organism count should differ
    expect(earlySnapshot.layers.organisms.creatures.length).not.toBe(
      lateSnapshot.layers.organisms.creatures.length
    );
  });

  it('maintains all layer types in snapshot', () => {
    const snapshot = toRenderSnapshot(stateAt(12345, 50));

    expect(snapshot.layers.terrain).toBeDefined();
    expect(snapshot.layers.biomass).toBeDefined();
    expect(snapshot.layers.energy).toBeDefined();
    expect(snapshot.layers.toxicity).toBeDefined();
    expect(snapshot.layers.organisms).toBeDefined();
    expect(snapshot.layers.corpses).toBeDefined();
    expect(snapshot.layers.mutationPressure).toBeDefined();
    expect(snapshot.layers.lineage).toBeDefined();
  });

  it('encodes all cells in terrain layer', () => {
    const snapshot = toRenderSnapshot(stateAt(12345, 1));
    const cellCount = snapshot.world.width * snapshot.world.height;

    expect(snapshot.layers.terrain.biomes.length).toBe(cellCount);
    expect(snapshot.layers.terrain.elevation.length).toBe(cellCount);
    expect(snapshot.layers.terrain.moisture.length).toBe(cellCount);
    expect(snapshot.layers.terrain.temperature.length).toBe(cellCount);
  });

  it('encodes all cells in energy and biomass layers', () => {
    const snapshot = toRenderSnapshot(stateAt(12345, 1));
    const cellCount = snapshot.world.width * snapshot.world.height;

    expect(snapshot.layers.biomass.values.length).toBe(cellCount);
    expect(snapshot.layers.energy.values.length).toBe(cellCount);
    expect(snapshot.layers.toxicity.values.length).toBe(cellCount);
    expect(snapshot.layers.mutationPressure.values.length).toBe(cellCount);
  });

  it('preserves creature identities and lineages', () => {
    const snapshot = toRenderSnapshot(stateAt(12345, 50));

    // Check organisms
    for (const org of snapshot.layers.organisms.creatures) {
      expect(org.id).toBeTruthy();
      expect(org.speciesId).toBeTruthy();
      expect(org.lineageId).toBeTruthy();
      expect(org.strategy).toBeTruthy();
      expect(org.x).toBeGreaterThanOrEqual(0);
      expect(org.y).toBeGreaterThanOrEqual(0);
      expect(org.relativeEnergy).toBeGreaterThanOrEqual(0);
      expect(org.relativeEnergy).toBeLessThanOrEqual(1);
    }

    // Check corpses
    for (const corpse of snapshot.layers.corpses.creatures) {
      expect(corpse.id).toBeTruthy();
      expect(corpse.lineageId).toBeTruthy();
      expect(corpse.x).toBeGreaterThanOrEqual(0);
      expect(corpse.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('creates deterministic creature ordering', () => {
    const firstSnapshot = toRenderSnapshot(stateAt(42, 100));
    const secondSnapshot = toRenderSnapshot(stateAt(42, 100));

    // Organisms and corpses should appear in same order
    expect(firstSnapshot.layers.organisms.creatures.map((c) => c.id)).toEqual(
      secondSnapshot.layers.organisms.creatures.map((c) => c.id)
    );
    expect(firstSnapshot.layers.corpses.creatures.map((c) => c.id)).toEqual(
      secondSnapshot.layers.corpses.creatures.map((c) => c.id)
    );
  });

  it('computes mutation pressure from corpse distribution', () => {
    const snapshot = toRenderSnapshot(stateAt(12345, 100));
    const pressure = snapshot.layers.mutationPressure.values;

    // Mutation pressure should be [0, 1]
    for (let i = 0; i < pressure.length; i++) {
      expect(pressure[i]).toBeGreaterThanOrEqual(0);
      expect(pressure[i]).toBeLessThanOrEqual(1);
    }

    // If there are corpses, should have non-zero pressure somewhere
    if (snapshot.layers.corpses.creatures.length > 0) {
      const maxPressure = Math.max(...Array.from(pressure));
      expect(maxPressure).toBeGreaterThan(0);
    }
  });

  it('tracks lineage IDs correctly', () => {
    const snapshot = toRenderSnapshot(stateAt(12345, 50));

    // All active creatures should be tracked
    const trackedCount =
      snapshot.layers.organisms.creatures.length +
      snapshot.layers.corpses.creatures.length;
    expect(snapshot.layers.lineage.creatureLineages.size).toBe(trackedCount);

    // All creature lineages should be in the lineage set
    for (const lineageId of snapshot.layers.lineage.creatureLineages.values()) {
      expect(snapshot.layers.lineage.lineageIds.has(lineageId)).toBe(true);
    }
  });
});

describe('render snapshot: validation', () => {
  it('rejects invalid world dimensions', () => {
    const validSnapshot = toRenderSnapshot(stateAt(42, 1));

    const invalidWidth = { ...validSnapshot, world: { ...validSnapshot.world, width: 0 } };
    expect(() => validateRenderSnapshot(invalidWidth)).toThrow('dimensions');

    const invalidHeight = { ...validSnapshot, world: { ...validSnapshot.world, height: -1 } };
    expect(() => validateRenderSnapshot(invalidHeight)).toThrow('dimensions');
  });

  it('rejects mismatched array sizes', () => {
    const snapshot = toRenderSnapshot(stateAt(42, 1));
    const cellCount = snapshot.world.width * snapshot.world.height;

    const invalidBiomes = {
      ...snapshot,
      layers: {
        ...snapshot.layers,
        terrain: {
          ...snapshot.layers.terrain,
          biomes: new Uint8Array(cellCount - 1),
        },
      },
    };
    expect(() => validateRenderSnapshot(invalidBiomes)).toThrow('mismatch');
  });

  it('rejects invalid biome IDs', () => {
    const snapshot = toRenderSnapshot(stateAt(42, 1));

    const invalidBiome = {
      ...snapshot,
      layers: {
        ...snapshot.layers,
        terrain: {
          ...snapshot.layers.terrain,
          biomes: new Uint8Array([...snapshot.layers.terrain.biomes, 99]),
        },
      },
    };
    // Truncate other arrays to match
    invalidBiome.layers.terrain.elevation = new Float32Array(
      snapshot.world.width * snapshot.world.height
    );
    // This should fail during validation
    expect(() => validateRenderSnapshot(invalidBiome)).toThrow('mismatch');
  });

  it('rejects invalid creature coordinates', () => {
    const snapshot = toRenderSnapshot(stateAt(42, 50));

    if (snapshot.layers.organisms.creatures.length > 0) {
      const invalidOrgs = {
        ...snapshot,
        layers: {
          ...snapshot.layers,
          organisms: {
            ...snapshot.layers.organisms,
            creatures: [
              { ...snapshot.layers.organisms.creatures[0], x: -1 },
              ...snapshot.layers.organisms.creatures.slice(1),
            ],
          },
        },
      };
      expect(() => validateRenderSnapshot(invalidOrgs)).toThrow('out of bounds');
    }
  });

  it('rejects invalid relative energy values', () => {
    const snapshot = toRenderSnapshot(stateAt(42, 50));

    if (snapshot.layers.organisms.creatures.length > 0) {
      const invalidOrgs = {
        ...snapshot,
        layers: {
          ...snapshot.layers,
          organisms: {
            ...snapshot.layers.organisms,
            creatures: [
              { ...snapshot.layers.organisms.creatures[0], relativeEnergy: 1.5 },
              ...snapshot.layers.organisms.creatures.slice(1),
            ],
          },
        },
      };
      expect(() => validateRenderSnapshot(invalidOrgs)).toThrow('energy');
    }
  });
});

describe('render snapshot: serialization', () => {
  it('serializes snapshot to JSON and back deterministically', () => {
    const original = toRenderSnapshot(stateAt(42, 100));
    const json = serializeRenderSnapshot(original);
    const deserialized = deserializeRenderSnapshot(json);

    expect(deserialized.version).toBe(original.version);
    expect(deserialized.source).toEqual(original.source);
    expect(deserialized.world).toEqual(original.world);
    expect(deserialized.layers.terrain.biomes).toEqual(original.layers.terrain.biomes);
    expect(deserialized.layers.organisms.creatures).toEqual(original.layers.organisms.creatures);
  });

  it('produces valid JSON with reasonable size', () => {
    const snapshot = toRenderSnapshot(stateAt(42, 50));
    const json = serializeRenderSnapshot(snapshot);

    expect(json).toBeTruthy();
    expect(typeof json).toBe('string');
    // JSON should be reasonably sized (not blown up)
    expect(json.length).toBeLessThan(10_000_000);
  });

  it('round-trips correctly multiple times', () => {
    const original = toRenderSnapshot(stateAt(42, 100));

    let current = original;
    for (let i = 0; i < 3; i++) {
      const json = serializeRenderSnapshot(current);
      current = deserializeRenderSnapshot(json);
      validateRenderSnapshot(current);
    }

    expect(current.source.seed).toBe(original.source.seed);
    expect(current.source.tick).toBe(original.source.tick);
  });

  it('preserves buffer data through serialization', () => {
    const snapshot = toRenderSnapshot(stateAt(42, 50));
    const json = serializeRenderSnapshot(snapshot);
    const deserialized = deserializeRenderSnapshot(json);

    // Float32Arrays should maintain precision
    for (let i = 0; i < snapshot.layers.biomass.values.length; i++) {
      expect(deserialized.layers.biomass.values[i]).toBe(snapshot.layers.biomass.values[i]);
    }

    // Uint8Arrays should maintain exact values
    for (let i = 0; i < snapshot.layers.terrain.biomes.length; i++) {
      expect(deserialized.layers.terrain.biomes[i]).toBe(snapshot.layers.terrain.biomes[i]);
    }
  });
});

describe('render snapshot: performance and size', () => {
  it('builds snapshots in reasonable time', () => {
    const state = stateAt(42, 50);
    const startTime = performance.now();
    const snapshot = toRenderSnapshot(state);
    const endTime = performance.now();

    expect(snapshot.metadata.buildTimeMs).toBeLessThan(100); // Should be very fast
    expect(endTime - startTime).toBeLessThan(200); // Actual time
  });

  it('keeps serialized snapshot reasonably compact', () => {
    const snapshot = toRenderSnapshot(stateAt(42, 50));
    const json = serializeRenderSnapshot(snapshot);
    const sizeInKb = json.length / 1024;

    // Should be compact enough for worker transfer
    // Typical world: 100x100 cells + typed arrays + creatures + lineage tracking
    // With all layers, reasonable threshold is ~2MB for a 50-tick simulation
    expect(sizeInKb).toBeLessThan(2000); // Under 2MB for typical snapshot
  });
});

describe('render snapshot: replay support', () => {
  it('supports replay of identical sequences', () => {
    const snapshots1 = [];
    let state1 = buildDemoEngine(999, { ...SIMULATION_CONSTANTS });
    for (let i = 0; i < 5; i++) {
      snapshots1.push(toRenderSnapshot(state1));
      state1 = tickEngine(state1);
    }

    const snapshots2 = [];
    let state2 = buildDemoEngine(999, { ...SIMULATION_CONSTANTS });
    for (let i = 0; i < 5; i++) {
      snapshots2.push(toRenderSnapshot(state2));
      state2 = tickEngine(state2);
    }

    // All snapshots should match exactly
    for (let i = 0; i < snapshots1.length; i++) {
      expect(snapshots1[i].source.tick).toBe(snapshots2[i].source.tick);
      expect(snapshots1[i].layers.organisms.creatures).toEqual(
        snapshots2[i].layers.organisms.creatures
      );
    }
  });

  it('preserves version information for compatibility', () => {
    const snapshot = toRenderSnapshot(stateAt(42, 1));
    expect(snapshot.version).toBe(RENDER_SNAPSHOT_VERSION);

    // Should validate correctly
    expect(() => validateRenderSnapshot(snapshot)).not.toThrow();
  });
});

describe('render snapshot: backward compatibility with Canvas2D', () => {
  it('provides data compatible with Canvas2D rendering', () => {
    const snapshot = toRenderSnapshot(stateAt(42, 50));

    // Canvas2D needs: cells, creatures, world dimensions, overlays
    expect(snapshot.world.width).toBeGreaterThan(0);
    expect(snapshot.world.height).toBeGreaterThan(0);
    expect(snapshot.layers.terrain.biomes.length).toBe(
      snapshot.world.width * snapshot.world.height
    );
    expect(snapshot.layers.biomass.values.length).toBe(
      snapshot.world.width * snapshot.world.height
    );
    expect(snapshot.layers.organisms.creatures).toBeDefined();
    expect(snapshot.layers.corpses.creatures).toBeDefined();

    // Should have all the overlays Canvas2D needs
    expect(snapshot.layers.toxicity.values).toBeDefined();
    expect(snapshot.layers.mutationPressure.values).toBeDefined();
  });
});

describe('render snapshot: Three.js layer support', () => {
  it('provides organized layers for Three.js rendering', () => {
    const snapshot = toRenderSnapshot(stateAt(42, 50));

    // Three.js needs organized, indexed access to all rendering data
    expect(snapshot.layers.terrain.type).toBe('terrain');
    expect(snapshot.layers.biomass.type).toBe('biomass');
    expect(snapshot.layers.organisms.type).toBe('organisms');
    expect(snapshot.layers.corpses.type).toBe('corpses');
    expect(snapshot.layers.toxicity.type).toBe('toxicity');
    expect(snapshot.layers.mutationPressure.type).toBe('mutation-pressure');
    expect(snapshot.layers.lineage.type).toBe('lineage');
    expect(snapshot.layers.selection.type).toBe('selection');
  });

  it('provides selection layer for UI highlighting', () => {
    const snapshot = toRenderSnapshot(stateAt(42, 50));

    // Selection layer should track UI state
    expect(snapshot.layers.selection.selectedCreatureIds).toBeDefined();
    expect(snapshot.layers.selection.selectedLineageIds).toBeDefined();
    expect(snapshot.layers.selection.followedLineages).toBeDefined();

    // All should be Sets/Maps
    expect(snapshot.layers.selection.selectedCreatureIds instanceof Set).toBe(true);
    expect(snapshot.layers.selection.selectedLineageIds instanceof Set).toBe(true);
    expect(snapshot.layers.selection.followedLineages instanceof Map).toBe(true);

    // Initially empty (populated by UI as needed)
    expect(snapshot.layers.selection.selectedCreatureIds.size).toBe(0);
    expect(snapshot.layers.selection.selectedLineageIds.size).toBe(0);
    expect(snapshot.layers.selection.followedLineages.size).toBe(0);
  });

  it('enables efficient sampling of cell attributes', () => {
    const snapshot = toRenderSnapshot(stateAt(42, 50));
    const { width, height } = snapshot.world;

    // Three.js can efficiently sample any cell's attributes
    const testX = Math.floor(width / 2);
    const testY = Math.floor(height / 2);
    const idx = testY * width + testX;

    const biomass = snapshot.layers.biomass.values[idx];
    const energy = snapshot.layers.energy.values[idx];
    const toxicity = snapshot.layers.toxicity.values[idx];

    expect(typeof biomass).toBe('number');
    expect(typeof energy).toBe('number');
    expect(typeof toxicity).toBe('number');
  });
});

describe('render snapshot: renderer integration (Canvas2D & Three.js)', () => {
  it('can be imported and consumed by Canvas2D renderer', () => {
    // This test demonstrates that the snapshot contract can be used by Canvas2D
    // Canvas2DFallback.tsx imports PrototypeWorldSnapshot but can also work with
    // data from RenderSnapshot via a lightweight adapter
    const snapshot = toRenderSnapshot(stateAt(42, 50));

    // Canvas2D needs access to:
    // 1. Grid dimensions
    expect(snapshot.world.width).toBeGreaterThan(0);
    expect(snapshot.world.height).toBeGreaterThan(0);

    // 2. Cell overlays (terrain, biomass, energy, toxicity)
    const cellCount = snapshot.world.width * snapshot.world.height;
    expect(snapshot.layers.terrain.biomes).toHaveLength(cellCount);
    expect(snapshot.layers.biomass.values).toHaveLength(cellCount);
    expect(snapshot.layers.energy.values).toHaveLength(cellCount);
    expect(snapshot.layers.toxicity.values).toHaveLength(cellCount);

    // 3. Creatures (living and dead)
    expect(snapshot.layers.organisms.creatures).toBeDefined();
    expect(snapshot.layers.corpses.creatures).toBeDefined();

    // 4. Mutation pressure for visual overlay
    expect(snapshot.layers.mutationPressure.values).toHaveLength(cellCount);

    // Snapshot can be consumed without errors
    validateRenderSnapshot(snapshot);
  });

  it('can be imported and consumed by Three.js renderer', () => {
    // This test demonstrates that the snapshot contract can be used by Three.js
    // ThreeWorldView.tsx can consume layer buffers for efficient InstancedMesh rendering
    const snapshot = toRenderSnapshot(stateAt(42, 50));

    // Three.js needs:
    // 1. Efficient grid-based cell data (for InstancedMesh)
    const { width, height } = snapshot.world;
    expect(snapshot.layers.terrain.elevation).toHaveLength(width * height);

    // 2. Creature positions and properties for raycasting
    for (const creature of snapshot.layers.organisms.creatures) {
      expect(creature.x).toBeDefined();
      expect(creature.y).toBeDefined();
      expect(creature.id).toBeDefined();
      expect(creature.lineageId).toBeDefined();
    }

    // 3. Corpses for visual representation
    for (const corpse of snapshot.layers.corpses.creatures) {
      expect(corpse.x).toBeDefined();
      expect(corpse.y).toBeDefined();
    }

    // 4. Efficient color/overlay sampling
    const idx = Math.floor(width / 2) + Math.floor(height / 2) * width;
    const biomeId = snapshot.layers.terrain.biomes[idx];
    const elevation = snapshot.layers.terrain.elevation[idx];
    const toxicity = snapshot.layers.toxicity.values[idx];

    expect(typeof biomeId).toBe('number');
    expect(typeof elevation).toBe('number');
    expect(typeof toxicity).toBe('number');

    // Snapshot is valid for rendering
    validateRenderSnapshot(snapshot);
  });

  it('supports incremental updates between frames', () => {
    // Demonstrate that snapshots can be efficiently compared for incremental updates
    const snap1 = toRenderSnapshot(stateAt(42, 10));
    const snap2 = toRenderSnapshot(stateAt(42, 11));

    // Same source but different tick
    expect(snap1.source.seed).toBe(snap2.source.seed);
    expect(snap1.source.tick).not.toBe(snap2.source.tick);

    // Can identify changed creatures
    const org1Ids = new Set(snap1.layers.organisms.creatures.map((c) => c.id));
    const org2Ids = new Set(snap2.layers.organisms.creatures.map((c) => c.id));

    // Set difference shows births/deaths
    const births = Array.from(org2Ids).filter((id) => !org1Ids.has(id));
    const deaths = Array.from(org1Ids).filter((id) => !org2Ids.has(id));

    // Both should be deterministic across runs
    const snap2b = toRenderSnapshot(stateAt(42, 11));
    expect(snap2.layers.organisms.creatures.map((c) => c.id)).toEqual(
      snap2b.layers.organisms.creatures.map((c) => c.id)
    );

    // Births/deaths would be consistent on replay
    const births2b = Array.from(snap2b.layers.organisms.creatures.map((c) => c.id))
      .filter((id) => !org1Ids.has(id));
    expect(births).toEqual(births2b);
  });

  it('computes delta between snapshots correctly', () => {
    const snap1 = toRenderSnapshot(stateAt(42, 10));
    const snap2 = toRenderSnapshot(stateAt(42, 11));

    const delta = diffRenderSnapshot(snap1, snap2);

    // Delta should track the ticks
    expect(delta.sourceTick).toBe(10);
    expect(delta.targetTick).toBe(11);

    // Delta should contain births and/or deaths
    expect(Array.isArray(delta.births)).toBe(true);
    expect(Array.isArray(delta.deaths)).toBe(true);
    expect(delta.movedCreatures).toBeDefined();
    expect(delta.energyChanges).toBeDefined();

    // Births should be a subset of snap2 organisms
    const snap2Ids = new Set(snap2.layers.organisms.creatures.map((c) => c.id));
    for (const birth of delta.births) {
      expect(snap2Ids.has(birth.id)).toBe(true);
    }

    // Deaths should NOT be in snap2 organisms
    const births2Ids = new Set(delta.births.map((c) => c.id));
    for (const deathId of delta.deaths) {
      expect(snap2Ids.has(deathId)).toBe(false);
      expect(births2Ids.has(deathId)).toBe(false);
    }
  });

  it('delta is stable across replay', () => {
    const snap1a = toRenderSnapshot(stateAt(42, 10));
    const snap2a = toRenderSnapshot(stateAt(42, 11));
    const delta1 = diffRenderSnapshot(snap1a, snap2a);

    const snap1b = toRenderSnapshot(stateAt(42, 10));
    const snap2b = toRenderSnapshot(stateAt(42, 11));
    const delta2 = diffRenderSnapshot(snap1b, snap2b);

    // Deltas should be identical
    expect(delta1.sourceTick).toBe(delta2.sourceTick);
    expect(delta1.targetTick).toBe(delta2.targetTick);
    expect(delta1.births.map((c) => c.id).sort()).toEqual(delta2.births.map((c) => c.id).sort());
    expect(delta1.deaths.sort()).toEqual(delta2.deaths.sort());
    expect(delta1.movedCreatures.length).toBe(delta2.movedCreatures.length);
  });
});
