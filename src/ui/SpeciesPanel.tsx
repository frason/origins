/**
 * SpeciesPanel — living population grouped by species.
 * Lineage tree view comes later (LineageTree integration).
 */

import { CSSProperties } from 'react';
import { useStore } from '../state/store';

const panelStyle: CSSProperties = {
  backgroundColor: '#222',
  borderRadius: 8,
  padding: '0.75rem 1rem',
  color: '#eee',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '0.85rem',
};

export default function SpeciesPanel() {
  const worldState = useStore((s) => s.worldState);

  const counts = new Map<string, number>();
  if (worldState) {
    for (const c of worldState.creatures) {
      if (c.lifecycleState === 'alive') {
        counts.set(c.speciesId, (counts.get(c.speciesId) ?? 0) + 1);
      }
    }
  }
  const rows = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div style={panelStyle}>
      <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Species</div>
      {rows.length === 0 ? (
        <div style={{ color: '#777' }}>No living creatures</div>
      ) : (
        rows.map(([speciesId, count]) => (
          <div
            key={speciesId}
            style={{ display: 'flex', justifyContent: 'space-between', padding: '0.15rem 0' }}
          >
            <span style={{ color: '#bbb' }}>{speciesId}</span>
            <span>{count}</span>
          </div>
        ))
      )}
    </div>
  );
}
