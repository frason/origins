import type { CSSProperties } from 'react';
import { useStore } from '../state/store';
import { buildInterventionImpact } from './interventionImpactModel';

const toneColors = {
  early: '#8aa8b8',
  positive: '#79dc89',
  warning: '#e7a16f',
  neutral: '#c2b58c',
};

function signed(value: number, digits = 0): string {
  const rounded = digits > 0 ? value.toFixed(digits) : Math.round(value).toLocaleString();
  return `${value > 0 ? '+' : ''}${rounded}`;
}

export default function InterventionImpact() {
  const worldState = useStore((state) => state.worldState);
  const tick = useStore((state) => state.tick);
  const impact = buildInterventionImpact(worldState, tick);
  if (!impact) return null;

  const itemStyle: CSSProperties = {
    borderRadius: 5,
    background: '#292d30',
    padding: '0.4rem 0.5rem',
  };

  return (
    <section
      aria-labelledby="intervention-impact-title"
      style={{ border: '1px solid #38545e', borderRadius: 7, padding: '0.65rem', marginBottom: '0.7rem' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
        <strong id="intervention-impact-title" style={{ color: '#9fd5e0' }}>
          Since intervention
        </strong>
        <span style={{ color: '#777', fontSize: '0.68rem' }}>{impact.ticksSince} ticks</span>
      </div>
      <div style={{ color: toneColors[impact.tone], margin: '0.25rem 0 0.5rem', fontWeight: 600 }}>
        {impact.summary}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.3rem' }}>
        <div style={itemStyle}><small style={{ color: '#777' }}>Population</small><div>{signed(impact.populationDelta)}</div></div>
        <div style={itemStyle}><small style={{ color: '#777' }}>Species</small><div>{signed(impact.speciesDelta)}</div></div>
        <div style={itemStyle}><small style={{ color: '#777' }}>Lineages</small><div>{signed(impact.lineageDelta)}</div></div>
      </div>
      <div style={{ color: '#888', fontSize: '0.67rem', marginTop: '0.45rem', lineHeight: 1.4 }}>
        {impact.births} births · {impact.deaths} deaths · {impact.mutations} mutations ·{' '}
        biomass {signed(impact.producerBiomassDelta)}
      </div>
      <div style={{ color: '#626b70', fontSize: '0.62rem', marginTop: '0.3rem' }}>
        Changes observed after the latest God Mode action; other ecosystem forces may contribute.
      </div>
    </section>
  );
}
