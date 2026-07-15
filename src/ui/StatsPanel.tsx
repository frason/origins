/**
 * StatsPanel — headline ecosystem metrics and health indicators.
 * Displays biodiversity, population, biomass, energy, trophic balance,
 * and ecosystem status with color-coded badges.
 */

import { CSSProperties, useRef, useEffect, useState } from 'react';
import { useStore } from '../state/store';

const panelStyle: CSSProperties = {
  backgroundColor: '#222',
  borderRadius: 8,
  padding: '0.75rem 1rem',
  color: '#eee',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '0.85rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
};

const sectionTitleStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: '0.9rem',
  color: '#fff',
  marginBottom: '0.25rem',
};

const metricRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0.3rem 0',
  fontSize: '0.8rem',
};

const labelStyle: CSSProperties = {
  color: '#bbb',
};

const badgeStyle: CSSProperties = {
  padding: '0.2rem 0.5rem',
  borderRadius: 4,
  fontSize: '0.7rem',
  fontWeight: 500,
  whiteSpace: 'nowrap',
};

/**
 * Biodiversity badge — color-coded by species count
 */
function BiodiversityBadge({ speciesCount }: { speciesCount: number }) {
  let backgroundColor = '#444';
  let textColor = '#999';

  if (speciesCount >= 5) {
    backgroundColor = '#2d5a2d';
    textColor = '#6dd66d';
  } else if (speciesCount >= 2) {
    backgroundColor = '#5a5a2d';
    textColor = '#e6d66d';
  } else if (speciesCount === 1) {
    backgroundColor = '#5a2d2d';
    textColor = '#ff6b6b';
  }

  return (
    <span style={{ ...badgeStyle, backgroundColor, color: textColor }}>
      {speciesCount > 0 ? speciesCount : '0'} species
    </span>
  );
}

/**
 * Trophic balance badge — indicates predator/prey balance
 */
function TrophicBadge({
  herbivoreCount,
  carnivoreCount,
}: {
  herbivoreCount: number;
  carnivoreCount: number;
}) {
  let label = 'No data';
  let backgroundColor = '#444';
  let textColor = '#999';

  if (carnivoreCount === 0 && herbivoreCount > 0) {
    label = 'No predators';
    backgroundColor = '#5a4a2d';
    textColor = '#d4a574';
  } else if (herbivoreCount === 0 && carnivoreCount > 0) {
    label = 'Too many predators';
    backgroundColor = '#5a2d2d';
    textColor = '#ff6b6b';
  } else if (herbivoreCount > 0 && carnivoreCount > 0) {
    const ratio = herbivoreCount / carnivoreCount;
    if (ratio > 1 && ratio < 10) {
      label = 'Balanced';
      backgroundColor = '#2d5a2d';
      textColor = '#6dd66d';
    } else if (ratio >= 10) {
      label = 'Too many predators';
      backgroundColor = '#5a2d2d';
      textColor = '#ff6b6b';
    } else {
      label = 'Too many predators';
      backgroundColor = '#5a2d2d';
      textColor = '#ff6b6b';
    }
  }

  return (
    <span style={{ ...badgeStyle, backgroundColor, color: textColor }}>
      {label}
    </span>
  );
}

/**
 * Ecosystem status badge — indicates overall health
 */
function StatusBadge({
  speciesCount,
  totalPopulation,
  totalBiomass,
  tick,
  previousPopulation,
}: {
  speciesCount: number;
  totalPopulation: number;
  totalBiomass: number;
  tick: number;
  previousPopulation: number;
}) {
  let status = 'Collapsing';
  let backgroundColor = '#5a2d2d';
  let textColor = '#ff6b6b';

  if (totalPopulation === 0 || totalBiomass === 0) {
    status = 'Collapsing';
    backgroundColor = '#5a2d2d';
    textColor = '#ff6b6b';
  } else if (speciesCount >= 5 && tick > 100) {
    status = 'Thriving';
    backgroundColor = '#2d5a2d';
    textColor = '#6dd66d';
  } else if (speciesCount >= 3) {
    status = 'Stable';
    backgroundColor = '#2d4a5a';
    textColor = '#6dd6e6';
  } else if (speciesCount >= 1 && totalPopulation > 0) {
    // Check if population is dropping
    const isDropping =
      previousPopulation > 0 && totalPopulation < previousPopulation * 0.9;
    if (isDropping) {
      status = 'At Risk';
      backgroundColor = '#5a5a2d';
      textColor = '#e6d66d';
    } else {
      status = 'At Risk';
      backgroundColor = '#5a5a2d';
      textColor = '#e6d66d';
    }
  }

  return (
    <span style={{ ...badgeStyle, backgroundColor, color: textColor }}>
      {status}
    </span>
  );
}

