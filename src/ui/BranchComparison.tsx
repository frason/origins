/**
 * Branch Comparison UI
 *
 * Allows players to:
 * - Create branches from checkpoints
 * - Compare two branches side-by-side
 * - See where and why ecosystems diverge
 * - Synchronize timeline view across branches
 */

import React, { useMemo, useState } from 'react';
import {
  compareBranches,
  findCommonHistoryTick,
  sampleMetrics,
  getWorldStateAtTick,
  type WorldBranch,
  type BranchDivergence,
} from '../simulation/worldBranch';
import { useStore } from '../state/store';
import type { EcosystemMetrics } from '../simulation/worldBranch';
import styles from './BranchComparison.module.css';

// Key trait names for display
const TRAIT_NAMES = [
  'size',
  'speed',
  'visionRange',
  'hearingRange',
  'camouflage',
  'metabolism',
  'brainSize',
];

const TRAIT_DISPLAY_NAMES: Record<string, string> = {
  size: 'Size',
  speed: 'Speed',
  visionRange: 'Vision Range',
  hearingRange: 'Hearing Range',
  camouflage: 'Camouflage',
  metabolism: 'Metabolism',
  brainSize: 'Brain Size',
};

export interface BranchComparisonProps {
  branchA?: WorldBranch;
  branchB?: WorldBranch;
  onSelectBranch?: (branchId: string) => void;
}

/**
 * Display trait frequency comparison between species in two branches
 */
