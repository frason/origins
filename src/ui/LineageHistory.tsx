import { useState, type CSSProperties } from 'react';
import { useStore } from '../state/store';
import {
  buildLineageHistories,
  formatTraitChange,
  resolveFollowedLineages,
} from './lineageHistoryModel';

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
  const followedLineages = useStore((state) => state.followedLineages);
  const toggleFollowedLineage = useStore((state) => state.toggleFollowedLineage);
  const followed = resolveFollowedLineages(histories, followedLineages);
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null);
  const [selectedLineage, setSelectedLineage] = useState<string | null>(null);
  const selected = histories.find((history) => history.speciesId === selectedSpecies) ?? histories[0];
  const followedPanel = followed.length > 0 ? (
    <div style={{ background: '#1b2023', borderRadius: 6, padding: '0.45rem', marginBottom: '0.55rem' }}>
      <div style={{ color: '#899ba2', fontSize: '0.67rem', marginBottom: '0.3rem' }}>
        Following {followed.length}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
        {followed.map((item) => (
          <button
            key={`${item.speciesId}:${item.lineageId}`}
            type="button"
            title={`${item.speciesName} · ${item.lineageId}`}
            onClick={() => {
              setSelectedSpecies(item.speciesId);
              setSelectedLineage(item.lineageId);
            }}
            style={{
              border: `1px solid ${item.status === 'living' ? '#527786' : '#67484e'}`,
              borderRadius: 999,
              padding: '0.25rem 0.45rem',
              background: selectedLineage === item.lineageId ? '#354650' : '#272d30',
              color: item.status === 'living' ? '#b6dce8' : '#b78f96',
              cursor: 'pointer',
              fontSize: '0.66rem',
            }}
          >
            ★ {item.lineageName} · {item.status === 'living' ? item.population : 'extinct'}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <section style={panelStyle} aria-labelledby="lineage-history-title">
      <div id="lineage-history-title" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
        Lineage History
      </div>
      {followedPanel}
      {histories.length === 0 ? (
        <div style={{ color: '#777' }}>Lineages will appear after life begins evolving.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', paddingBottom: '0.45rem' }}>
            {histories.map((history) => (
              <button
                key={history.speciesId}
                type="button"
                onClick={() => {
                  setSelectedSpecies(history.speciesId);
                  setSelectedLineage(null);
                }}
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
                background: selectedLineage === lineage.lineageId ? '#29343a' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <strong style={{ color: lineage.status === 'living' ? '#b6dce8' : '#a9878c' }}>
                  {lineage.name}
                </strong>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ color: '#777', whiteSpace: 'nowrap' }}>
                    {lineage.status === 'living' ? `${lineage.population} living` : 'extinct'}
                  </span>
                  <button
                    type="button"
                    aria-label={`${followedLineages.some((item) => item.speciesId === selected.speciesId && item.lineageId === lineage.lineageId) ? 'Unfollow' : 'Follow'} ${lineage.name}`}
                    aria-pressed={followedLineages.some((item) => item.speciesId === selected.speciesId && item.lineageId === lineage.lineageId)}
                    onClick={() => toggleFollowedLineage({
                      speciesId: selected.speciesId,
                      lineageId: lineage.lineageId,
                    })}
                    style={{ border: 0, background: 'transparent', color: followedLineages.some((item) => item.speciesId === selected.speciesId && item.lineageId === lineage.lineageId) ? '#e4c66c' : '#777', cursor: 'pointer', padding: '0.1rem' }}
                  >
                    {followedLineages.some((item) => item.speciesId === selected.speciesId && item.lineageId === lineage.lineageId) ? '★' : '☆'}
                  </button>
                </div>
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
