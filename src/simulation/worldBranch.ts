/**
 * World Branching: Support for counterfactual analysis and ecosystem divergence tracking
 *
 * Enables players to:
 * - Rewind to a checkpoint and change one intervention
 * - Compare how the ecosystem diverges between branches
 * - Understand causality through synchronized comparison
 */

import type { WorldSnapshot } from '../state/store';
import type { SimEvent } from './events';

/**
 * Represents an intervention (action) that was changed on a branch
 */
export interface ChangedIntervention {
  /** Tick at which the intervention occurred */
  tick: number;
  /** Type of intervention that was changed */
  kind: 'settings-change' | 'species-introduction' | 'removed';
  /** Description of what changed (e.g., "baseMetabolism: 2.0 → 1.5") */
  label: string;
  /** The original intervention event (if applicable) */
  originalEvent?: SimEvent;
  /** The modified intervention event (if applicable) */
  modifiedEvent?: SimEvent;
}

/**
 * Summary of metrics for ecosystem comparison
 */
export interface EcosystemMetrics {
  tick: number;
  population: number;
  speciesCount: number;
  livingEnergy: number;
  producerBiomass: number;
  extinctionCount: number;
  // Trait frequency samples (most common trait values for each major trait)
  traitFrequencies?: Record<string, number[]>;
}

/**
 * Divergence analysis between two branches
 */
export interface BranchDivergence {
  /** The tick where they first differ significantly */
  divergenceTick?: number;
  /** Major events that differ between branches */
  differedMajorEvents: Array<{
    eventType: string;
    tick: number;
    onlyIn: 'branch_a' | 'branch_b' | 'both_but_different';
    detail: string;
  }>;
  /** Extinct species that diverged between branches */
  extinctionDifferences: Array<{
    speciesId: string;
    tick: number;
    extinctIn: 'branch_a' | 'branch_b';
  }>;
  /** Metrics at matching ticks */
  metricsSamples: Array<{
    tick: number;
    metrics_a?: EcosystemMetrics;
    metrics_b?: EcosystemMetrics;
  }>;
}

/**
 * World Branch: tracks a divergent simulation from a checkpoint
 */
export interface WorldBranch {
  /** Unique identifier for this branch */
  id: string;
  /** Human-readable name */
  name: string;
  /** Tick from which this branch was created (the fork point) */
  branchFromTick: number;
  /** The intervention that was changed to create this branch */
  changedIntervention: ChangedIntervention;
  /** Most recent tick simulated on this branch */
  tick: number;
  /** Most recent world state */
  worldState: WorldSnapshot | null;
  /** Checkpoints stored for this branch (independent from parent) */
  checkpoints: Array<{ tick: number; creatureIdCounter?: number }>;
  /** The seed used for the parent timeline */
  seed: number;
  /** Timestamp when branch was created */
  createdAt: number;
  /** Whether this branch is currently being viewed/edited */
  active: boolean;
}

/**
 * Multi-branch world: tracks multiple divergent scenarios
 */
export interface BranchCollection {
  /** The primary/original branch */
  main: WorldBranch;
  /** Alternative branches created through counterfactual changes */
  alternatives: WorldBranch[];
}

/**
 * Create a new branch from a checkpoint
 * @param parentWorldState - The world state at the fork point
 * @param branchFromTick - The tick from which to branch
 * @param changedIntervention - Description of what was changed
 * @param name - Display name for the branch
 * @returns A new WorldBranch
 */