function TraitFrequencyComparison({
  metricsA,
  metricsB,
}: {
  metricsA: EcosystemMetrics | undefined;
  metricsB: EcosystemMetrics | undefined;
}): React.ReactElement | null {
  if (!metricsA?.traitFrequencies && !metricsB?.traitFrequencies) {
    return null;
  }

  const speciesA = Object.keys(metricsA?.traitFrequencies ?? {});
  const speciesB = Object.keys(metricsB?.traitFrequencies ?? {});

  if (speciesA.length === 0 && speciesB.length === 0) {
    return null;
  }

  return (
    <div className={styles.traitFrequencySection}>
      <h4>Trait Frequencies by Species</h4>
      <div className={styles.traitFrequencyGrid}>
        {/* Branch A traits */}
        <div className={styles.speciesTraits}>
          <h5>Branch A Species Traits</h5>
          {speciesA.length > 0 ? (
            speciesA.slice(0, 3).map((speciesId) => (
              <div key={speciesId} className={styles.speciesTraitBlock}>
                <div className={styles.speciesId}>{speciesId.slice(0, 8)}...</div>
                <dl className={styles.traitList}>
                  {metricsA?.traitFrequencies?.[speciesId]?.map((value, idx) => (
                    <div key={idx} className={styles.traitRow}>
                      <dt>{TRAIT_DISPLAY_NAMES[TRAIT_NAMES[idx]] || TRAIT_NAMES[idx]}</dt>
                      <dd>{typeof value === 'number' ? value.toFixed(2) : 'N/A'}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))
          ) : (
            <p>No species data available</p>
          )}
          {speciesA.length > 3 && <p className={styles.moreItems}>+{speciesA.length - 3} more species</p>}
        </div>

        {/* Branch B traits */}
        {metricsB && (
          <div className={styles.speciesTraits}>
            <h5>Branch B Species Traits</h5>
            {speciesB.length > 0 ? (
              speciesB.slice(0, 3).map((speciesId) => (
                <div key={speciesId} className={styles.speciesTraitBlock}>
                  <div className={styles.speciesId}>{speciesId.slice(0, 8)}...</div>
                  <dl className={styles.traitList}>
                    {metricsB?.traitFrequencies?.[speciesId]?.map((value, idx) => (
                      <div key={idx} className={styles.traitRow}>
                        <dt>{TRAIT_DISPLAY_NAMES[TRAIT_NAMES[idx]] || TRAIT_NAMES[idx]}</dt>
                        <dd>{typeof value === 'number' ? value.toFixed(2) : 'N/A'}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))
            ) : (
              <p>No species data available</p>
            )}
            {speciesB.length > 3 && <p className={styles.moreItems}>+{speciesB.length - 3} more species</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Display a metrics card for a branch state
 */
function MetricsCard({
  label,
  metrics,
}: {
  label: string;
  metrics: EcosystemMetrics | undefined;
}): React.ReactElement {
  if (!metrics) {
    return (
      <div className={`${styles.branchMetricsCard} ${styles.empty}`}>
        <h4>{label}</h4>
        <p>No data available</p>
      </div>
    );
  }

  return (
    <div className={styles.branchMetricsCard}>
      <h4>{label}</h4>
      <dl>
        <dt>Tick:</dt>
        <dd>{metrics.tick}</dd>

        <dt>Population:</dt>
        <dd>{metrics.population}</dd>

        <dt>Species:</dt>
        <dd>{metrics.speciesCount}</dd>

        <dt>Living Energy:</dt>
        <dd>{metrics.livingEnergy.toFixed(0)}</dd>

        <dt>Producer Biomass:</dt>
        <dd>{metrics.producerBiomass.toFixed(2)}</dd>

        <dt>Extinctions:</dt>
        <dd>{metrics.extinctionCount}</dd>
      </dl>
    </div>
  );
}

/**
 * Timeline scrubber for a branch with clickable checkpoints
 */
function BranchTimeline({
  branch,
  checkpoints,
  syncedTick,
  onSyncTick,
  label,
}: {
  branch: WorldBranch | undefined;
  checkpoints: Array<{ tick: number }>;
  syncedTick: number | null;
  onSyncTick: (tick: number) => void;
  label: string;
}): React.ReactElement {
  if (!branch || checkpoints.length === 0) {
    return <p>{label}: No checkpoints available</p>;
  }

  return (
    <div className={styles.branchTimeline}>
      <h5>{label} Timeline</h5>
      <div className={styles.timelineBar}>
        {checkpoints.map((cp) => (
          <button
            key={cp.tick}
            className={`${styles.timelineCheckpoint} ${syncedTick === cp.tick ? styles.synced : ''}`}
            onClick={() => onSyncTick(cp.tick)}
            title={`Jump to tick ${cp.tick} and sync with other branch`}
          >
            {cp.tick}
          </button>
        ))}
      </div>
      {syncedTick !== null && (
        <p className={styles.syncStatus}>
          Synced to tick <strong>{syncedTick}</strong>
        </p>
      )}
    </div>
  );
}

/**
 * Map region selector for a branch (placeholder for future map view rendering)
 *
 * Currently displays a grid of region labels. In future versions, clicking a region
 * will be wired to actual map/canvas visualization showing creature distributions.
 */
function BranchMapRegionSelector({
  branch,
  syncedMapRegion,
  onSyncMapRegion,
  label,
}: {
  branch: WorldBranch | undefined;
  syncedMapRegion: { x: number; y: number } | null;
  onSyncMapRegion: (region: { x: number; y: number }) => void;
  label: string;
}): React.ReactElement {
  if (!branch?.worldState) {
    return <p>{label}: No world state available</p>;
  }

  // Create a simple grid of clickable regions (4x4 grid)
  const gridSize = 4;
  const cellWidth = Math.ceil((branch.worldState.width ?? 100) / gridSize);
  const cellHeight = Math.ceil((branch.worldState.height ?? 100) / gridSize);

  return (
    <div className={styles.branchMapRegion}>
      <h5>{label} Map Focus (Placeholder)</h5>
      <p className={styles.placeholderNote}>
        Map visualization coming in future versions. Currently shows region grid layout only.
      </p>
      <div className={styles.regionGrid}>
        {Array.from({ length: gridSize * gridSize }).map((_, idx) => {
          const row = Math.floor(idx / gridSize);
          const col = idx % gridSize;
          const x = col * cellWidth;
          const y = row * cellHeight;
          const isSynced =
            syncedMapRegion && syncedMapRegion.x === x && syncedMapRegion.y === y;

          return (
            <button
              key={idx}
              className={`${styles.mapRegionCell} ${isSynced ? styles.synced : ''}`}
              onClick={() => onSyncMapRegion({ x, y })}
              title={`Region (${x}, ${y})`}
              aria-label={`Region ${col + 1}-${row + 1}`}
            >
              ({col}, {row})
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Display divergence points between branches
 */
function DivergenceAnalysis({
  divergence,
}: {
  divergence: BranchDivergence;
}): React.ReactElement {
  return (
    <div className={styles.branchDivergence}>
      {divergence.divergenceTick && (
        <div className={styles.divergencePoint}>
          <h4>First Divergence</h4>
          <p>Major differences first appear at tick {divergence.divergenceTick}</p>
        </div>
      )}

      {divergence.extinctionDifferences.length > 0 && (
        <div className={styles.extinctionDifferences}>
          <h4>Extinctions That Differ</h4>
          <ul>
            {divergence.extinctionDifferences.slice(0, 5).map((diff, idx) => (
              <li key={idx}>
                <strong>{diff.speciesId}</strong> extinct in{' '}
                {diff.extinctIn === 'branch_a' ? 'Branch A' : 'Branch B'} at tick {diff.tick}
              </li>
            ))}
          </ul>
          {divergence.extinctionDifferences.length > 5 && (
            <p className={styles.moreItems}>
              +{divergence.extinctionDifferences.length - 5} more differences
            </p>
          )}
        </div>
      )}

      {divergence.metricsSamples.length > 0 && (
        <div className={styles.metricsTimeline}>
          <h4>Ecosystem Metrics Over Time</h4>
          <div className={styles.timelineComparison}>
            {divergence.metricsSamples.slice(0, 5).map((sample, idx) => (
              <div key={idx} className={styles.timelineCheckpoint}>
                <span className={styles.checkpointTick}>Tick {sample.tick}</span>
                <div className={styles.checkpointMetrics}>
                  {sample.metrics_a && (
                    <span className={styles.popA} title={`Pop: ${sample.metrics_a.population}`}>
                      A: {sample.metrics_a.population}
                    </span>
                  )}
                  {sample.metrics_b && (
                    <span className={styles.popB} title={`Pop: ${sample.metrics_b.population}`}>
                      B: {sample.metrics_b.population}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Branch selector dropdown
 */
function BranchSelector({
  branchId,
  label,
  onSelect,
}: {
  branchId: string | null;
  label: string;
  onSelect: (id: string) => void;
}): React.ReactElement {
  const branchCollection = useStore((state) => state.branchCollection);

  const branches = useMemo(() => {
    if (!branchCollection) return [];
    return [
      { id: branchCollection.main.id, name: branchCollection.main.name, isMain: true },
      ...branchCollection.alternatives.map((b) => ({ id: b.id, name: b.name, isMain: false })),
    ];
  }, [branchCollection]);

  return (
    <div className={styles.branchSelector}>
      <label>{label}</label>
      <select
        value={branchId || 'main'}
        onChange={(e) => onSelect(e.target.value === 'main' ? branchCollection!.main.id : e.target.value)}
      >
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name} {branch.isMain ? '(main)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Main Branch Comparison Component
 *
 * Displays two branches side-by-side with:
 * - Ecosystem metrics
 * - Divergence analysis
 * - Trait frequency comparison
 * - Timeline/map focus synchronization
 */
export function BranchComparisonView({
  branchA,
  branchB,
  onSelectBranch,
}: BranchComparisonProps): React.ReactElement | null {
  const branchCollection = useStore((state) => state.branchCollection);

  // Timeline/map focus sync state
  const [syncedTick, setSyncedTick] = useState<number | null>(null);
  const [syncedMapRegion, setSyncedMapRegion] = useState<{ x: number; y: number } | null>(null);

  const displayBranchA = useMemo(
    () => branchA || branchCollection?.main,
    [branchA, branchCollection]
  );

  const displayBranchB = useMemo(
    () => branchB || branchCollection?.alternatives[0],
    [branchB, branchCollection]
  );

  const divergence = useMemo(() => {
    if (!displayBranchA || !displayBranchB) return null;
    const commonTick = findCommonHistoryTick(displayBranchA, displayBranchB);
    return compareBranches(displayBranchA, displayBranchB, commonTick);
  }, [displayBranchA, displayBranchB]);

  // Compute metrics: use synced tick if available, otherwise use current state
  const metricsA = useMemo(() => {
    if (!displayBranchA) return undefined;

    // If a synced tick is set, try to get world state at that tick
    if (syncedTick !== null) {
      const syncedWorldState = getWorldStateAtTick(displayBranchA, syncedTick);
      if (syncedWorldState) {
        return sampleMetrics(syncedWorldState);
      }
    }

    // Fall back to current world state
    return displayBranchA.worldState ? sampleMetrics(displayBranchA.worldState) : undefined;
  }, [displayBranchA, syncedTick]);

  const metricsB = useMemo(() => {
    if (!displayBranchB) return undefined;

    // If a synced tick is set, try to get world state at that tick
    if (syncedTick !== null) {
      const syncedWorldState = getWorldStateAtTick(displayBranchB, syncedTick);
      if (syncedWorldState) {
        return sampleMetrics(syncedWorldState);
      }
    }

    // Fall back to current world state
    return displayBranchB.worldState ? sampleMetrics(displayBranchB.worldState) : undefined;
  }, [displayBranchB, syncedTick]);

  // Get checkpoints for timeline synchronization
  const checkpointsA = displayBranchA?.checkpoints ?? [];
  const checkpointsB = displayBranchB?.checkpoints ?? [];

  /**
   * Sync timeline position: when one branch's timeline is clicked,
   * update the synced tick for both branches
   */
  const handleTimelineSync = (tick: number) => {
    setSyncedTick(tick);
  };

  /**
   * Sync map focus: when one branch's map is clicked,
   * update the synced map region for both branches
   */
  const handleMapSync = (region: { x: number; y: number }) => {
    setSyncedMapRegion(region);
  };

  if (!displayBranchA) {
    return (
      <div className={`${styles.branchComparison} ${styles.empty}`}>
        <p>No branches available. Create a branch from a checkpoint to begin.</p>
      </div>
    );
  }

  return (
    <div className={styles.branchComparisonContainer}>
      <div className={styles.branchComparisonHeader}>
        <h2>Counterfactual World Comparison</h2>
        <p>Compare how different interventions affect ecosystem evolution</p>
      </div>

      <div className={styles.branchSelectors}>
        {branchCollection && (
          <>
            <BranchSelector
              branchId={displayBranchA?.id || null}
              label="Branch A:"
              onSelect={(id) => onSelectBranch?.(id)}
            />
            {displayBranchB && (
              <BranchSelector
                branchId={displayBranchB?.id || null}
                label="Branch B:"
                onSelect={(id) => onSelectBranch?.(id)}
              />
            )}
          </>
        )}
      </div>

      <div className={styles.branchMetadata}>
        <div className={styles.branchInfo}>
          <h3>{displayBranchA?.name}</h3>
          {displayBranchA?.changedIntervention && (
            <p className={styles.intervention}>
              <strong>Changed:</strong> {displayBranchA.changedIntervention.label}
              <br />
              <strong>At tick:</strong> {displayBranchA.changedIntervention.tick}
            </p>
          )}
        </div>
        {displayBranchB && (
          <div className={styles.branchInfo}>
            <h3>{displayBranchB?.name}</h3>
            {displayBranchB?.changedIntervention && (
              <p className={styles.intervention}>
                <strong>Changed:</strong> {displayBranchB.changedIntervention.label}
                <br />
                <strong>At tick:</strong> {displayBranchB.changedIntervention.tick}
              </p>
            )}
          </div>
        )}
      </div>

      <div className={styles.comparisonGrid}>
        <MetricsCard
          label={syncedTick !== null ? `Branch A - Tick ${syncedTick}` : 'Branch A - Current State'}
          metrics={metricsA}
        />
        {displayBranchB && (
          <MetricsCard
            label={syncedTick !== null ? `Branch B - Tick ${syncedTick}` : 'Branch B - Current State'}
            metrics={metricsB}
          />
        )}
      </div>

      {/* Timeline Synchronization */}
      <div className={styles.timelineSyncSection}>
        <h3>Timeline Focus Synchronization</h3>
        <div className={styles.timelineGrid}>
          <BranchTimeline
            branch={displayBranchA}
            checkpoints={checkpointsA}
            syncedTick={syncedTick}
            onSyncTick={handleTimelineSync}
            label="Branch A"
          />
          {displayBranchB && (
            <BranchTimeline
              branch={displayBranchB}
              checkpoints={checkpointsB}
              syncedTick={syncedTick}
              onSyncTick={handleTimelineSync}
              label="Branch B"
            />
          )}
        </div>
      </div>

      {/* Map Region Focus Synchronization - Placeholder for future implementation */}
      {/*
      <div className={styles.mapSyncSection}>
        <h3>Map Region Focus Synchronization (Coming Soon)</h3>
        <p>Map visualization with region synchronization will be available in future versions.</p>
        <div className={styles.mapGrid}>
          <BranchMapRegionSelector
            branch={displayBranchA}
            syncedMapRegion={syncedMapRegion}
            onSyncMapRegion={handleMapSync}
            label="Branch A"
          />
          {displayBranchB && (
            <BranchMapRegionSelector
              branch={displayBranchB}
              syncedMapRegion={syncedMapRegion}
              onSyncMapRegion={handleMapSync}
              label="Branch B"
            />
          )}
        </div>
      </div>
      */}

      {/* Trait Frequency Comparison */}
      {metricsA && <TraitFrequencyComparison metricsA={metricsA} metricsB={metricsB} />}

      {/* Timeline Focus Synchronization Status */}
      {syncedTick !== null && (
        <div className={styles.syncInfo}>
          <h4>Timeline Synchronization Active</h4>
          <p>
            Both branches synced to <strong>tick {syncedTick}</strong>
            <button onClick={() => setSyncedTick(null)} className={styles.clearSyncBtn}>
              Clear Sync
            </button>
          </p>
        </div>
      )}

      {divergence && displayBranchB && <DivergenceAnalysis divergence={divergence} />}
    </div>
  );
}

export default BranchComparisonView;
