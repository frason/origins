import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { getEcosystemTrajectories } from './ecosystemTrajectory';
import { buildEvolutionTimeline } from './evolutionTimelineModel';
import {
  buildReplacementTrend,
  formatReplacementRatio,
  getReplacementMetrics,
} from './replacementMetrics';
import { selectTurningPoint } from './turningPointModel';

interface EvolutionRibbonProps {
  onOpenLineages: () => void;
  legendOpen?: boolean;
  onToggleLegend?: () => void;
}

/** Colour replacement by whether the population is holding its own. */
function replacementTone(ratio: number | null): 'neutral' | 'positive' | 'warning' {
  if (ratio === null) return 'neutral';
  if (ratio >= 1) return 'positive';
  return 'warning';
}

export default function EvolutionRibbon({ onOpenLineages, legendOpen = false, onToggleLegend }: EvolutionRibbonProps) {
  const world = useStore((state) => state.worldState);
  const tick = useStore((state) => state.tick);
  const [expanded, setExpanded] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!expanded) return;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      triggerRef.current?.focus();
    };
  }, [expanded]);

  const model = buildEvolutionTimeline(world?.history, world, tick);
  if (!model) return null;

  const turningPoint = selectTurningPoint(getEcosystemTrajectories(world, tick));
  const lastPoint = model.points[model.points.length - 1];
  const replacement = getReplacementMetrics(world?.events ?? [], tick);
  const replacementTrend = buildReplacementTrend(world?.events ?? [], tick);

  return (
    <section className="evolution-ribbon sim-panel" aria-labelledby="evolution-ribbon-heading">
      <button
        type="button"
        ref={triggerRef}
        className="evolution-ribbon__summary"
        aria-expanded={expanded}
        aria-controls="evolution-history-panel"
        onClick={() => setExpanded(true)}
      >
        <span className="evolution-ribbon__label" id="evolution-ribbon-heading">Evolution over time</span>
        <span className="evolution-ribbon__charts">
          <span className="evolution-ribbon__chart">
            <svg className="evolution-ribbon__sparkline" viewBox="0 0 100 100" aria-hidden="true">
              <polyline className="evolution-ribbon__line evolution-ribbon__line--population" points={model.populationPolyline} />
              <polyline className="evolution-ribbon__line evolution-ribbon__line--species" points={model.speciesPolyline} />
            </svg>
            <span className="evolution-ribbon__chart-caption">Population / species</span>
          </span>
          <span className="evolution-ribbon__chart">
            <svg className="evolution-ribbon__sparkline" viewBox="0 0 100 100" aria-hidden="true">
              <line
                className="evolution-ribbon__reference"
                x1="0"
                y1={replacementTrend.referenceY}
                x2="100"
                y2={replacementTrend.referenceY}
              />
              {replacementTrend.segments.map((segment, index) => (
                <polyline
                  key={`${segment}:${index}`}
                  className="evolution-ribbon__line evolution-ribbon__line--replacement"
                  points={segment}
                />
              ))}
            </svg>
            <span className="evolution-ribbon__chart-caption">Live replacement</span>
          </span>
        </span>
        <span className="evolution-ribbon__stats">
          <span className="evolution-ribbon__stat">
            <span className="evolution-ribbon__stat-label">Population</span>
            <span className="evolution-ribbon__stat-value sim-data">
              {(lastPoint?.population ?? 0).toLocaleString()}
            </span>
          </span>
          <span className="evolution-ribbon__stat">
            <span className="evolution-ribbon__stat-label">Species</span>
            <span className="evolution-ribbon__stat-value sim-data">
              {(lastPoint?.speciesCount ?? 0).toLocaleString()}
            </span>
          </span>
          <span className="evolution-ribbon__stat">
            <span className="evolution-ribbon__stat-label">Replacement</span>
            <span
              className={`evolution-ribbon__stat-value sim-data evolution-ribbon__stat-value--${replacementTone(replacement.ecosystem.ratio)}`}
            >
              {formatReplacementRatio(replacement.ecosystem)}
            </span>
          </span>
          <span className="evolution-ribbon__stat">
            <span className="evolution-ribbon__stat-label">Tick</span>
            <span className="evolution-ribbon__stat-value sim-data">{tick.toLocaleString()}</span>
          </span>
        </span>
        <span className="evolution-ribbon__action">Expand</span>
      </button>
      {onToggleLegend && (
        <button
          type="button"
          className="evolution-ribbon__map-key"
          aria-expanded={legendOpen}
          onClick={onToggleLegend}
        >
          Map key
        </button>
      )}

      {expanded && (
        <aside
          className="evolution-history sim-window"
          id="evolution-history-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="evolution-history-title"
        >
          <header className="evolution-history__header sim-window__title-bar">
            <h2 className="sim-window__title" id="evolution-history-title">Evolution over time</h2>
            <button ref={closeButtonRef} type="button" className="sim-button sim-button--compact" onClick={() => setExpanded(false)}>
              Close
            </button>
          </header>
          <div className="evolution-history__body">
            <svg
              className="evolution-history__chart sim-panel sim-panel--sunken"
              viewBox="0 0 100 100"
              role="img"
              aria-labelledby="evolution-history-chart-title evolution-history-chart-description"
            >
              <title id="evolution-history-chart-title">Population, species, and lineage history</title>
              <desc id="evolution-history-chart-description">{model.description}</desc>
              <line className="evolution-history__axis" x1="0" y1="92" x2="100" y2="92" />
              <polyline className="evolution-ribbon__line evolution-ribbon__line--population" points={model.populationPolyline} />
              <polyline className="evolution-ribbon__line evolution-ribbon__line--species" points={model.speciesPolyline} />
              <polyline className="evolution-ribbon__line evolution-ribbon__line--lineage" points={model.lineagePolyline} />
              {model.dominanceMoments.map((moment) => (
                <g key={`${moment.tick}:${moment.speciesId}`}>
                  <line className="evolution-history__moment-line" x1={moment.x} y1="8" x2={moment.x} y2="92" />
                  <circle className="evolution-history__moment-dot" cx={moment.x} cy="8" r="1.8">
                    <title>{`${moment.speciesName} became dominant at tick ${moment.tick}`}</title>
                  </circle>
                </g>
              ))}
            </svg>
            <div className="evolution-history__legend" aria-hidden="true">
              <span className="evolution-history__legend-item evolution-history__legend-item--population">Population</span>
              <span className="evolution-history__legend-item evolution-history__legend-item--species">Species</span>
              <span className="evolution-history__legend-item evolution-history__legend-item--lineage">Lineages</span>
            </div>
            <p className="evolution-history__summary sim-data">
              Peak {model.peakPopulation} · {model.dominanceChanges} dominance {model.dominanceChanges === 1 ? 'shift' : 'shifts'} ·{' '}
              {model.currentDominantName ? `${model.currentDominantName} leads now` : 'no living leader'}
            </p>
            <section className="replacement-history" aria-labelledby="replacement-history-title">
              <div className="replacement-history__header">
                <h3 className="replacement-history__title" id="replacement-history-title">Live replacement</h3>
                <span className="replacement-history__value sim-data">
                  {formatReplacementRatio(replacement.ecosystem, true)}
                </span>
              </div>
              <svg
                className="replacement-history__chart sim-panel sim-panel--sunken"
                viewBox="0 0 100 100"
                role="img"
                aria-labelledby="replacement-chart-title replacement-chart-description"
              >
                <title id="replacement-chart-title">Birth-to-death replacement history</title>
                <desc id="replacement-chart-description">{replacementTrend.description}</desc>
                <line className="replacement-history__axis" x1="0" y1="92" x2="100" y2="92" />
                <line
                  className="replacement-history__reference"
                  x1="0"
                  y1={replacementTrend.referenceY}
                  x2="100"
                  y2={replacementTrend.referenceY}
                />
                {replacementTrend.segments.map((segment, index) => (
                  <polyline
                    key={`${segment}:${index}`}
                    className="replacement-history__line"
                    points={segment}
                  />
                ))}
              </svg>
              <div className="replacement-history__legend">
                <span className="replacement-history__legend-series">Replacement ratio</span>
                <span className="replacement-history__legend-reference">1.00× replacement level</span>
                <span>{replacementTrend.windowTicks}-tick rolling window</span>
              </div>
            </section>
            {turningPoint && (
              <article className={`evolution-story evolution-story--${turningPoint.tone}`}>
                <p className="evolution-story__eyebrow">{turningPoint.dimension} turning point · tick {tick.toLocaleString()}</p>
                <h3 className="evolution-story__title">{turningPoint.title}</h3>
                <p className="evolution-story__detail">{turningPoint.detail}</p>
                <button type="button" className="sim-button" onClick={onOpenLineages}>Open life and lineages</button>
              </article>
            )}
          </div>
        </aside>
      )}
    </section>
  );
}
