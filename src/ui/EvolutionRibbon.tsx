import { useState } from 'react';
import { useStore } from '../state/store';
import { getEcosystemTrajectories } from './ecosystemTrajectory';
import { buildEvolutionTimeline } from './evolutionTimelineModel';
import { selectTurningPoint } from './turningPointModel';

interface EvolutionRibbonProps {
  onOpenLineages: () => void;
}

export default function EvolutionRibbon({ onOpenLineages }: EvolutionRibbonProps) {
  const world = useStore((state) => state.worldState);
  const tick = useStore((state) => state.tick);
  const [expanded, setExpanded] = useState(false);
  const model = buildEvolutionTimeline(world?.history, world, tick);
  if (!model) return null;

  const turningPoint = selectTurningPoint(getEcosystemTrajectories(world, tick));
  const lastPoint = model.points[model.points.length - 1];

  return (
    <section className="evolution-ribbon sim-panel" aria-labelledby="evolution-ribbon-heading">
      <button
        type="button"
        className="evolution-ribbon__summary"
        aria-expanded={expanded}
        aria-controls="evolution-history-panel"
        onClick={() => setExpanded(true)}
      >
        <span className="evolution-ribbon__label" id="evolution-ribbon-heading">Evolution over time</span>
        <svg className="evolution-ribbon__sparkline" viewBox="0 0 100 100" aria-hidden="true">
          <polyline className="evolution-ribbon__line evolution-ribbon__line--population" points={model.populationPolyline} />
          <polyline className="evolution-ribbon__line evolution-ribbon__line--species" points={model.speciesPolyline} />
        </svg>
        <span className="evolution-ribbon__metric sim-data">
          Pop. {lastPoint?.population ?? 0} · Species {lastPoint?.speciesCount ?? 0} · Lineages {lastPoint?.lineageCount ?? 0}
        </span>
        <span className="evolution-ribbon__action">Expand</span>
      </button>

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
            <button type="button" className="sim-button sim-button--compact" onClick={() => setExpanded(false)}>
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
