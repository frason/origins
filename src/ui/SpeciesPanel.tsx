/**
 * SpeciesPanel — living species list, extinction status, recent events, and lineage stub.
 * Displays active species sorted by population, extinct species history,
 * recent simulation events, and a placeholder for future lineage visualization.
 */

import { CSSProperties } from 'react';
import { useStore } from '../state/store';
import { eventLog } from '../state/eventLog';

const panelStyle: CSSProperties = {
  backgroundColor: '#222',
  borderRadius: 8,
  padding: '0.75rem 1rem',
  color: '#eee',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '0.85rem',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
};

const sectionStyle: CSSProperties = {
  marginBottom: '0.75rem',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const sectionTitleStyle: CSSProperties = {
  fontWeight: 600,
  marginBottom: '0.5rem',
  fontSize: '0.9rem',
  color: '#fff',
};

const scrollableStyle: CSSProperties = {
  overflowY: 'auto',
  flex: 1,
};

/**
 * Convert a species ID to a deterministic RGB color using hash function.
 * Matches the algorithm used in WorldView for consistency.
 */
function getColorFromSpeciesId(speciesId: string): string {
  let hash = 0;
  for (let i = 0; i < speciesId.length; i++) {
    hash = (hash << 5) - hash + speciesId.charCodeAt(i);
    hash = hash & hash;
  }

  const hue = Math.abs(hash % 360);
  const saturation = 0.7;
  const lightness = 0.5;

  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - c / 2;

  let r = 0,
    g = 0,
    b = 0;

  if (hue < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (hue < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (hue < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (hue < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  const red = Math.round((r + m) * 255);
  const green = Math.round((g + m) * 255);
  const blue = Math.round((b + m) * 255);

  return `rgb(${red}, ${green}, ${blue})`;
}

/**
 * Species list item component
 */
function SpeciesRow({
  speciesId,
  name,
  population,
  strategy,
  isExtinct = false,
}: {
  speciesId: string;
  name?: string;
  population: number;
  strategy?: string;
  isExtinct?: boolean;
}) {
  const color = getColorFromSpeciesId(speciesId);
  const displayName = name || speciesId;
  const strategyLabel = strategy
    ? strategy.charAt(0).toUpperCase() + strategy.slice(1)
    : 'Unknown';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.4rem 0.3rem',
        borderRadius: 4,
        opacity: isExtinct ? 0.5 : 1,
        color: isExtinct ? '#999' : '#eee',
      }}
    >
      {/* Color swatch */}
      <div
        style={{
          width: '10px',
          height: '10px',
          borderRadius: 2,
          backgroundColor: color,
          flexShrink: 0,
        }}
      />

      {/* Species name */}
      <span style={{ flex: 1, fontSize: '0.8rem', minWidth: 0 }}>
        {displayName}
        {isExtinct && ' (extinct)'}
      </span>

      {/* Population and strategy badge */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.75rem' }}>
        <span
          style={{
            backgroundColor: '#333',
            padding: '0.15rem 0.4rem',
            borderRadius: 3,
            whiteSpace: 'nowrap',
          }}
        >
          {population}
        </span>
        <span
          style={{
            backgroundColor: isExtinct ? '#444' : '#3a5f3f',
            padding: '0.15rem 0.4rem',
            borderRadius: 3,
            whiteSpace: 'nowrap',
            fontSize: '0.7rem',
          }}
        >
          {strategyLabel}
        </span>
      </div>
    </div>
  );
}

/**
 * Recent events feed item
 */
function EventItem({ type, tick, speciesId, detail }: { type: string; tick: number; speciesId: string; detail: string }) {
  const typeColors: Record<string, string> = {
    birth: '#4a9d6f',
    mutation: '#d4a574',
    extinction: '#d45454',
    speciation: '#7d5fd4',
  };

  const typeEmoji: Record<string, string> = {
    birth: '🐣',
    mutation: '🧬',
    extinction: '💀',
    speciation: '🌿',
  };

  const color = typeColors[type] || '#888';
  const emoji = typeEmoji[type] || '•';

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
        padding: '0.3rem 0',
        fontSize: '0.75rem',
        borderBottom: '1px solid #333',
        color: '#bbb',
      }}
    >
      <span style={{ color, fontWeight: 600, minWidth: '1.2rem' }}>{emoji}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong>{speciesId.slice(0, 12)}</strong> {detail}
      </span>
      <span style={{ color: '#666', whiteSpace: 'nowrap' }}>T{tick}</span>
    </div>
  );
}

export default function SpeciesPanel() {
  const speciesList = useStore((s) => s.speciesList);
  const allEvents = eventLog.getEvents();

  // Get active species sorted by population (descending)
  const activeSpecies = [...speciesList]
    .sort((a, b) => b.population - a.population)
    .map(s => ({ speciesId: s.speciesId, population: s.population, energyStrategy: s.energyStrategy }));

  // Get extinction events to show extinct species
  const activeSpeciesIds = new Set(activeSpecies.map((s) => s.speciesId));
  const extinctionEvents = allEvents.filter((e) => e.type === 'extinction');
  const extinctSpecies = extinctionEvents
    .filter((e) => !activeSpeciesIds.has(e.speciesId))
    .map((e) => ({
      speciesId: e.speciesId,
      population: 0,
      lastSeenTick: e.tick,
    }));

  // Get last 20 events for the feed, sorted by most recent
  const recentEvents = allEvents.slice(-20).reverse();

  return (
    <div style={panelStyle}>
      {/* Active Species Section */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Active Species</div>
        <div style={scrollableStyle}>
          {activeSpecies.length === 0 ? (
            <div style={{ color: '#777', fontSize: '0.8rem' }}>No living creatures</div>
          ) : (
            activeSpecies.map(({ speciesId, population, energyStrategy }) => (
              <SpeciesRow
                key={speciesId}
                speciesId={speciesId}
                population={population}
                strategy={energyStrategy || 'unknown'}
              />
            ))
          )}
        </div>
      </div>

      {/* Extinct Species Section (if any) */}
      {extinctSpecies.length > 0 && (
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Extinct Species</div>
          <div style={scrollableStyle}>
            {extinctSpecies.map(({ speciesId }) => (
              <SpeciesRow
                key={speciesId}
                speciesId={speciesId}
                population={0}
                strategy="—"
                isExtinct={true}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recent Events Section */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Recent Events</div>
        <div style={scrollableStyle}>
          {recentEvents.length === 0 ? (
            <div style={{ color: '#777', fontSize: '0.8rem' }}>No events yet</div>
          ) : (
            recentEvents.map((event, idx) => (
              <EventItem
                key={idx}
                type={event.type}
                tick={event.tick}
                speciesId={event.speciesId}
                detail={event.detail}
              />
            ))
          )}
        </div>
      </div>

      {/* Lineage Tree Stub Section */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Lineage Tree (coming soon)</div>
        <div style={{ color: '#777', fontSize: '0.8rem' }}>No lineage data yet</div>
      </div>
    </div>
  );
}
