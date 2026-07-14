/**
 * ControlPanel — simulation transport controls.
 * Play/pause, speed (ticks per second), tick counter, and reset.
 */

import { CSSProperties } from 'react';
import { useStore } from '../state/store';

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

export default function ControlPanel({ onReset }: ControlPanelProps) {
  const tick = useStore((s) => s.tick);
  const isRunning = useStore((s) => s.isRunning);
  const speed = useStore((s) => s.speed);
  const setRunning = useStore((s) => s.setRunning);
  const setSpeed = useStore((s) => s.setSpeed);

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
    </div>
  );
}
