/**
 * StatsPanel — headline ecosystem metrics from the current snapshot.
 */

import { CSSProperties } from 'react';
import { useStore } from '../state/store';

const panelStyle: CSSProperties = {
  backgroundColor: '#222',
  borderRadius: 8,
  padding: '0.75rem 1rem',
  color: '#eee',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '0.85rem',
};

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

  return (
    <div style={panelStyle}>
      <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Ecosystem</div>
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
