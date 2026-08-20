/**
 * Checkpoint Payload Size Measurement Script
 *
 * Simulates a realistic mid-game world (100×100 grid) with:
 * - 200-300 creatures across multiple species
 * - Phase 0 state (economy, scout, buildings, crises)
 * - Captures a checkpoint and measures serialized JSON size
 *
 * Run with: vite-node scripts/measure-checkpoint-size.ts
 */

import { World } from '../src/simulation/world';
import { Creature } from '../src/simulation/creature';
import { createRng } from '../src/simulation/rng';
import { SIMULATION_CONSTANTS } from '../src/utils/constants';
import { buildFounderTraits } from '../src/simulation/founderTraits';
import {
  captureCheckpoint,
  type SimulationCheckpoint,
  type Phase0State,
} from '../src/simulation/checkpointTimeline';
import { ResourceLedger } from '../src/simulation/pivot/economy';
import type { Scout } from '../src/simulation/pivot/scout';
import type { Building } from '../src/simulation/pivot/building';
import type { Crisis } from '../src/simulation/pivot/crisis';

// Mock EngineState interface for checkpoint purposes
interface MockEngineState {
  tick: number;
  world: World;
  creatures: Creature[];
  creatureIdCounter: number;
  seed: number;
}

/**
 * Create a realistic mid-game world with populated creatures
 */
function createRealisticWorld(): {
  world: World;
  creatures: Creature[];
  phase0State: Phase0State;
} {
  const seed = 42; // Deterministic
  const rng = createRng(seed);

  // Create 100×100 world
  const world = new World(100, 100, SIMULATION_CONSTANTS, seed);

  // Create creatures across multiple species (mid-game scenario)
  const creatures: Creature[] = [];
  const speciesCount = 5;
  const creaturesPerSpecies = 50;

  for (let s = 0; s < speciesCount; s++) {
    const speciesId = `species_${s}`;
    const lineageId = `lineage_${s}`;
    const strategy = ['herbivore', 'carnivore', 'omnivore'][s % 3] as any;
    const traits = buildFounderTraits(strategy);

    for (let i = 0; i < creaturesPerSpecies; i++) {
      const x = rng() * 100 | 0;
      const y = rng() * 100 | 0;
      const energy = 50 + rng() * 100;
      const age = rng() * 500 | 0;

      const creature = new Creature({
        speciesId,
        lineageId,
        parentId: i === 0 ? null : `creature_${s}_${i - 1}`,
        traits,
        x,
        y,
        energy,
        age,
        generation: Math.floor(age / 50),
        offspringCount: Math.floor(rng() * 3),
      });
      creatures.push(creature);
    }
  }

  // Create Phase 0 state
  const ledger = new ResourceLedger(450, 150); // Mid-game resources

  const scout: Scout = {
    id: 'scout_0',
    x: 50,
    y: 50,
    waypoint: { x: 70, y: 30 },
    battery: 75,
    inBubble: true,
    status: 'active',
    onboardDiscoveries: [],
  };

  const buildings: Building[] = [
    {
      id: 'building_0',
      x: 50,
      y: 50,
      state: 'operational',
      decayTicks: 0,
      builtAtTick: 100,
    },
    {
      id: 'building_1',
      x: 60,
      y: 40,
      state: 'dormant',
      decayTicks: 25,
      builtAtTick: 200,
    },
  ];

  const crises: Crisis[] = [
    {
      id: 'crisis_1000_45_55',
      type: 'toxicity_spike',
      x: 45,
      y: 55,
      tick: 1000,
      status: 'active',
    },
  ];

  const phase0State: Phase0State = {
    ledger: ledger.getBalances(),
    scout,
    buildings,
    crises,
    worldGrid: world.toJSON(),
    equilibrium: {
      streakLength: 5,
      replacementWindow: [950, 1000],
      lastConditionsState: true,
    },
  };

  return { world, creatures, phase0State };
}

/**
 * Measure checkpoint serialization size
 */
