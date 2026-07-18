import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../state/store';
import { buildSessionSummary, type SessionSummary } from './sessionSummary';
import { compareSessionSummaries, type SessionComparisonTone } from './sessionComparison';
import {
  createObservationBaseline,
  isObservationBaselineValid,
  MAX_OBSERVATION_NOTE_LENGTH,
  type ObservationBaseline,
} from './observationBaseline';

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

const comparisonColors: Record<SessionComparisonTone, string> = {
  ended: '#ef8b8b', contraction: '#e7a16f', expansion: '#79c98a',
  evolution: '#bba7e8', mixed: '#c2b58c', steady: '#93a0a6',
};

function signed(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString()}`;
}

function RecapDialog({
  summary,
  baseline,
  noteDraft,
  onNoteChange,
  onSaveBaseline,
  onClearBaseline,
  onClose,
}: {
  summary: SessionSummary;
  baseline: ObservationBaseline | null;
  noteDraft: string;
  onNoteChange: (note: string) => void;
  onSaveBaseline: () => void;
  onClearBaseline: () => void;
  onClose: () => void;
}) {
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
  const comparison = baseline ? compareSessionSummaries(baseline.summary, summary) : null;
  const comparisonMetrics = comparison ? [
    ['Population', comparison.deltas.population],
    ['Active species', comparison.deltas.activeSpecies],
    ['Active lineages', comparison.deltas.activeLineages],
    ['Biomass', comparison.deltas.biomass],
    ['Births', comparison.deltas.births],
    ['Deaths', comparison.deltas.deaths],
    ['Mutations', comparison.deltas.mutations],
    ['Extinctions', comparison.deltas.extinctions],
    ['Interventions', comparison.deltas.interventions],
  ] as const : [];

  return createPortal(
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby="session-recap-title">
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'start' }}>
          <div>
            <div style={{ color: summary.status === 'living' ? '#79c98a' : '#ef8b8b', fontSize: '0.68rem', letterSpacing: '0.12em' }}>
              {summary.status === 'living' ? 'LIVING WORLD' : 'SESSION ENDED'}
            </div>
            <h2 id="session-recap-title" style={{ margin: '0.25rem 0 0.2rem' }}>
              {summary.worldName ? `${summary.worldName} — story so far` : 'Story so far'}
            </h2>
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

        <section style={{ border: '1px solid #3b464b', borderRadius: 7, padding: '0.65rem', marginTop: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
            <strong style={{ fontSize: '0.76rem' }}>Compare observations</strong>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              {baseline && (
                <button type="button" style={buttonStyle} onClick={onClearBaseline}>Clear baseline</button>
              )}
              <button type="button" style={buttonStyle} onClick={onSaveBaseline}>
                {baseline ? 'Replace baseline' : 'Save as baseline'}
              </button>
            </div>
          </div>
          <label htmlFor="observation-note" style={{ display: 'block', color: '#899398', fontSize: '0.66rem', marginTop: '0.45rem' }}>
            What did you change or expect? (optional)
          </label>
          <textarea
            id="observation-note"
            value={noteDraft}
            maxLength={MAX_OBSERVATION_NOTE_LENGTH}
            onChange={(event) => onNoteChange(event.target.value)}
            rows={2}
            placeholder="Example: Raised producer growth; expecting grazers to recover."
            style={{
              width: '100%', boxSizing: 'border-box', resize: 'vertical', marginTop: '0.2rem',
              border: '1px solid #465159', borderRadius: 5, background: '#1c2225', color: '#d6e0e4',
              padding: '0.4rem', font: 'inherit', fontSize: '0.7rem',
            }}
          />
          <div style={{ color: '#667279', fontSize: '0.6rem', textAlign: 'right' }}>
            {MAX_OBSERVATION_NOTE_LENGTH - noteDraft.length} characters remaining
          </div>
          {!comparison ? (
            <div style={{ color: '#7f8b91', fontSize: '0.68rem', marginTop: '0.35rem' }}>
              Save this snapshot, then open Story so far later to see what changed.
            </div>
          ) : (
            <>
              {baseline?.note && (
                <div style={{ borderLeft: '2px solid #607781', paddingLeft: '0.5rem', color: '#aab7bc', fontSize: '0.68rem', marginTop: '0.4rem' }}>
                  <strong style={{ color: '#819098' }}>Note from tick {baseline.summary.ticksSurvived.toLocaleString()}:</strong>{' '}
                  {baseline.note}
                </div>
              )}
              <div style={{ color: comparisonColors[comparison.tone], fontWeight: 700, fontSize: '0.74rem', marginTop: '0.4rem' }}>
                {comparison.summary}
              </div>
              <div style={{ color: '#7f8b91', fontSize: '0.66rem', marginTop: '0.15rem' }}>
                Tick {comparison.fromTick.toLocaleString()} → {comparison.toTick.toLocaleString()} · {comparison.ticksElapsed.toLocaleString()} ticks elapsed
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(105px, 1fr))', gap: '0.3rem', marginTop: '0.45rem' }}>
                {comparisonMetrics.map(([label, value]) => (
                  <div key={label} style={{ background: '#22282c', borderRadius: 5, padding: '0.4rem' }}>
                    <div style={{ color: '#7f8b91', fontSize: '0.61rem' }}>{label}</div>
                    <div style={{ fontSize: '0.8rem', marginTop: '0.08rem' }}>{signed(value)}</div>
                  </div>
                ))}
              </div>
              <div style={{ color: '#68747a', fontSize: '0.61rem', marginTop: '0.35rem' }}>
                These are observed changes, not a better-or-worse score.
              </div>
            </>
          )}
        </section>

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
  const [baseline, setBaseline] = useState<ObservationBaseline | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  useEffect(() => {
    if (!baseline) return;
    if (isObservationBaselineValid(baseline, world?.seed ?? null, tick)) return;
    setBaseline(null);
    setNoteDraft('');
  }, [baseline, world?.seed, tick]);
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
      {summary && (
        <RecapDialog
          summary={summary}
          baseline={baseline}
          noteDraft={noteDraft}
          onNoteChange={setNoteDraft}
          onSaveBaseline={() => {
            const observation = createObservationBaseline(summary, noteDraft);
            setBaseline(observation);
            setNoteDraft(observation.note ?? '');
          }}
          onClearBaseline={() => {
            setBaseline(null);
            setNoteDraft('');
          }}
          onClose={() => setSummary(null)}
        />
      )}
    </>
  );
}
