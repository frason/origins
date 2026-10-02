/**
 * Branch Comparison UI
 *
 * Allows players to:
 * - Create branches from checkpoints
 * - Compare two branches side-by-side
 * - See where and why ecosystems diverge
 * - Synchronize timeline view across branches
 */

import React, { useMemo } from 'react';
import {
  compareBranches,
  findCommonHistoryTick,
  sampleMetrics,
  type WorldBranch,
  type BranchDivergence,
} from '../simulation/worldBranch';
import { useStore } from '../state/store';
import type { EcosystemMetrics } from '../simulation/worldBranch';
import styles from './BranchComparison.module.css';

export interface BranchComparisonProps {
  branchA?: WorldBranch;
  branchB?: WorldBranch;
  onSelectBranch?: (branchId: string) => void;
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
 * - Timeline synchronization
 */
export function BranchComparisonView({
  branchA,
  branchB,
  onSelectBranch,
}: BranchComparisonProps): React.ReactElement | null {
  const branchCollection = useStore((state) => state.branchCollection);

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

  const metricsA = useMemo(
    () => (displayBranchA?.worldState ? sampleMetrics(displayBranchA.worldState) : undefined),
    [displayBranchA]
  );

  const metricsB = useMemo(
    () => (displayBranchB?.worldState ? sampleMetrics(displayBranchB.worldState) : undefined),
    [displayBranchB]
  );

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
        <MetricsCard label="Branch A - Current State" metrics={metricsA} />
        {displayBranchB && <MetricsCard label="Branch B - Current State" metrics={metricsB} />}
      </div>

      {divergence && displayBranchB && <DivergenceAnalysis divergence={divergence} />}
    </div>
  );
}

export default BranchComparisonView;
