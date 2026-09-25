/**
 * SpeciesCompositionChart — Display proportional breakdown of living population by diet strategy.
 *
 * Uses a stacked bar chart to show the relative abundance of each energy strategy,
 * with colours matching the map legend for consistency.
 */

import { useMemo } from 'react';
import type { CreatureSnapshot } from '../state/store';
import type { EnergyStrategy } from '../utils/traits';
import { strategyColor, rgbToCss, STRATEGY_LEGEND } from './creatureColor';

interface SpeciesCompositionChartProps {
  creatures: CreatureSnapshot[];
}

export default function SpeciesCompositionChart({ creatures }: SpeciesCompositionChartProps) {
  const composition = useMemo(() => {
    const strategies: Record<EnergyStrategy, number> = {
      herbivore: 0,
      carnivore: 0,
      omnivore: 0,
      scavenger: 0,
    };

    // Count alive creatures by strategy
    for (const creature of creatures) {
      if (creature.lifecycleState === 'alive') {
        strategies[creature.traits.energyStrategy]++;
      }
    }

    const total = Object.values(strategies).reduce((sum, count) => sum + count, 0);
    if (total === 0) {
      return {
        strategies,
        total,
        percentages: strategies,
      };
    }

    // Calculate percentages
    const percentages: Record<EnergyStrategy, number> = {
      herbivore: (strategies.herbivore / total) * 100,
      carnivore: (strategies.carnivore / total) * 100,
      omnivore: (strategies.omnivore / total) * 100,
      scavenger: (strategies.scavenger / total) * 100,
    };

    return { strategies, total, percentages };
  }, [creatures]);

  const barStyle: React.CSSProperties = {
    display: 'flex',
    width: '100%',
    height: 20,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    marginBottom: '0.5rem',
  };

  const segmentStyle = (percentage: number): React.CSSProperties => ({
    flex: `${percentage} 0 auto`,
    height: '100%',
    transition: 'flex 0.2s ease-out',
  });

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.75rem',
    color: 'var(--sim-color-screen-ink-muted)',
    marginBottom: '0.25rem',
  };

  const legendItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    marginRight: '0.75rem',
    fontSize: '0.75rem',
  };

  const colorBoxStyle: React.CSSProperties = {
    width: 12,
    height: 12,
    borderRadius: 2,
  };

  if (composition.total === 0) {
    return (
      <div style={{ padding: '0.5rem 0' }}>
        <div style={labelStyle}>
          <span>Population by diet</span>
          <span style={{ fontWeight: 600 }}>—</span>
        </div>
        <div style={{ color: 'var(--sim-color-screen-ink-muted)', fontSize: '0.75rem' }}>
          No living creatures
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0.5rem 0' }}>
      <div style={labelStyle}>
        <span>Population by diet</span>
        <span style={{ fontWeight: 600 }}>{composition.total}</span>
      </div>

      {/* Stacked bar chart */}
      <div style={barStyle}>
        {STRATEGY_LEGEND.map(({ strategy }) => {
          const percentage = composition.percentages[strategy];
          if (percentage === 0) return null;
          return (
            <div
              key={strategy}
              style={{
                ...segmentStyle(percentage),
                backgroundColor: rgbToCss(strategyColor(strategy)),
              }}
              title={`${strategy}: ${composition.strategies[strategy]} (${percentage.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      {/* Legend below the bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.35rem' }}>
        {STRATEGY_LEGEND.map(({ strategy, label }) => {
          const count = composition.strategies[strategy];
          const percentage = composition.percentages[strategy];
          if (count === 0) return null;
          return (
            <div key={strategy} style={legendItemStyle}>
              <div
                style={{
                  ...colorBoxStyle,
                  backgroundColor: rgbToCss(strategyColor(strategy)),
                }}
              />
              <span title={label}>
                {label}:{' '}
                <span style={{ fontWeight: 600 }}>
                  {count} ({percentage.toFixed(1)}%)
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
