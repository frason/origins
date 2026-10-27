/**
 * SeasonTileTooltip — latitude, daylight, seasonal temperature, snow cover and evaporation
 * multiplier for one grid cell (docs/design-seasons.md "UI needs"). The caller decides when to
 * show it and where to position it.
 */

import { validateSeasonConfig, type SeasonConfig } from '../simulation/seasons';
import { buildTileSeasonReadout, formatBP, formatMultiplier } from './seasonDisplayModel';
import './SeasonDisplay.css';

interface SeasonTileTooltipProps {
  tick: number;
  config: SeasonConfig;
  /** Grid row of the hovered cell (0 = northern edge). */
  y: number;
  /** Grid height, needed to derive latitude from the row. */
  height: number;
  /** Static base temperature of the cell, 0..1. */
  temperature: number;
}

function formatLatitude(latDeg: number): string {
  const rounded = Math.round(latDeg * 10) / 10;
  if (rounded === 0) return '0.0°';
  return `${Math.abs(rounded).toFixed(1)}° ${rounded > 0 ? 'N' : 'S'}`;
}

export default function SeasonTileTooltip({ tick, config, y, height, temperature }: SeasonTileTooltipProps) {
  if (validateSeasonConfig(config).length > 0) return null;

  const readout = buildTileSeasonReadout({ tick, cfg: config, y, height, temperature });
  return (
    <div className="season-tile-tooltip" role="tooltip">
      <div data-field="latitude">Latitude: {formatLatitude(readout.latitudeDeg)}</div>
      {readout.seasonsEnabled ? (
        <>
          <div data-field="daylight">Daylight: {formatBP(readout.daylightBP!)}</div>
          <div data-field="temperature">Seasonal temp: {formatBP(readout.seasonalTempBP!)}</div>
          <div data-field="snow">Snow cover: {formatBP(readout.snowCoverBP!)}</div>
          <div data-field="evaporation">
            Evaporation: {formatMultiplier(readout.evaporationMultiplier!)}
          </div>
        </>
      ) : (
        <div data-field="seasons-off">Seasons are off.</div>
      )}
    </div>
  );
}
