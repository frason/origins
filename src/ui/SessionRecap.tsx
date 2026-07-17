import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../state/store';
import { buildSessionSummary, type SessionSummary } from './sessionSummary';

const overlayStyle: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 300, display: 'grid', placeItems: 'center',
  padding: '1rem', background: 'rgba(6, 8, 10, 0.86)',
  fontFamily: 'system-ui, -apple-system, sans-serif', color: '#eee',
};

const cardStyle: CSSProperties = {
  width: 'min(720px, 100%)', maxHeight: '90vh', overflowY: 'auto',
  padding: '1.25rem', boxSizing: 'border-box', border: '1px solid #526067',
  borderRadius: 12, background: '#171b1e', boxShadow: '0 18px 60px rgba(0,0,0,.6)',
};

const buttonStyle: CSSProperties = {
  border: '1px solid #4c5a61', borderRadius: 5, background: '#293238', color: '#d6e2e7',
  padding: '0.25rem 0.5rem', cursor: 'pointer', fontSize: '0.68rem',
};

function RecapDialog({ summary, onClose }: { summary: SessionSummary; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const metrics = [
    ['Current population', summary.currentPopulation],
    ['Peak population', summary.peakPopulation],
    ['Active species', summary.activeSpecies],
    ['Species observed', summary.speciesObserved],
    ['Active lineages', summary.activeLineages],
    ['Births', summary.births],
    ['Deaths', summary.deaths],
    ['Mutations', summary.mutations],
    ['Extinctions', summary.extinctions],
    ['Interventions', summary.interventions],
    ['Producer biomass', Math.round(summary.remainingBiomass)],
  ] as const;

  return createPortal(
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby="session-recap-title">
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'start' }}>
          <div>
            <div style={{ color: summary.status === 'living' ? '#79c98a' : '#ef8b8b', fontSize: '0.68rem', letterSpacing: '0.12em' }}>
              {summary.status === 'living' ? 'LIVING WORLD' : 'SESSION ENDED'}
            </div>
            <h2 id="session-recap-title" style={{ margin: '0.25rem 0 0.2rem' }}>Story so far</h2>
            <div style={{ color: '#899398', fontSize: '0.75rem' }}>
              Snapshot captured at tick {summary.ticksSurvived.toLocaleString()}; the simulation was not paused.
            </div>
          </div>
          <button type="button" onClick={onClose} style={buttonStyle} aria-label="Close session recap" autoFocus>
            Close
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))', gap: '0.45rem', marginTop: '1rem' }}>
          {metrics.map(([label, value]) => (
            <div key={label} style={{ background: '#22282c', borderRadius: 6, padding: '0.55rem' }}>
              <div style={{ color: '#849097', fontSize: '0.64rem' }}>{label}</div>
              <div style={{ marginTop: '0.1rem', fontSize: '1rem' }}>{value.toLocaleString()}</div>
            </div>
          ))}
        </div>

        <h3 style={{ fontSize: '0.85rem', margin: '1rem 0 0.35rem' }}>Recent turning points</h3>
        {summary.recentStories.length === 0 ? (
          <div style={{ color: '#747d82', fontSize: '0.74rem' }}>No major events have been recorded yet.</div>
        ) : summary.recentStories.map((story) => (
          <article key={story.id} style={{ borderTop: '1px solid #30383c', padding: '0.4rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <strong style={{ color: '#c3d1d7', fontSize: '0.72rem' }}>{story.title}</strong>
              <span style={{ color: '#69747a', fontSize: '0.66rem' }}>tick {story.tick}</span>
            </div>
            <div style={{ color: '#8c989e', fontSize: '0.68rem', marginTop: '0.1rem' }}>{story.detail}</div>
          </article>
        ))}
      </div>
    </div>,
    document.body
  );
}

export default function SessionRecap() {
  const world = useStore((state) => state.worldState);
  const tick = useStore((state) => state.tick);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  if (!world) return null;

  return (
    <>
      <button
        type="button"
        style={buttonStyle}
        onClick={() => setSummary(buildSessionSummary(world, tick))}
      >
        Story so far
      </button>
      {summary && <RecapDialog summary={summary} onClose={() => setSummary(null)} />}
    </>
  );
}