function Row({
  label,
  value,
  badge,
}: {
  label: string;
  value?: string | number;
  badge?: React.ReactNode;
}) {
  return (
    <div style={metricRowStyle}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        {value !== undefined && (
          <>
            {typeof value !== 'string' || value !== '--' ? (
              <span style={{ minWidth: '3rem', textAlign: 'right' }}>{value}</span>
            ) : (
              <span style={{ minWidth: '3rem', textAlign: 'right', color: '#666' }}>
                {value}
              </span>
            )}
          </>
        )}
        {badge}
      </div>
    </div>
  );
}

export default function StatsPanel() {
  const worldState = useStore((s) => s.worldState);
  const tick = useStore((s) => s.tick);
  const speciesList = useStore((s) => s.speciesList);
  const previousPopulationRef = useRef<number>(0);
  const [previousPopulation, setPreviousPopulation] = useState(0);

  // Track population history for "At Risk" detection
  useEffect(() => {
    if (worldState) {
      const currentPopulation = worldState.creatures.filter(
        (c) => c.lifecycleState === 'alive'
      ).length;
      setPreviousPopulation(previousPopulationRef.current);
      previousPopulationRef.current = currentPopulation;
    }
  }, [worldState]);

  // Calculate metrics from worldState
  let totalPopulation = 0;
  let totalBiomass = 0;
  let totalCellEnergy = 0;
  let cellCount = 0;
  let herbivoreCount = 0;
  let carnivoreCount = 0;

  if (worldState) {
    for (const c of worldState.creatures) {
      if (c.lifecycleState === 'alive') {
        totalPopulation++;
        // Count trophic levels
        if (c.energyStrategy === 'herbivore') {
          herbivoreCount++;
        } else if (c.energyStrategy === 'carnivore') {
          carnivoreCount++;
        }
      }
    }
    for (const cell of worldState.cells) {
      totalBiomass += cell.producerBiomass;
      totalCellEnergy += cell.energy;
    }
    cellCount = worldState.cells.length;
  }

  const speciesCount = speciesList.length;
  const avgCellEnergy = cellCount > 0 ? (totalCellEnergy / cellCount).toFixed(1) : '--';

  return (
    <div style={panelStyle}>
      {/* Tick Counter */}
      <div style={{ fontSize: '0.75rem', color: '#666', textAlign: 'center' }}>
        Tick: {tick}
      </div>

      {/* Biodiversity & Status Section */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Ecosystem Health</div>
        <Row
          label="Biodiversity"
          value={worldState ? speciesCount : '--'}
          badge={
            worldState ? (
              <BiodiversityBadge speciesCount={speciesCount} />
            ) : undefined
          }
        />
        <Row
          label="Status"
          badge={
            worldState ? (
              <StatusBadge
                speciesCount={speciesCount}
                totalPopulation={totalPopulation}
                totalBiomass={totalBiomass}
                tick={tick}
                previousPopulation={previousPopulation}
              />
            ) : undefined
          }
        />
      </div>

      {/* Population & Resources Section */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Population</div>
        <Row label="Total" value={worldState ? totalPopulation : '--'} />
        <Row
          label="Herbivores"
          value={worldState ? herbivoreCount : '--'}
          badge={
            worldState ? (
              <TrophicBadge
                herbivoreCount={herbivoreCount}
                carnivoreCount={carnivoreCount}
              />
            ) : undefined
          }
        />
        <Row label="Carnivores" value={worldState ? carnivoreCount : '--'} />
      </div>

      {/* Energy & Biomass Section */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Resources</div>
        <Row
          label="Avg cell energy"
          value={worldState ? avgCellEnergy : '--'}
        />
        <Row
          label="Producer biomass"
          value={
            worldState
              ? Math.round(totalBiomass).toLocaleString()
              : '--'
          }
        />
      </div>
    </div>
  );
}
