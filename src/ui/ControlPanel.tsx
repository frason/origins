/**
 * ControlPanel — simulation transport controls.
 * Play/pause, speed (ticks per second), tick counter, reset, and God Mode.
 */

import { CSSProperties, useState } from 'react';
import { useStore } from '../state/store';
import { SimulationConstants } from '../utils/constants';

interface ControlPanelProps {
  onReset?: () => void;
}

const panelStyle: CSSProperties = {
  backgroundColor: '#222',
  borderRadius: 8,
  padding: '0.75rem 1rem',
  color: '#eee',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '0.85rem',
};

const buttonStyle: CSSProperties = {
  padding: '0.4rem 1rem',
  borderRadius: 6,
  border: '1px solid #555',
  backgroundColor: '#333',
  color: '#eee',
  cursor: 'pointer',
  fontSize: '0.85rem',
};

const godModeStyle: CSSProperties = {
  backgroundColor: '#1a1a1a',
  borderRadius: 6,
  padding: '0.75rem',
  marginTop: '0.75rem',
  border: '1px solid #444',
};

interface SliderConfig {
  label: string;
  key: keyof SimulationConstants;
  min: number;
  max: number;
  step: number;
  formatter?: (value: number) => string;
}

const GOD_MODE_SLIDERS: SliderConfig[] = [
  { label: 'Base Solar Energy', key: 'baseSolarEnergy', min: 1, max: 50, step: 1 },
  {
    label: 'Solar Edge Falloff Factor',
    key: 'solarEdgeFalloffFactor',
    min: 0,
    max: 1,
    step: 0.05,
    formatter: (value) => value.toFixed(2),
  },
  {
    label: 'Solar Falloff Curve',
    key: 'solarFalloffExponent',
    min: 0.25,
    max: 4,
    step: 0.25,
    formatter: (value) => value.toFixed(2),
  },
  {
    label: 'Producer Growth Rate',
    key: 'producerGrowthRate',
    min: 0.01,
    max: 0.5,
    step: 0.01,
    formatter: (value) => value.toFixed(3),
  },
  {
    label: 'Base Metabolism',
    key: 'baseMetabolism',
    min: 0.5,
    max: 10,
    step: 0.5,
    formatter: (value) => value.toFixed(1),
  },
  {
    label: 'Feeding Efficiency',
    key: 'feedingEfficiency',
    min: 0.1,
    max: 1,
    step: 0.05,
    formatter: (value) => value.toFixed(2),
  },
  {
    label: 'Reproduction Energy Threshold',
    key: 'reproductionEnergyThreshold',
    min: 50,
    max: 500,
    step: 10,
  },
  {
    label: 'Reproduction Energy Cost',
    key: 'reproductionEnergyCost',
    min: 25,
    max: 300,
    step: 5,
  },
  {
    label: 'Max Creature Age Ticks',
    key: 'maxCreatureAgeTicks',
    min: 100,
    max: 2000,
    step: 50,
  },
  {
    label: 'Corpse Decay Rate',
    key: 'corpseDecayRate',
    min: 0.01,
    max: 0.5,
    step: 0.01,
    formatter: (value) => value.toFixed(3),
  },
  {
    label: 'Corpse Duration Ticks',
    key: 'corpseDecayDurationTicks',
    min: 5,
    max: 200,
    step: 5,
  },
  {
    label: 'Corpse Toxicity',
    key: 'corpseToxicityPerTick',
    min: 0,
    max: 5,
    step: 0.1,
    formatter: (value) => value.toFixed(1),
  },
  {
    label: 'Toxicity Radius',
    key: 'corpseToxicityRadius',
    min: 0,
    max: 10,
    step: 1,
  },
  {
    label: 'Toxicity Retention',
    key: 'toxicityRetention',
    min: 0,
    max: 1,
    step: 0.05,
    formatter: (value) => value.toFixed(2),
  },
  {
    label: 'Scavenging Rate',
    key: 'scavengingRate',
    min: 0.05,
    max: 1,
    step: 0.05,
    formatter: (value) => value.toFixed(2),
  },
  {
    label: 'Default Mutation Rate',
    key: 'defaultMutationRate',
    min: 0.01,
    max: 0.2,
    step: 0.01,
    formatter: (value) => value.toFixed(3),
  },
  {
    label: 'Mutation Drift',
    key: 'mutationDrift',
    min: 0,
    max: 0.5,
    step: 0.01,
    formatter: (value) => value.toFixed(2),
  },
  {
    label: 'Monoculture Threshold',
    key: 'monocultureDominanceThreshold',
    min: 0.5,
    max: 1,
    step: 0.05,
    formatter: (value) => value.toFixed(2),
  },
  {
    label: 'Monoculture Mortality',
    key: 'monocultureMortalityPenalty',
    min: 0,
    max: 0.5,
    step: 0.01,
    formatter: (value) => value.toFixed(2),
  },
  {
    label: 'Monoculture Reproduction Limit',
    key: 'monocultureReproductionLimit',
    min: 1,
    max: 500,
    step: 5,
  },
  {
    label: 'Population Capacity',
    key: 'maxGlobalPopulation',
    min: 50,
    max: 2000,
    step: 50,
  },
  {
    label: 'Overcrowding Mortality',
    key: 'overcrowdingMortalityRate',
    min: 0,
    max: 0.5,
    step: 0.01,
    formatter: (value) => value.toFixed(2),
  },
];

