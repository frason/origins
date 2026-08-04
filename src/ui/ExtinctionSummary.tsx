import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../state/store';
import { buildSessionSummary, hasLivingCreatures } from './sessionSummary';
import { speciesDisplayName } from '../simulation/speciesNames';
import PopulationHistoryChart from './PopulationHistoryChart';
import WorldStoryPanel from './WorldStoryPanel';
import EcosystemPointsPanel from './EcosystemPointsPanel';

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 200,
  display: 'grid',
  placeItems: 'center',
  padding: '1rem',
  background: 'rgba(6, 8, 10, 0.86)',
  color: 'var(--sim-color-screen-ink)',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const cardStyle: CSSProperties = {
  width: 'min(680px, 100%)',
  maxHeight: '90vh',
  overflowY: 'auto',
  padding: '1.5rem',
  border: '1px solid var(--sim-color-screen-border)',
  borderRadius: 12,
  background: '#17191c',
  boxShadow: '0 18px 60px rgba(0, 0, 0, 0.6)',
  colorScheme: 'dark',
};

function eventText(event: ReturnType<typeof buildSessionSummary>['finalEvents'][number]) {
  const subject = event.speciesId
    ? speciesDisplayName(event.speciesId)
    : event.creatureId ?? 'ecosystem';
  if (event.type === 'birth') return `${subject} was born`;
  if (event.type === 'death') return `${subject} died`;
  if (event.type === 'mutation') return event.detail ?? `${subject} formed a new lineage`;
  if (event.type === 'speciation') return event.detail ?? `${subject} became a new species`;
  if (event.type === 'intervention') return event.detail ?? 'God Mode reshaped the world';
  return `${subject} went extinct`;
}

export function getReplayTicks(checkpointTicks: number[], endTick: number): number[] {
  return [...new Set([0, ...checkpointTicks])]
    .filter((checkpointTick) => checkpointTick >= 0 && checkpointTick < endTick)
    .sort((a, b) => b - a);
}

interface ExtinctionSummaryProps {
  onNewWorld: () => void;
  onReplayWorld: () => void;
  onReplayFromTick: (tick: number) => string | null;
  checkpointTicks: number[];
}

