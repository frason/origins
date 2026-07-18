import { useState } from 'react';
import type { WorldSnapshot } from '../state/store';
import {
  buildPopulationHistoryChart,
  type PopulationHistoryMode,
} from './populationHistoryModel';

const WIDTH = 640;
const HEIGHT = 220;

export default function PopulationHistoryChart({ world, tick }: { world: WorldSnapshot; tick: number }) {
  const [mode, setMode] = useState<PopulationHistoryMode>('species');
  const chart = buildPopulationHistoryChart(world.history ?? [], world.creatures, tick, mode);
  const stacks = chart.ticks.map(() => 0);
  const polygons = chart.series.map((series) => {
    const bottom = [...stacks];
    const top = series.populations.map((population, index) => {
      stacks[index] += population;
      return stacks[index];
    });
    const point = (value: number, index: number) => {
      const x = chart.ticks.length <= 1 ? 0 : index / (chart.ticks.length - 1) * WIDTH;
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
      </svg>
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
