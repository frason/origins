import { useState, type CSSProperties } from 'react';
import { useStore } from '../state/store';
import { buildLineageHistories, formatTraitChange } from './lineageHistoryModel';

const panelStyle: CSSProperties = {
  backgroundColor: '#222',
  borderRadius: 8,
  padding: '0.75rem 1rem',
  color: '#eee',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '0.8rem',
};

export default function LineageHistory() {
  const worldState = useStore((state) => state.worldState);
  const histories = buildLineageHistories(
    worldState?.creatures ?? [],
    worldState?.events ?? []
  );
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null);
  const selected = histories.find((history) => history.speciesId === selectedSpecies) ?? histories[0];

  return (
    <section style={panelStyle} aria-labelledby="lineage-history-title">
      <div id="lineage-history-title" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
        Lineage History
      </div>
      {histories.length === 0 ? (
        <div style={{ color: '#777' }}>Lineages will appear after life begins evolving.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', paddingBottom: '0.45rem' }}>
            {histories.map((history) => (
              <button
                key={history.speciesId}
                type="button"
                onClick={() => setSelectedSpecies(history.speciesId)}
                aria-pressed={selected?.speciesId === history.speciesId}
                style={{
                  border: '1px solid #555',
                  borderRadius: 999,
                  padding: '0.25rem 0.5rem',
                  background: selected?.speciesId === history.speciesId ? '#3b4d58' : '#292929',
                  color: '#ddd',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontSize: '0.68rem',
                }}
              >
                {history.name}
              </button>
            ))}
          </div>
          <div style={{ color: '#888', fontSize: '0.68rem', marginBottom: '0.35rem' }}>
            {selected.lineages.length} lineages · {selected.population} living creatures
          </div>
          {selected.lineages.map((lineage) => (
            <article
              key={lineage.lineageId}
              title={lineage.lineageId}
              style={{
                marginLeft: `${Math.min(5, lineage.depth) * 0.65}rem`,
                borderLeft: `2px solid ${lineage.status === 'living' ? '#78a9bd' : '#61454a'}`,
                borderTop: '1px solid #353535',
                padding: '0.45rem 0 0.45rem 0.55rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <strong style={{ color: lineage.status === 'living' ? '#b6dce8' : '#a9878c' }}>
                  {lineage.name}
                </strong>
                <span style={{ color: '#777', whiteSpace: 'nowrap' }}>
                  {lineage.status === 'living' ? `${lineage.population} living` : 'extinct'}
                </span>
              </div>
              <div style={{ color: '#777', fontSize: '0.66rem', marginTop: '0.1rem' }}>
                {lineage.parentLineageId ? `branched at tick ${lineage.firstSeenTick}` : 'founding lineage'}
              </div>
              {lineage.traitChanges.map((change) => (
                <div
                  key={change.trait}
                  style={{ color: '#bba7d8', fontSize: '0.67rem', marginTop: '0.2rem' }}
                >
                  {formatTraitChange(change)}
                </div>
              ))}
            </article>
          ))}
        </>
      )}
    </section>
  );
}
