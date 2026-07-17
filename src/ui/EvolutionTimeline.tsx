import { useStore } from '../state/store';
import { buildEvolutionTimeline } from './evolutionTimelineModel';

export default function EvolutionTimeline() {
  const world = useStore((state) => state.worldState);
  const tick = useStore((state) => state.tick);
  const model = buildEvolutionTimeline(world?.history, world, tick);
  if (!model) return null;

  return (
    <details open style={{ border: '1px solid #384348', borderRadius: 7, padding: '0.55rem', marginBottom: '0.7rem' }}>
      <summary style={{ cursor: 'pointer', color: '#b8ccd4', fontWeight: 600 }}>
        Evolution over time
      </summary>
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-labelledby="evolution-chart-title evolution-chart-description"
        style={{ display: 'block', width: '100%', height: 'clamp(90px, 20vw, 145px)', marginTop: '0.4rem', background: '#191d1f', borderRadius: 5 }}
      >
        <title id="evolution-chart-title">Population and diversity timeline</title>
        <desc id="evolution-chart-description">{model.description}</desc>
        <line x1="0" y1="92" x2="100" y2="92" stroke="#41484b" strokeWidth="0.7" />
        <polyline points={model.populationPolyline} fill="none" stroke="#79c98a" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
        <polyline points={model.speciesPolyline} fill="none" stroke="#d5b96f" strokeWidth="1.3" vectorEffect="non-scaling-stroke" />
        <polyline points={model.lineagePolyline} fill="none" stroke="#ad91d5" strokeWidth="1.3" vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', marginTop: '0.35rem', color: '#899398', fontSize: '0.65rem' }}>
        <span style={{ color: '#79c98a' }}>— Population</span>
        <span style={{ color: '#d5b96f' }}>— Species</span>
        <span style={{ color: '#ad91d5' }}>— Lineages</span>
      </div>
      <div style={{ color: '#7f898d', fontSize: '0.66rem', lineHeight: 1.4, marginTop: '0.3rem' }}>
        Peak {model.peakPopulation} · {model.dominanceChanges} dominance {model.dominanceChanges === 1 ? 'shift' : 'shifts'} ·{' '}
        {model.currentDominantName ? `${model.currentDominantName} leads now` : 'no living leader'}
      </div>
    </details>
  );
}