export default function ControlPanel({ onReset }: ControlPanelProps) {
  const tick = useStore((s) => s.tick);
  const isRunning = useStore((s) => s.isRunning);
  const speed = useStore((s) => s.speed);
  const constants = useStore((s) => s.constants);
  const setRunning = useStore((s) => s.setRunning);
  const setSpeed = useStore((s) => s.setSpeed);
  const updateConstants = useStore((s) => s.updateConstants);
  const [showGodMode, setShowGodMode] = useState(false);

  return (
    <div style={panelStyle}>
      <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Simulation</div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.6rem' }}>
        <button
          style={{ ...buttonStyle, backgroundColor: isRunning ? '#7a2d2d' : '#2d7a3a' }}
          onClick={() => setRunning(!isRunning)}
        >
          {isRunning ? '⏸ Pause' : '▶ Play'}
        </button>
        {onReset && (
          <button style={buttonStyle} onClick={onReset}>
            ↺ Reset
          </button>
        )}
        <span style={{ marginLeft: 'auto', color: '#999' }}>tick {tick}</span>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ color: '#999', whiteSpace: 'nowrap' }}>Speed {speed}×</span>
        <input
          type="range"
          min={1}
          max={20}
          step={1}
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          style={{ flex: 1 }}
        />
      </label>

      <button
        style={{
          ...buttonStyle,
          backgroundColor: showGodMode ? '#4a3a2a' : '#333',
          width: '100%',
          marginTop: '0.75rem',
          textAlign: 'left',
        }}
        onClick={() => setShowGodMode((visible) => !visible)}
      >
        {showGodMode ? '▼ God Mode' : '▶ God Mode'}
      </button>

      {showGodMode && (
        <div style={godModeStyle}>
          <div style={{ color: '#888', fontSize: '0.75rem', marginBottom: '0.75rem' }}>
            Changes apply on the next tick.
          </div>
          {GOD_MODE_SLIDERS.map((config) => {
            const value = constants[config.key];
            const displayValue = config.formatter
              ? config.formatter(value)
              : Math.round(value * 100) / 100;

            return (
              <label
                key={config.key}
                style={{ display: 'block', marginBottom: '0.75rem' }}
              >
                <span
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '0.3rem',
                    fontSize: '0.8rem',
                  }}
                >
                  <span>{config.label}</span>
                  <span style={{ color: '#aaa', fontWeight: 500 }}>{displayValue}</span>
                </span>
                <input
                  type="range"
                  min={config.min}
                  max={config.max}
                  step={config.step}
                  value={value}
                  onChange={(event) =>
                    updateConstants({ [config.key]: Number(event.target.value) })
                  }
                  style={{ width: '100%' }}
                />
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
