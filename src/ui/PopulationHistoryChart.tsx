import { useState } from 'react';
import type { WorldSnapshot } from '../state/store';
import {
  buildPopulationHistoryChart,
  type PopulationHistoryMode,
} from './populationHistoryModel';
import { buildPopulationHistoryAnnotations } from './populationHistoryAnnotations';

const WIDTH = 640;
const HEIGHT = 220;

export default function PopulationHistoryChart({ world, tick }: { world: WorldSnapshot; tick: number }) {
  const [mode, setMode] = useState<PopulationHistoryMode>('species');
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null);
  const chart = buildPopulationHistoryChart(world.history ?? [], world.creatures, tick, mode);
  const annotations = buildPopulationHistoryAnnotations(world.history ?? [], world.events, tick);
  const activeAnnotation = annotations.find((annotation) => annotation.id === selectedAnnotation) ?? annotations[0] ?? null;
  const firstTick = chart.ticks[0] ?? 0;
  const tickSpan = Math.max(1, (chart.ticks[chart.ticks.length - 1] ?? tick) - firstTick);
  const xForTick = (pointTick: number) => (pointTick - firstTick) / tickSpan * WIDTH;
  const stacks = chart.ticks.map(() => 0);
  const polygons = chart.series.map((series) => {
    const bottom = [...stacks];
    const top = series.populations.map((population, index) => {
      stacks[index] += population;
      return stacks[index];
    });
    const point = (value: number, index: number) => {
      const x = xForTick(chart.ticks[index] ?? firstTick);
      const y = HEIGHT - value / chart.maxPopulation * HEIGHT;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    };
    return [
      ...top.map(point),
      ...bottom.map(point).reverse(),
    ].join(' ');
  });

  return (
    <section aria-labelledby="population-history-title" style={{ marginTop: '1.2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
        <h3 id="population-history-title" style={{ margin: 0, fontSize: '0.9rem' }}>Population history</h3>
        <div role="group" aria-label="Population history grouping">
          {(['species', 'lineage'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => setMode(option)}
              style={{ border: '1px solid #555', background: mode === option ? '#d3b38c' : '#292d30', color: mode === option ? '#18130f' : '#ddd', padding: '0.25rem 0.45rem', textTransform: 'capitalize' }}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      <p style={{ color: '#888', fontSize: '0.68rem', margin: '0.3rem 0 0.45rem' }}>
        Stacked living populations from tick {chart.ticks[0]?.toLocaleString() ?? 0} to {tick.toLocaleString()}.
      </p>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Stacked ${mode} population history`} style={{ display: 'block', width: '100%', aspectRatio: `${WIDTH} / ${HEIGHT}`, background: '#101315', border: '1px solid #3b4144' }}>
        <line x1="0" y1={HEIGHT} x2={WIDTH} y2={HEIGHT} stroke="#667078" />
        {polygons.map((points, index) => (
          <polygon key={chart.series[index].id} points={points} fill={chart.series[index].color} opacity="0.82" />
        ))}
        {annotations.map((annotation) => {
          const x = xForTick(annotation.tick);
          const selected = activeAnnotation?.id === annotation.id;
          return (
            <g
              key={annotation.id}
              role="button"
              tabIndex={0}
              aria-label={`${annotation.title} at tick ${annotation.tick}`}
              onClick={() => setSelectedAnnotation(annotation.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') setSelectedAnnotation(annotation.id);
              }}
              style={{ cursor: 'pointer' }}
            >
              <line x1={x} y1="0" x2={x} y2={HEIGHT} stroke={annotation.tone === 'intervention' ? '#d7dce0' : '#f1d38a'} strokeDasharray="4 4" opacity={selected ? 1 : 0.65} />
              <circle cx={x} cy="12" r={selected ? 7 : 5} fill={annotation.tone === 'intervention' ? '#d7dce0' : '#f1d38a'} stroke="#111" />
            </g>
          );
        })}
      </svg>
      {activeAnnotation && (
        <div aria-live="polite" style={{ borderLeft: '3px solid #d3b38c', padding: '0.4rem 0.55rem', marginTop: '0.5rem', background: '#202427' }}>
          <strong style={{ fontSize: '0.72rem' }}>{activeAnnotation.title}</strong>
          <div style={{ color: '#8e999f', fontSize: '0.67rem', marginTop: '0.1rem' }}>
            Tick {activeAnnotation.tick.toLocaleString()} · {activeAnnotation.detail}
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))', gap: '0.25rem 0.6rem', marginTop: '0.5rem' }}>
        {chart.series.map((series) => (
          <div key={series.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#aaa', fontSize: '0.67rem' }}>
            <span aria-hidden="true" style={{ width: '0.65rem', height: '0.65rem', background: series.color, flex: '0 0 auto' }} />
            <span>{series.name} · peak {series.peak.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
