/**
 * StatsPanel — headline ecosystem metrics from the current snapshot.
 */

import { CSSProperties, useEffect, useRef } from 'react';
import { useStore } from '../state/store';
import {
  getBiodiversityState,
  getEcosystemHealth,
  type HealthTone,
} from './ecosystemHealth';

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

export default function StatsPanel() {
  const worldState = useStore((s) => s.worldState);
  const tick = useStore((s) => s.tick);
  const previousPopulation = useRef(0);

  let alive = 0;
  let corpses = 0;
  let totalEnergy = 0;
  let totalBiomass = 0;
  let births = 0;
  let mutations = 0;
  const species = new Set<string>();

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
    for (const cell of worldState.cells) {
      totalBiomass += cell.producerBiomass;
    }
    births = worldState.events.filter((event) => event.type === 'birth').length;
    mutations = worldState.events.filter((event) => event.type === 'mutation').length;
  }

  const biodiversity = getBiodiversityState(species.size);
  const health = getEcosystemHealth({
    speciesCount: species.size,
    totalPopulation: alive,
    totalBiomass,
    tick,
    previousPopulation: previousPopulation.current,
  });

  useEffect(() => {
    previousPopulation.current = alive;
  }, [alive]);

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
        <Badge {...health} />
      </div>
      <div style={{ marginBottom: '0.45rem' }}>
        <Badge {...biodiversity} />
      </div>
      <Row label="Population" value={alive} />
      <Row label="Species" value={species.size} />
      <Row label="Births" value={births} />
      <Row label="Mutations" value={mutations} />
      <Row label="Corpses" value={corpses} />
      <Row label="Avg energy" value={alive > 0 ? (totalEnergy / alive).toFixed(1) : '—'} />
      <Row label="Producer biomass" value={Math.round(totalBiomass).toLocaleString()} />
    </div>
  );
}