function measureCheckpoint() {
  const { world, creatures, phase0State } = createRealisticWorld();

  // Reset creature counter for consistent IDs
  Creature.setIdCounter(creatures.length);

  // Create mock engine state
  const engineState: MockEngineState = {
    tick: 1000,
    world,
    creatures,
    creatureIdCounter: creatures.length,
    seed: 42,
  };

  // Capture checkpoint
  const checkpoints: SimulationCheckpoint<MockEngineState>[] = [];
  const nextCheckpoints = captureCheckpoint(
    checkpoints,
    engineState,
    10, // interval
    30, // limit
    phase0State
  );

  if (nextCheckpoints.length === 0) {
    throw new Error('Failed to capture checkpoint');
  }

  const checkpoint = nextCheckpoints[0];

  // Serialize to JSON string
  const jsonString = JSON.stringify(checkpoint);
  const jsonBytes = new TextEncoder().encode(jsonString).length;

  // Also measure just the Phase0State portion
  const phase0JsonString = JSON.stringify(phase0State);
  const phase0JsonBytes = new TextEncoder().encode(phase0JsonString).length;

  // Measure world grid only
  const worldJsonString = JSON.stringify(world.toJSON());
  const worldJsonBytes = new TextEncoder().encode(worldJsonString).length;

  // Estimate compression benefit (simple LZ4-like estimation)
  // In practice, JSON strings compress to ~30-40% with gzip
  const gzipEstimate = jsonBytes * 0.35;

  // Browser storage quota information
  const localStorageLimit = 5 * 1024 * 1024; // 5 MB typical
  const indexedDBLimit = 50 * 1024 * 1024; // 50 MB typical (can exceed with permission)

  return {
    // Measurements
    checkpointSizeBytes: jsonBytes,
    checkpointSizeKB: (jsonBytes / 1024).toFixed(2),
    checkpointSizeMB: (jsonBytes / 1024 / 1024).toFixed(3),

    // Breakdown
    creatureCount: creatures.length,
    worldGridSizeBytes: worldJsonBytes,
    worldGridSizeKB: (worldJsonBytes / 1024).toFixed(2),
    phase0StateSizeBytes: phase0JsonBytes,
    phase0StateSizeKB: (phase0JsonBytes / 1024).toFixed(2),

    // Compression estimate
    gzipEstimateMB: (gzipEstimate / 1024 / 1024).toFixed(3),
    gzipEstimateKB: (gzipEstimate / 1024).toFixed(2),

    // Quotas
    localStorageQuotaMB: localStorageLimit / 1024 / 1024,
    indexedDBQuotaMB: indexedDBLimit / 1024 / 1024,

    // Capacity analysis
    localStorageSlotsAvailable: Math.floor(localStorageLimit / jsonBytes),
    indexedDBSlotsAvailable: Math.floor(indexedDBLimit / jsonBytes),
    indexedDBSlotsAvailableCompressed: Math.floor(indexedDBLimit / gzipEstimate),
  };
}

// Run measurement
console.log('\n========== CHECKPOINT PAYLOAD SIZE MEASUREMENT ==========\n');

const results = measureCheckpoint();

console.log('📊 Checkpoint Serialization Size:');
console.log(`   Raw JSON: ${results.checkpointSizeKB} KB (${results.checkpointSizeBytes} bytes)`);
console.log(`   Raw JSON: ${results.checkpointSizeMB} MB`);
console.log(`   Estimated gzip: ${results.gzipEstimateKB} KB`);

console.log('\n📦 Payload Breakdown:');
console.log(`   World grid: ${results.worldGridSizeKB} KB (${results.worldGridSizeBytes} bytes)`);
console.log(`   Phase 0 state: ${results.phase0StateSizeKB} KB (${results.phase0StateSizeBytes} bytes)`);
console.log(`   Creatures: ${results.creatureCount} creatures`);

console.log('\n💾 Storage Backend Comparison:');
console.log(`   localStorage limit: ${results.localStorageQuotaMB} MB`);
console.log(`   localStorage slots available (no compression): ${results.localStorageSlotsAvailable}`);
console.log(`   IndexedDB limit: ${results.indexedDBQuotaMB} MB`);
console.log(`   IndexedDB slots available (no compression): ${results.indexedDBSlotsAvailable}`);
console.log(`   IndexedDB slots available (gzip): ${results.indexedDBSlotsAvailableCompressed}`);

console.log('\n========== END MEASUREMENT ==========\n');

export { measureCheckpoint };
