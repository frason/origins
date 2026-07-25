import { useCallback, useMemo, useState } from 'react';
import fixture from './fixtures/default-world-t100.json';
import PrototypeMap from './PrototypeMap';
import ThreeWorldView from './ThreeWorldView';
import {
  cellAt,
  notableEvent,
  type PrototypeDirection,
  type SelectedLocation,
} from './worldViewModel';
import type { PrototypeWorldSnapshot } from './worldSnapshot';

const snapshot = fixture as PrototypeWorldSnapshot;

export default function WorldViewSpike() {
  const [direction, setDirection] = useState<PrototypeDirection>('isometric');
  const [selected, setSelected] = useState<SelectedLocation>({ x: 50, y: 50 });
  const [focusNonce, setFocusNonce] = useState(0);
  const [eventOpen, setEventOpen] = useState(false);
  const [metrics, setMetrics] = useState<Partial<Record<
    PrototypeDirection,
    { buildMs: number; drawCalls: number; triangles: number }
  >>>({});
  const select = useCallback((location: SelectedLocation) => setSelected(location), []);
  const reportMetrics = useCallback((
    measuredDirection: PrototypeDirection,
    measured: { buildMs: number; drawCalls: number; triangles: number },
  ) => {
    setMetrics((current) => ({ ...current, [measuredDirection]: measured }));
  }, []);
  const cell = useMemo(() => cellAt(snapshot, selected), [selected]);
  const event = notableEvent(snapshot);
  const occupants = snapshot.creatures.filter(
    (creature) => creature.x === selected.x && creature.y === selected.y,
  );

  return (
    <main className="world-spike">
      <header className="world-spike__header">
        <div>
          <p className="world-spike__eyebrow">Disposable visual spike · Issue #149</p>
          <h1 className="world-spike__title">Origins world-view comparison</h1>
          <p className="world-spike__meta">
            Frozen seed {snapshot.source.seed} · tick {snapshot.source.tick} · {snapshot.world.width}×{snapshot.world.height}
          </p>
        </div>
        <a className="world-spike__back" href="/">Return to live game</a>
      </header>

      <nav className="world-spike__tabs" aria-label="Prototype direction">
        <button
          className={`world-spike__tab${direction === 'isometric' ? ' world-spike__tab--active' : ''}`}
          type="button"
          aria-pressed={direction === 'isometric'}
          onClick={() => setDirection('isometric')}
        >
          A · Isometric tile world
        </button>
        <button
          className={`world-spike__tab${direction === 'globe' ? ' world-spike__tab--active' : ''}`}
          type="button"
          aria-pressed={direction === 'globe'}
          onClick={() => setDirection('globe')}
        >
          B · Full globe
        </button>
      </nav>

      <section className="world-spike__workspace">
        <div className="world-spike__stage">
          <ThreeWorldView
            direction={direction}
            snapshot={snapshot}
            selected={selected}
            onSelect={select}
            onMetrics={reportMetrics}
            focusNonce={focusNonce}
          />
          <div className="world-spike__stage-label">
            <strong>{direction === 'isometric' ? 'Isometric tile world' : 'Full globe'}</strong>
            <span>Drag to orbit · wheel/pinch to zoom · click geometry to select</span>
          </div>
        </div>

        <aside className="world-spike__sidebar" aria-label="Prototype navigation and inspection">
          <section className="world-spike__panel">
            <h2 className="world-spike__panel-title">2D navigation reference</h2>
            <PrototypeMap snapshot={snapshot} selected={selected} onSelect={select} />
            <ul className="world-spike__legend" aria-label="Ecology layer legend">
              <li><span className="world-spike__swatch world-spike__swatch--biomass" />Biomass brightens terrain</li>
              <li><span className="world-spike__swatch world-spike__swatch--toxicity" />Toxicity overlay</li>
              <li><span className="world-spike__swatch world-spike__swatch--corpse" />Corpses</li>
            </ul>
          </section>

          <section className="world-spike__panel" aria-live="polite">
            <h2 className="world-spike__panel-title">Tile {selected.x}, {selected.y}</h2>
            <dl className="world-spike__facts">
              <div><dt>Biome</dt><dd>{cell?.biome ?? '—'}</dd></div>
              <div><dt>Elevation</dt><dd>{cell?.elevation.toFixed(2) ?? '—'}</dd></div>
              <div><dt>Biomass</dt><dd>{cell?.producerBiomass.toFixed(1) ?? '—'}</dd></div>
              <div><dt>Toxicity</dt><dd>{cell?.toxicity.toFixed(2) ?? '—'}</dd></div>
              <div><dt>Organisms</dt><dd>{occupants.length}</dd></div>
            </dl>
            {occupants.length > 0 && (
              <ul className="world-spike__occupants">
                {occupants.map((occupant) => (
                  <li key={occupant.id}>{occupant.speciesId} · {occupant.lifecycleState}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="world-spike__panel">
            <h2 className="world-spike__panel-title">Notable event</h2>
            <p className="world-spike__event">
              Tick {event?.tick ?? '—'} · {event?.type ?? 'No event'}
            </p>
            {event?.detail && <p className="world-spike__event-detail">{event.detail}</p>}
            <button
              className="world-spike__action"
              type="button"
              onClick={() => {
                setEventOpen(true);
                setFocusNonce((value) => value + 1);
              }}
            >
              Focus event context
            </button>
            {eventOpen && (
              <p className="world-spike__limitation">
                This frozen event has no source coordinates. The prototype preserves the selected tile instead of inventing a location.
              </p>
            )}
          </section>

          <section className="world-spike__panel world-spike__panel--warning">
            <h2 className="world-spike__panel-title">Direction limitation</h2>
            <p>
              {direction === 'isometric'
                ? 'Dense terrain remains legible, but a full-world view makes organisms tiny and demands semantic zoom.'
                : 'The far side is hidden, polar rows compress, and tile picking becomes less precise near the poles.'}
            </p>
          </section>

          <section className="world-spike__panel">
            <h2 className="world-spike__panel-title">Prototype render cost</h2>
            {metrics[direction] ? (
              <dl className="world-spike__facts">
                <div><dt>Scene build</dt><dd>{metrics[direction]?.buildMs.toFixed(0)} ms</dd></div>
                <div><dt>Draw calls</dt><dd>{metrics[direction]?.drawCalls}</dd></div>
                <div><dt>Triangles</dt><dd>{metrics[direction]?.triangles.toLocaleString()}</dd></div>
              </dl>
            ) : <p>Measuring first frame…</p>}
          </section>
        </aside>
      </section>
    </main>
  );
}
