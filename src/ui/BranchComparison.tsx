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
      <div className="branch-metrics-card empty">
        <h4>{label}</h4>
        <p>No data available</p>
      </div>
    );
  }

  return (
    <div className="branch-metrics-card">
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
    <div className="branch-divergence">
      {divergence.divergenceTick && (
        <div className="divergence-point">
          <h4>First Divergence</h4>
          <p>Major differences first appear at tick {divergence.divergenceTick}</p>
        </div>
      )}

      {divergence.extinctionDifferences.length > 0 && (
        <div className="extinction-differences">
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
            <p className="more-items">
              +{divergence.extinctionDifferences.length - 5} more differences
            </p>
          )}
        </div>
      )}

      {divergence.metricsSamples.length > 0 && (
        <div className="metrics-timeline">
          <h4>Ecosystem Metrics Over Time</h4>
          <div className="timeline-comparison">
            {divergence.metricsSamples.slice(0, 5).map((sample, idx) => (
              <div key={idx} className="timeline-checkpoint">
                <span className="checkpoint-tick">Tick {sample.tick}</span>
                <div className="checkpoint-metrics">
                  {sample.metrics_a && (
                    <span className="pop-a" title={`Pop: ${sample.metrics_a.population}`}>
                      A: {sample.metrics_a.population}
                    </span>
                  )}
                  {sample.metrics_b && (
                    <span className="pop-b" title={`Pop: ${sample.metrics_b.population}`}>
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
    <div className="branch-selector">
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
      <div className="branch-comparison empty">
        <p>No branches available. Create a branch from a checkpoint to begin.</p>
      </div>
    );
  }

  return (
    <div className="branch-comparison-container">
      <div className="branch-comparison-header">
        <h2>Counterfactual World Comparison</h2>
        <p>Compare how different interventions affect ecosystem evolution</p>
      </div>

      <div className="branch-selectors">
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

      <div className="branch-metadata">
        <div className="branch-info">
          <h3>{displayBranchA?.name}</h3>
          {displayBranchA?.changedIntervention && (
            <p className="intervention">
              <strong>Changed:</strong> {displayBranchA.changedIntervention.label}
              <br />
              <strong>At tick:</strong> {displayBranchA.changedIntervention.tick}
            </p>
          )}
        </div>
        {displayBranchB && (
          <div className="branch-info">
            <h3>{displayBranchB?.name}</h3>
            {displayBranchB?.changedIntervention && (
              <p className="intervention">
                <strong>Changed:</strong> {displayBranchB.changedIntervention.label}
                <br />
                <strong>At tick:</strong> {displayBranchB.changedIntervention.tick}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="comparison-grid">
        <MetricsCard label="Branch A - Current State" metrics={metricsA} />
        {displayBranchB && <MetricsCard label="Branch B - Current State" metrics={metricsB} />}
      </div>

      {divergence && displayBranchB && <DivergenceAnalysis divergence={divergence} />}

      <style>{`
        .branch-comparison-container {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          padding: 1rem;
          background: #f5f5f5;
          border-radius: 4px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        .branch-comparison-header {
          text-align: center;
        }

        .branch-comparison-header h2 {
          margin: 0 0 0.5rem 0;
          font-size: 1.5rem;
        }

        .branch-comparison-header p {
          margin: 0;
          color: #666;
        }

        .branch-selectors {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
        }

        .branch-selector {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .branch-selector label {
          font-weight: 500;
          color: #333;
        }

        .branch-selector select {
          padding: 0.5rem;
          border: 1px solid #ccc;
          border-radius: 3px;
          font-size: 0.95rem;
        }

        .branch-metadata {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1rem;
        }

        .branch-info {
          padding: 1rem;
          background: white;
          border-radius: 4px;
          border-left: 4px solid #4285f4;
        }

        .branch-info h3 {
          margin: 0 0 0.5rem 0;
          font-size: 1.1rem;
        }

        .branch-info .intervention {
          margin: 0;
          font-size: 0.9rem;
          color: #555;
          line-height: 1.5;
        }

        .comparison-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 1rem;
        }

        .branch-metrics-card {
          padding: 1rem;
          background: white;
          border-radius: 4px;
          border: 1px solid #ddd;
        }

        .branch-metrics-card.empty {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 200px;
          color: #999;
        }

        .branch-metrics-card h4 {
          margin: 0 0 1rem 0;
          font-size: 1rem;
          border-bottom: 2px solid #4285f4;
          padding-bottom: 0.5rem;
        }

        .branch-metrics-card dl {
          margin: 0;
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 0.5rem 1rem;
          font-size: 0.9rem;
        }

        .branch-metrics-card dt {
          font-weight: 600;
          color: #333;
        }

        .branch-metrics-card dd {
          margin: 0;
          color: #666;
        }

        .branch-divergence {
          padding: 1rem;
          background: white;
          border-radius: 4px;
          border-left: 4px solid #ea4335;
        }

        .divergence-point {
          margin-bottom: 1.5rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid #eee;
        }

        .divergence-point h4 {
          margin: 0 0 0.5rem 0;
          color: #ea4335;
        }

        .divergence-point p {
          margin: 0;
          color: #666;
        }

        .extinction-differences {
          margin-bottom: 1.5rem;
        }

        .extinction-differences h4 {
          margin: 0 0 0.5rem 0;
          color: #d32f2f;
          font-size: 0.95rem;
        }

        .extinction-differences ul {
          margin: 0;
          padding-left: 1.5rem;
          list-style: disc;
        }

        .extinction-differences li {
          margin: 0.3rem 0;
          font-size: 0.9rem;
          color: #555;
        }

        .extinction-differences .more-items {
          margin: 0.5rem 0 0 0;
          font-size: 0.85rem;
          color: #999;
          font-style: italic;
        }

        .metrics-timeline {
          margin-top: 1rem;
        }

        .metrics-timeline h4 {
          margin: 0 0 0.5rem 0;
          font-size: 0.95rem;
          color: #333;
        }

        .timeline-comparison {
          display: flex;
          gap: 0.5rem;
          overflow-x: auto;
          padding: 0.5rem;
          background: #fafafa;
          border-radius: 3px;
        }

        .timeline-checkpoint {
          flex-shrink: 0;
          padding: 0.5rem;
          background: white;
          border: 1px solid #ddd;
          border-radius: 2px;
          min-width: 120px;
        }

        .checkpoint-tick {
          display: block;
          font-size: 0.8rem;
          font-weight: 600;
          color: #333;
          margin-bottom: 0.3rem;
        }

        .checkpoint-metrics {
          display: flex;
          gap: 0.5rem;
          font-size: 0.8rem;
        }

        .checkpoint-metrics span {
          flex: 1;
          padding: 0.3rem;
          border-radius: 2px;
          text-align: center;
        }

        .checkpoint-metrics .pop-a {
          background: #e3f2fd;
          color: #1976d2;
        }

        .checkpoint-metrics .pop-b {
          background: #f3e5f5;
          color: #7b1fa2;
        }

        .branch-comparison.empty {
          padding: 2rem;
          text-align: center;
          color: #999;
          background: white;
          border-radius: 4px;
        }

        @media (max-width: 768px) {
          .comparison-grid {
            grid-template-columns: 1fr;
          }

          .branch-metadata {
            grid-template-columns: 1fr;
          }

          .branch-selectors {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default BranchComparisonView;
