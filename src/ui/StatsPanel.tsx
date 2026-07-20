/**
 * StatsPanel — headline ecosystem metrics from the current snapshot.
 */

import { CSSProperties, useMemo } from 'react';
import { useStore } from '../state/store';
import {
  getBiodiversityState,
  getEcosystemDynamics,
  type DynamicsMetric,
  type HealthTone,
} from './ecosystemHealth';
import EcosystemPressurePanel from './EcosystemPressurePanel';
import { getLiveEventTotals } from './liveEventMetrics';
import {
  getEcosystemTrajectories,
  type DynamicsTrajectory,
} from './ecosystemTrajectory';
import { buildEcosystemPoints } from './ecosystemPoints';
import EcosystemPointsPanel from './EcosystemPointsPanel';
import { formatPrematureDeathRate, getPrematureDeathMetrics } from './prematureDeathMetrics';
import { buildLocalBiomassSummary } from './biomassObservability';

const panelStyle: CSSProperties = {
  backgroundColor: '#222',
  borderRadius: 8,
  padding: '0.75rem 1rem',
  color: '#eee',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '0.85rem',
};

const toneColors: Record<HealthTone, { background: string; color: string }> = {
  danger: { background: '#5a2d2d', color: '#ff8a8a' },
  warning: { background: '#5a522d', color: '#eadb78' },
  stable: { background: '#2d4a5a', color: '#79d8e8' },
  healthy: { background: '#2d5a35', color: '#79dc89' },
};

function Badge({ label, tone }: { label: string; tone: HealthTone }) {
  const colors = toneColors[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        padding: '0.25rem 0.5rem',
        borderRadius: 999,
        backgroundColor: colors.background,
        color: colors.color,
        fontSize: '0.72rem',
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.15rem 0' }}>
      <span style={{ color: '#bbb' }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function HelpRow({ label, value, help }: { label: string; value: string | number; help: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', padding: '0.15rem 0' }}>
      <span style={{ color: '#bbb' }} title={help}>{label} <span aria-hidden="true">?</span></span>
      <span>{value}</span>
    </div>
  );
}

const trajectorySymbols: Record<DynamicsTrajectory['direction'], string> = {
  rising: '↑', falling: '↓', steady: '→', emerging: '·',
};

function DynamicsRow({
  label,
  metric,
  trajectory,
}: {
  label: string;
  metric: DynamicsMetric;
  trajectory: DynamicsTrajectory;
}) {
  const colors = toneColors[metric.tone];
  return (
    <div style={{ margin: '0.55rem 0' }} title={metric.explanation}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
        <span style={{ color: '#ddd', fontWeight: 600 }}>{label}</span>
        <span style={{ color: colors.color }}>{metric.label} · {metric.score}</span>
      </div>
      <div style={{ height: 5, margin: '0.25rem 0', borderRadius: 99, background: '#3a3a3a' }}>
        <div
          style={{ width: `${metric.score}%`, height: '100%', borderRadius: 99, background: colors.color }}
        />
      </div>
      <div style={{ color: '#888', fontSize: '0.68rem', lineHeight: 1.35 }}>
        {metric.explanation}
      </div>
      <div
        title={trajectory.explanation}
        style={{ color: '#aaa', fontSize: '0.68rem', lineHeight: 1.35, marginTop: '0.15rem' }}
      >
        {trajectorySymbols[trajectory.direction]} {trajectory.label} — {trajectory.explanation}
      </div>
    </div>
  );
}

export default function StatsPanel() {
  const worldState = useStore((s) => s.worldState);
  const tick = useStore((s) => s.tick);
  const maxPopulation = useStore((s) => s.constants.maxGlobalPopulation);

  let alive = 0;
  let corpses = 0;
  let totalEnergy = 0;
  let births = 0;
  let mutations = 0;
  const species = new Set<string>();
  const biomass = useMemo(
    () => worldState ? buildLocalBiomassSummary(worldState) : null,
    [worldState]
  );

  if (worldState) {
    for (const c of worldState.creatures) {
      if (c.lifecycleState === 'alive') {
        alive++;
        totalEnergy += c.energy;
        species.add(c.speciesId);
      } else {
        corpses++;
      }
    }
    const totals = getLiveEventTotals(worldState.history, worldState.events);
    births = totals.births;
    mutations = totals.mutations;
  }

  const biodiversity = getBiodiversityState(species.size);
  const dynamics = getEcosystemDynamics(worldState, tick, maxPopulation);
  const trajectories = getEcosystemTrajectories(worldState, tick);
  const points = buildEcosystemPoints(worldState, tick);
  const prematureDeaths = getPrematureDeathMetrics(worldState?.events ?? []).ecosystem;

  return (
    <div style={panelStyle}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '0.6rem',
        }}
      >
        <div style={{ fontWeight: 600 }}>Ecosystem</div>
        <Badge {...dynamics.overall} />
      </div>
      <div style={{ marginBottom: '0.45rem' }}>
        <Badge {...biodiversity} />
      </div>
      <DynamicsRow label="Order" metric={dynamics.order} trajectory={trajectories.order} />
      <DynamicsRow label="Chaos" metric={dynamics.chaos} trajectory={trajectories.chaos} />
      <DynamicsRow label="Exploration" metric={dynamics.exploration} trajectory={trajectories.exploration} />
      <EcosystemPointsPanel points={points} />
      <div style={{ borderTop: '1px solid #383838', margin: '0.65rem 0 0.45rem' }} />
      <Row label="Population" value={alive} />
      <Row label="Species" value={species.size} />
      <Row label="Births" value={births} />
      <Row label="Mutations" value={mutations} />
      <Row label="Corpses" value={corpses} />
      <Row label="Premature deaths" value={formatPrematureDeathRate(prematureDeaths)} />
      <Row label="Avg energy" value={alive > 0 ? (totalEnergy / alive).toFixed(1) : '—'} />
      <HelpRow
        label="Global biomass"
        value={Math.round(biomass?.totalBiomass ?? 0).toLocaleString()}
        help="All producer food in the world. A high total can hide shortages where creatures live."
      />
      <HelpRow
        label="Local food / tile"
        value={biomass && biomass.occupiedTileCount > 0
          ? biomass.averageOccupiedTileBiomass.toFixed(1)
          : '—'}
        help="Average producer biomass on tiles occupied by living creatures."
      />
      <HelpRow
        label="Depleted habitat"
        value={biomass && biomass.occupiedTileCount > 0
          ? `${Math.round(biomass.depletedOccupiedTileShare * 100)}%`
          : '—'}
        help="Share of occupied tiles below 25% of their biome's carrying capacity."
      />
      <HelpRow
        label="Local food trend"
        value={biomass?.recoveryLabel ?? '—'}
        help="Change in occupied-habitat food between bounded history samples."
      />
      <EcosystemPressurePanel />
    </div>
  );
}