export function createBranch(
  parentWorldState: WorldSnapshot,
  branchFromTick: number,
  changedIntervention: ChangedIntervention,
  name: string
): WorldBranch {
  return {
    id: `branch_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name,
    branchFromTick,
    changedIntervention,
    tick: branchFromTick,
    worldState: {
      ...parentWorldState,
      tick: branchFromTick,
      // Keep events up to the fork point; divergence happens after
      events: parentWorldState.events.filter((e) => e.tick <= branchFromTick),
    },
    checkpoints: [],
    seed: parentWorldState.seed || 0,
    createdAt: Date.now(),
    active: false,
  };
}

/**
 * Record a checkpoint on a branch
 */
export function captureCheckpointOnBranch(
  branch: WorldBranch,
  worldState: WorldSnapshot,
  interval: number = 10,
  limit: number = 30
): WorldBranch {
  if (worldState.tick! % interval !== 0) return branch;

  const newCheckpoint = {
    tick: worldState.tick!,
    creatureIdCounter: undefined, // Can be populated if needed
  };

  // Replace any existing checkpoint at the same tick
  const updated = [
    ...branch.checkpoints.filter((cp) => cp.tick !== worldState.tick!),
    newCheckpoint,
  ].sort((a, b) => a.tick - b.tick);

  return {
    ...branch,
    tick: worldState.tick!,
    worldState: { ...worldState },
    checkpoints: updated.slice(-Math.max(1, limit)),
  };
}

/**
 * Sample ecosystem metrics from a world state
 */
export function sampleMetrics(world: WorldSnapshot): EcosystemMetrics {
  const population = world.creatures?.length ?? 0;

  // Count unique species
  const speciesIds = new Set(world.creatures?.map((c) => c.speciesId) ?? []);
  const speciesCount = speciesIds.size;

  // Sum living energy
  const livingEnergy = (world.creatures ?? []).reduce(
    (sum, c) => sum + (c.lifecycleState === 'alive' ? c.energy : 0),
    0
  );

  // Sum producer biomass
  const producerBiomass = (world.cells ?? []).reduce((sum, cell) => sum + cell.producerBiomass, 0);

  // Count extinctions (species that existed before but don't now)
  const extinctionCount = (world.events ?? []).filter((e) => e.type === 'extinction').length;

  return {
    tick: world.tick ?? 0,
    population,
    speciesCount,
    livingEnergy,
    producerBiomass,
    extinctionCount,
  };
}

/**
 * Compare two branches to identify where and why they diverge
 */
export function compareBranches(
  branchA: WorldBranch,
  branchB: WorldBranch,
  commonTick: number
): BranchDivergence {
  const divergence: BranchDivergence = {
    differedMajorEvents: [],
    extinctionDifferences: [],
    metricsSamples: [],
  };

  const eventsA = branchA.worldState?.events ?? [];
  const eventsB = branchB.worldState?.events ?? [];

  // Find first significant difference after common history
  let divergenceTick: number | undefined;

  const majorEventTypes = new Set(['speciation', 'extinction', 'intervention']);

  // Extract major events after the common tick
  const majorA = eventsA
    .filter((e) => e.tick > commonTick && majorEventTypes.has(e.type))
    .slice(0, 10);
  const majorB = eventsB
    .filter((e) => e.tick > commonTick && majorEventTypes.has(e.type))
    .slice(0, 10);

  // Find extinctions that differ
  const extinctionsA = new Map(
    eventsA
      .filter((e) => e.type === 'extinction' && e.tick > commonTick)
      .map((e) => [e.speciesId, e.tick])
  );
  const extinctionsB = new Map(
    eventsB
      .filter((e) => e.type === 'extinction' && e.tick > commonTick)
      .map((e) => [e.speciesId, e.tick])
  );

  // Track extinctions that differ
  const allSpeciesIds = new Set([...extinctionsA.keys(), ...extinctionsB.keys()]);
  for (const speciesId of allSpeciesIds) {
    const tickA = extinctionsA.get(speciesId);
    const tickB = extinctionsB.get(speciesId);
    if (tickA !== undefined && tickB === undefined) {
      divergence.extinctionDifferences.push({
        speciesId: speciesId as string,
        tick: tickA,
        extinctIn: 'branch_a',
      });
    } else if (tickB !== undefined && tickA === undefined) {
      divergence.extinctionDifferences.push({
        speciesId: speciesId as string,
        tick: tickB,
        extinctIn: 'branch_b',
      });
    }
  }

  // Find first major event difference
  const minEvents = Math.min(majorA.length, majorB.length);
  for (let i = 0; i < minEvents; i++) {
    if (majorA[i].tick !== majorB[i].tick || majorA[i].type !== majorB[i].type) {
      divergenceTick = Math.min(majorA[i].tick, majorB[i].tick);
      break;
    }
  }
  if (majorA.length !== majorB.length) {
    divergenceTick = Math.min(
      majorA[minEvents]?.tick ?? Infinity,
      majorB[minEvents]?.tick ?? Infinity
    );
  }

  divergence.divergenceTick = divergenceTick;

  // Sample metrics at key checkpoints
  const checkpointsA = new Set(branchA.checkpoints.map((cp) => cp.tick));
  const checkpointsB = new Set(branchB.checkpoints.map((cp) => cp.tick));
  const allCheckpoints = Array.from(new Set([...checkpointsA, ...checkpointsB])).sort((a, b) => a - b);

  for (const tick of allCheckpoints) {
    if (tick > commonTick) {
      // Only include divergent checkpoints
      const sample: (typeof divergence.metricsSamples)[number] = { tick };
      if (checkpointsA.has(tick) && branchA.worldState?.tick === tick) {
        sample.metrics_a = sampleMetrics(branchA.worldState);
      }
      if (checkpointsB.has(tick) && branchB.worldState?.tick === tick) {
        sample.metrics_b = sampleMetrics(branchB.worldState);
      }
      if (sample.metrics_a || sample.metrics_b) {
        divergence.metricsSamples.push(sample);
      }
    }
  }

  return divergence;
}

/**
 * Find the common historical tick between two branches
 * (both branches came from the same source at this tick)
 */
export function findCommonHistoryTick(branchA: WorldBranch, branchB: WorldBranch): number {
  // The common history is up to the earlier branch point
  return Math.min(branchA.branchFromTick, branchB.branchFromTick);
}

/**
 * Estimate storage size of a branch (in bytes, approximate)
 */
export function estimateBranchSize(branch: WorldBranch): number {
  let size = 0;

  // Rough estimation
  if (branch.worldState) {
    size += JSON.stringify(branch.worldState).length;
  }

  // Checkpoints
  size += branch.checkpoints.length * 200; // Rough per-checkpoint overhead

  // Metadata
  size += JSON.stringify({
    id: branch.id,
    name: branch.name,
    changedIntervention: branch.changedIntervention,
  }).length;

  return size;
}

/**
 * Bound storage by removing oldest alternative branches if needed
 * @param collection - The branch collection
 * @param maxBytes - Maximum total storage in bytes
 * @returns Updated collection with oldest branches potentially removed
 */
export function boundBranchStorage(
  collection: BranchCollection,
  maxBytes: number = 10 * 1024 * 1024 // 10 MB default
): BranchCollection {
  let totalSize = estimateBranchSize(collection.main);

  const kept: WorldBranch[] = [];
  // Sort by creation time, newest first
  const sorted = [...collection.alternatives].sort((a, b) => b.createdAt - a.createdAt);

  for (const branch of sorted) {
    const branchSize = estimateBranchSize(branch);
    if (totalSize + branchSize <= maxBytes) {
      kept.push(branch);
      totalSize += branchSize;
    }
    // else: branch is too large, skip it (remove from storage)
  }

  return {
    main: collection.main,
    alternatives: kept,
  };
}

/**
 * Validate version compatibility when loading old branches
 */
export function validateBranchCompatibility(branch: WorldBranch): boolean {
  // Check that branch has required fields
  if (!branch.id || !branch.name || typeof branch.branchFromTick !== 'number') {
    return false;
  }
  if (!branch.changedIntervention || !branch.changedIntervention.tick) {
    return false;
  }
  return true;
}
