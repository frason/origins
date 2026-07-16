/**
 * TileInfoPanel — displays detailed information about a selected tile.
 * Shows cell energy, nutrients, producer biomass, toxicity, and creatures.
 */

import React, { CSSProperties } from 'react';
import { useStore } from '../state/store';

const panelStyle: CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  backgroundColor: '#1a1a1a',
  borderTop: '2px solid #444',
  color: '#eee',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '0.85rem',
  padding: '1rem',
  boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.5)',
  maxHeight: '30vh',
  overflowY: 'auto',
  zIndex: 100,
};

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '0.75rem',
  paddingBottom: '0.5rem',
  borderBottom: '1px solid #444',
};

const titleStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: '1rem',
};

const closeButtonStyle: CSSProperties = {
  backgroundColor: '#444',
  color: '#eee',
  border: 'none',
  borderRadius: 4,
  padding: '0.4rem 0.8rem',
  cursor: 'pointer',
  fontSize: '0.85rem',
};

const sectionStyle: CSSProperties = {
  marginBottom: '0.75rem',
};

const sectionTitleStyle: CSSProperties = {
  fontWeight: 600,
  color: '#aaa',
  marginBottom: '0.25rem',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '0.2rem 0',
};

const labelStyle: CSSProperties = {
  color: '#999',
};

const creatureRowStyle: CSSProperties = {
  padding: '0.4rem 0.5rem',
  backgroundColor: '#222',
  borderRadius: 3,
  marginBottom: '0.25rem',
  fontSize: '0.8rem',
};

export default function TileInfoPanel() {
  const { selectedTile, worldState, setSelectedTile } = useStore();

  // If no tile is selected, don't render
  if (!selectedTile || !worldState) {
    return null;
  }

  // Extract cell data
  const cellIndex = selectedTile.y * worldState.width + selectedTile.x;
  const cell = worldState.cells[cellIndex];

  // Extract creatures on this tile
  const tilesCreatures = worldState.creatures.filter(
    (c) => c.x === selectedTile.x && c.y === selectedTile.y && c.lifecycleState === 'alive'
  );

  const handleClose = () => {
    setSelectedTile(null);
  };

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <div style={titleStyle}>
          Tile ({selectedTile.x}, {selectedTile.y})
        </div>
        <button style={closeButtonStyle} onClick={handleClose}>
          Close
        </button>
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Landscape</div>
        <div style={rowStyle}>
          <span style={labelStyle}>Biome</span>
          <span style={{ textTransform: 'capitalize' }}>{cell.biome}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Elevation</span>
          <span>{cell.elevation.toFixed(2)}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Moisture</span>
          <span>{cell.moisture.toFixed(2)}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Temperature</span>
          <span>{cell.temperature.toFixed(2)}</span>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Cell Resources</div>
        <div style={rowStyle}>
          <span style={labelStyle}>Energy</span>
          <span>{cell.energy.toFixed(2)}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Nutrients</span>
          <span>{cell.nutrients.toFixed(2)}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Producer Biomass</span>
          <span>{cell.producerBiomass.toFixed(2)}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Producer Type</span>
          <span style={{ textTransform: 'capitalize' }}>
            {cell.producerArchetype.replace(/-/g, ' ')}
          </span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Toxicity</span>
          <span>{cell.toxicity.toFixed(2)}</span>
        </div>
      </div>

      {tilesCreatures.length > 0 && (
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Creatures ({tilesCreatures.length})</div>
          {tilesCreatures.map((creature) => (
            <div key={creature.id} style={creatureRowStyle}>
              <div>
                <strong>{creature.speciesId}</strong> (ID: {creature.id})
              </div>
              <div style={{ color: '#aaa', marginTop: '0.2rem' }}>
                Energy: {creature.energy.toFixed(2)} | Age: {creature.age}
              </div>
            </div>
          ))}
        </div>
      )}

      {tilesCreatures.length === 0 && (
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Creatures</div>
          <div style={{ color: '#666' }}>No creatures on this tile</div>
        </div>
      )}
    </div>
  );
}