export function ExtinctionActions({
  onNewWorld,
  onReplayWorld,
  onReplayFromTick,
  checkpointTicks,
  endTick,
}: ExtinctionSummaryProps & { endTick: number }) {
  const [replayMenuOpen, setReplayMenuOpen] = useState(false);
  const [selectedReplayTick, setSelectedReplayTick] = useState('0');
  const [replayError, setReplayError] = useState<string | null>(null);
  const replayTicks = useMemo(
    () => getReplayTicks(checkpointTicks, endTick),
    [checkpointTicks, endTick]
  );

  return (
    <div className="extinction-summary__actions">
      <button className="sim-button extinction-summary__action" type="button" onClick={onNewWorld}>
        New world
      </button>
      <div className="extinction-summary__replay">
        <button
          className="sim-button extinction-summary__replay-main"
          type="button"
          onClick={onReplayWorld}
        >
          Replay current world
        </button>
        <button
          className="sim-button extinction-summary__replay-toggle"
          type="button"
          aria-label="Choose a tick to replay from"
          aria-haspopup="menu"
          aria-expanded={replayMenuOpen}
          onClick={() => {
            setReplayMenuOpen((open) => !open);
            setReplayError(null);
          }}
        >
          ▾
        </button>
        {replayMenuOpen && (
          <div className="extinction-summary__replay-menu" role="menu">
            <label className="extinction-summary__replay-label" htmlFor="extinction-replay-tick">
              Start back at
            </label>
            <select
              className="extinction-summary__replay-select sim-data"
              id="extinction-replay-tick"
              value={selectedReplayTick}
              onChange={(event) => {
                setSelectedReplayTick(event.target.value);
                setReplayError(null);
              }}
            >
              {replayTicks.map((checkpointTick) => (
                <option key={checkpointTick} value={checkpointTick}>
                  Tick {checkpointTick.toLocaleString()}
                </option>
              ))}
            </select>
            <button
              className="sim-button extinction-summary__replay-confirm"
              type="button"
              onClick={() => {
                const replayTick = Number(selectedReplayTick);
                let error: string | null = null;
                if (replayTick === 0) onReplayWorld();
                else error = onReplayFromTick(replayTick);
                setReplayError(error);
              }}
            >
              Replay from tick
            </button>
            {replayError && <div className="sim-status--danger" role="status">{replayError}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ExtinctionSummary({
  onNewWorld,
  onReplayWorld,
  onReplayFromTick,
  checkpointTicks,
}: ExtinctionSummaryProps) {
  const worldState = useStore((state) => state.worldState);
  const tick = useStore((state) => state.tick);
  const dialogRef = useRef<HTMLDivElement>(null);
  const isComplete = Boolean(worldState && tick > 0 && !hasLivingCreatures(worldState));

  useEffect(() => {
    if (!isComplete) return;
    const app = document.querySelector('.app-shell');
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousAriaHidden = app?.getAttribute('aria-hidden') ?? null;
    app?.setAttribute('aria-hidden', 'true');
    app?.setAttribute('inert', '');
    dialogRef.current?.focus();

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), input:not([disabled]), [href]'
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trapFocus);
    return () => {
      document.removeEventListener('keydown', trapFocus);
      app?.removeAttribute('inert');
      if (previousAriaHidden === null) app?.removeAttribute('aria-hidden');
      else app?.setAttribute('aria-hidden', previousAriaHidden);
      previousFocus?.focus();
    };
  }, [isComplete]);

  if (!isComplete || !worldState) return null;
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

  return createPortal(
    <div ref={dialogRef} tabIndex={-1} style={{ ...overlayStyle, zIndex: 1000 }} role="dialog" aria-modal="true" aria-labelledby="extinction-title">
      <div style={cardStyle}>
        <div style={{ color: '#c49b83', fontSize: '0.75rem', letterSpacing: '0.15em' }}>
          SESSION COMPLETE
        </div>
        <h2 id="extinction-title" style={{ margin: '0.35rem 0 0.4rem', fontSize: '2rem' }}>
          Life has ended{summary.worldName ? ` in ${summary.worldName}` : ''}
        </h2>
        <p style={{ color: 'var(--sim-color-screen-ink-soft)', margin: '0 0 1.25rem' }}>
          The last creature is gone, but the world records what happened.
        </p>

        <WorldStoryPanel story={summary.story} headingId="extinction-world-story-heading" />
        <EcosystemPointsPanel points={summary.points} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
          {metrics.map(([label, value]) => (
            <div key={label} style={{ background: '#22262a', borderRadius: 7, padding: '0.7rem' }}>
              <div style={{ color: 'var(--sim-color-screen-ink-muted)', fontSize: '0.72rem' }}>{label}</div>
              <div style={{ fontSize: '1.2rem', marginTop: '0.15rem' }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '1.1rem', color: 'var(--sim-color-screen-ink-soft)' }}>
          The empty world still holds {Math.round(summary.remainingBiomass).toLocaleString()} units
          of producer biomass.
        </div>

        <PopulationHistoryChart world={worldState} tick={tick} />

        <h3 style={{ margin: '1.25rem 0 0.5rem', fontSize: '0.9rem' }}>Final events</h3>
        {summary.finalEvents.length === 0 ? (
          <div style={{ color: 'var(--sim-color-screen-ink-faint)' }}>No major events were recorded.</div>
        ) : (
          summary.finalEvents.map((event, index) => (
            <div
              key={`${event.tick}-${event.type}-${event.creatureId ?? event.speciesId ?? index}`}
              style={{ borderTop: '1px solid #303337', padding: '0.45rem 0', color: 'var(--sim-color-screen-ink-dim)' }}
            >
              <span style={{ color: 'var(--sim-color-screen-ink-faint)', marginRight: '0.6rem' }}>tick {event.tick}</span>
              {eventText(event)}
            </div>
          ))
        )}

        <ExtinctionActions
          onNewWorld={onNewWorld}
          onReplayWorld={onReplayWorld}
          onReplayFromTick={onReplayFromTick}
          checkpointTicks={checkpointTicks}
          endTick={tick}
        />
      </div>
    </div>,
    document.body
  );
}
