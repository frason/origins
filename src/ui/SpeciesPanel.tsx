/** SpeciesPanel — living species, active lineages, traits, and recent mutations. */

import { CSSProperties } from 'react';
import { useStore } from '../state/store';
import { shortLineageId, summarizeSpecies } from './speciesModel';
import { lineageDisplayName, speciesDisplayName } from '../simulation/speciesNames';

const panelStyle: CSSProperties = {
  backgroundColor: '#222',
  borderRadius: 8,
  padding: '0.75rem 1rem',
  color: '#eee',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '0.85rem',
};

const strategyColors: Record<string, string> = {
  herbivore: '#69b96b',
  carnivore: '#e36d6d',
  omnivore: '#d7ad57',
  scavenger: '#a98bd4',
};

export default function SpeciesPanel() {
  const worldState = useStore((state) => state.worldState);
  const species = summarizeSpecies(worldState?.creatures ?? []);
  const mutations = (worldState?.events ?? [])
    .filter((event) => event.type === 'mutation')
    .slice(-3)
    .reverse();

  return (
    <div style={panelStyle}>
      <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Evolution</div>
      {species.length === 0 ? (
        <div style={{ color: '#777' }}>No living creatures</div>
      ) : (
        species.map((item) => (
          <div
            key={item.speciesId}
            style={{ borderTop: '1px solid #383838', padding: '0.55rem 0' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span style={{ color: strategyColors[item.strategy] ?? '#bbb', fontWeight: 600 }}>
                {speciesDisplayName(item.speciesId)}
              </span>
              <span>{item.population}</span>
            </div>
            <div style={{ color: '#888', fontSize: '0.72rem', margin: '0.15rem 0 0.35rem' }}>
              {item.strategy} · {item.speciesId} · {item.lineages.length}{' '}
              {item.lineages.length === 1 ? 'lineage' : 'lineages'}
            </div>
            {item.lineages.slice(0, 4).map((lineage) => (
              <div
                key={lineage.lineageId}
                title={lineage.lineageId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '0.5rem',
                  color: '#aaa',
                  fontSize: '0.72rem',
                  padding: '0.1rem 0 0.1rem 0.5rem',
                }}
              >
                <span>
                  ↳ {lineageDisplayName(item.speciesId, lineage.lineageId)} ·{' '}
                  <span title={lineage.lineageId}>{shortLineageId(lineage.lineageId)}</span> · size{' '}
                  {lineage.representativeTraits.size.toFixed(2)} · speed{' '}
                  {lineage.representativeTraits.speed.toFixed(2)}
                </span>
                <span>{lineage.population}</span>
              </div>
            ))}
            {item.lineages.length > 4 && (
              <div style={{ color: '#777', fontSize: '0.7rem', paddingLeft: '0.5rem' }}>
                +{item.lineages.length - 4} more lineages
              </div>
            )}
          </div>
        ))
      )}

      <div style={{ fontWeight: 600, margin: '0.75rem 0 0.35rem' }}>Recent mutations</div>
      {mutations.length === 0 ? (
        <div style={{ color: '#777', fontSize: '0.75rem' }}>No lineage branches yet</div>
      ) : (
        mutations.map((event, index) => (
          <div
            key={`${event.tick}-${event.creatureId ?? index}`}
            style={{ color: '#bba7d8', fontSize: '0.72rem', padding: '0.15rem 0' }}
          >
            tick {event.tick}: {event.detail ?? `${event.speciesId} mutated`}
          </div>
        ))
      )}
    </div>
  );
}
