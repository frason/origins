/**
 * ControlPanel — simulation transport controls.
 * Play/pause, speed (ticks per second), tick counter, and God Mode constants editor.
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

const sliderContainerStyle: CSSProperties = {
  marginBottom: '0.6rem',
  padding: '0.5rem 0',
};

const sliderLabelStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '0.3rem',
  fontSize: '0.8rem',
};

const valueStyle: CSSProperties = {
  color: '#aaa',
  fontWeight: 500,
};

const sliderInputStyle: CSSProperties = {
  width: '100%',
};

/**
 * God Mode slider configuration: label, key in SimulationConstants,
 * min, max, step, and optional formatter for display
 */
interface SliderConfig {
  label: string;
  key: keyof SimulationConstants;
  min: number;
  max: number;
  step: number;
  formatter?: (value: number) => string;
}

const GOD_MODE_SLIDERS: SliderConfig[] = [
  {
    label: 'Base Solar Energy',
    key: 'baseSolarEnergy',
    min: 1,
    max: 50,
    step: 1,
  },
  {
    label: 'Solar Edge Falloff Factor',
    key: 'solarEdgeFalloffFactor',
    min: 0.0,
    max: 1.0,
    step: 0.05,
    formatter: (v) => v.toFixed(2),
  },
  {
    label: 'Producer Growth Rate',
    key: 'producerGrowthRate',
    min: 0.01,
    max: 0.5,
    step: 0.01,
    formatter: (v) => v.toFixed(3),
  },
  {
    label: 'Base Metabolism',
    key: 'baseMetabolism',
    min: 0.5,
    max: 10,
    step: 0.5,
    formatter: (v) => v.toFixed(1),
  },
  {
    label: 'Feeding Efficiency',
    key: 'feedingEfficiency',
    min: 0.1,
    max: 1.0,
    step: 0.05,
    formatter: (v) => v.toFixed(2),
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
    formatter: (v) => v.toFixed(3),
  },
  {
    label: 'Default Mutation Rate',
    key: 'defaultMutationRate',
    min: 0.01,
    max: 0.2,
    step: 0.01,
    formatter: (v) => v.toFixed(3),
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

  const handleConstantChange = (key: keyof SimulationConstants, value: number) => {
    updateConstants({ [key]: value });
  };

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

      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
        <span style={{ color: '#999', whiteSpace: 'nowrap' }}>Speed {speed}×</span>
        <input
          type="range"
          min={1}
          max={10}
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
          textAlign: 'left',
        }}
        onClick={() => setShowGodMode(!showGodMode)}
      >
        {showGodMode ? '▼ God Mode' : '▶ God Mode'}
      </button>

      {showGodMode && (
        <div style={godModeStyle}>
          {GOD_MODE_SLIDERS.map((config) => {
            const currentValue = constants[config.key] as number;
            const displayValue = config.formatter
              ? config.formatter(currentValue)
              : Math.round(currentValue * 100) / 100;

            return (
              <div key={config.key} style={sliderContainerStyle}>
                <div style={sliderLabelStyle}>
                  <span>{config.label}</span>
                  <span style={valueStyle}>{displayValue}</span>
                </div>
                <input
                  type="range"
                  min={config.min}
                  max={config.max}
                  step={config.step}
                  value={currentValue}
                  onChange={(e) => handleConstantChange(config.key, Number(e.target.value))}
                  style={sliderInputStyle}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
