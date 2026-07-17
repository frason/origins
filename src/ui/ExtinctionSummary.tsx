import type { CSSProperties } from 'react';
import { useStore } from '../state/store';
import { buildSessionSummary, hasLivingCreatures } from './sessionSummary';
import { speciesDisplayName } from '../simulation/speciesNames';

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 200,
  display: 'grid',
  placeItems: 'center',
  padding: '1rem',
  background: 'rgba(6, 8, 10, 0.86)',
  color: '#eee',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const cardStyle: CSSProperties = {
  width: 'min(680px, 100%)',
  maxHeight: '90vh',
  overflowY: 'auto',
  padding: '1.5rem',
  border: '1px solid #555',
  borderRadius: 12,
  background: '#17191c',
  boxShadow: '0 18px 60px rgba(0, 0, 0, 0.6)',
};

function eventText(event: ReturnType<typeof buildSessionSummary>['finalEvents'][number]) {
  const subject = event.speciesId
    ? speciesDisplayName(event.speciesId)
    : event.creatureId ?? 'ecosystem';
  if (event.type === 'birth') return `${subject} was born`;
  if (event.type === 'death') return `${subject} died`;
  if (event.type === 'mutation') return event.detail ?? `${subject} formed a new lineage`;
  if (event.type === 'intervention') return event.detail ?? 'God Mode reshaped the world';
  return `${subject} went extinct`;
}

export default function ExtinctionSummary({ onRestart }: { onRestart: () => void }) {
  const worldState = useStore((state) => state.worldState);
  const tick = useStore((state) => state.tick);

  if (!worldState || tick === 0 || hasLivingCreatures(worldState)) return null;
  const summary = buildSessionSummary(worldState, tick);
  const metrics = [
    ['Ticks survived', summary.ticksSurvived.toLocaleString()],
    ['Species observed', summary.speciesObserved.toLocaleString()],
    ['Births', summary.births.toLocaleString()],
    ['Deaths', summary.deaths.toLocaleString()],
    ['Mutations', summary.mutations.toLocaleString()],
    ['Extinctions', summary.extinctions.toLocaleString()],
    ['Interventions', summary.interventions.toLocaleString()],
  ];

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby="extinction-title">
      <div style={cardStyle}>
        <div style={{ color: '#c49b83', fontSize: '0.75rem', letterSpacing: '0.15em' }}>
          SESSION COMPLETE
        </div>
        <h2 id="extinction-title" style={{ margin: '0.35rem 0 0.4rem', fontSize: '2rem' }}>
          Life has ended
        </h2>
        <p style={{ color: '#aaa', margin: '0 0 1.25rem' }}>
          The last creature is gone, but the world records what happened.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
          {metrics.map(([label, value]) => (
            <div key={label} style={{ background: '#22262a', borderRadius: 7, padding: '0.7rem' }}>
              <div style={{ color: '#888', fontSize: '0.72rem' }}>{label}</div>
              <div style={{ fontSize: '1.2rem', marginTop: '0.15rem' }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '1.1rem', color: '#aaa' }}>
          The empty world still holds {Math.round(summary.remainingBiomass).toLocaleString()} units
          of producer biomass.
        </div>

        <h3 style={{ margin: '1.25rem 0 0.5rem', fontSize: '0.9rem' }}>Final events</h3>
        {summary.finalEvents.length === 0 ? (
          <div style={{ color: '#777' }}>No major events were recorded.</div>
        ) : (
          summary.finalEvents.map((event, index) => (
            <div
              key={`${event.tick}-${event.type}-${event.creatureId ?? event.speciesId ?? index}`}
              style={{ borderTop: '1px solid #303337', padding: '0.45rem 0', color: '#bbb' }}
            >
              <span style={{ color: '#777', marginRight: '0.6rem' }}>tick {event.tick}</span>
              {eventText(event)}
            </div>
          ))
        )}

        <button
          onClick={onRestart}
          style={{
            marginTop: '1.25rem',
            width: '100%',
            padding: '0.75rem',
            border: 0,
            borderRadius: 7,
            background: '#d3b38c',
            color: '#18130f',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Begin a new world
        </button>
      </div>
    </div>
  );
}
