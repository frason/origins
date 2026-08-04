import type { CSSProperties } from 'react';
import { useStore } from '../state/store';
import { getEcosystemPressures, type PressureTone } from './ecosystemPressures';

const colors: Record<PressureTone, string> = {
  critical: 'var(--sim-color-screen-danger)',
  warning: '#e1b66d',
  watch: '#9fc3d0',
  calm: 'var(--sim-color-screen-positive-soft)',
};

/**
 * Carries its own dark surface, matching EventTimeline. The text tones below
 * are "screen" colours, so without this the panel renders light-on-light
 * against the beige settings panel.
 */
const panelStyle: CSSProperties = {
  backgroundColor: 'var(--sim-color-screen)',
  borderRadius: 8,
  padding: '0.75rem 1rem',
  color: 'var(--sim-color-screen-ink)',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '0.8rem',
};

export default function EcosystemPressurePanel() {
  const world = useStore((state) => state.worldState);
  const tick = useStore((state) => state.tick);
  const constants = useStore((state) => state.constants);
  const pressures = getEcosystemPressures(world, tick, world?.constants ?? constants);
  if (pressures.length === 0) return null;

  return (
    <section aria-labelledby="pressure-title" style={panelStyle}>
      <div id="pressure-title" style={{ fontWeight: 600, color: '#c8d2d6', marginBottom: '0.3rem' }}>
        What is shaping the ecosystem?
      </div>
      {pressures.map((pressure) => (
        <div key={pressure.id} style={{ margin: '0.35rem 0' }}>
          <div style={{ color: colors[pressure.tone], fontSize: '0.72rem', fontWeight: 600 }}>
            {pressure.title}
          </div>
          <div style={{ color: '#878f93', fontSize: '0.66rem', lineHeight: 1.35 }}>
            {pressure.evidence}
          </div>
        </div>
      ))}
      <div style={{ color: '#626b70', fontSize: '0.61rem', lineHeight: 1.35, marginTop: '0.4rem' }}>
        These are measured contributors, not proof of a single cause.
      </div>
    </section>
  );
}
