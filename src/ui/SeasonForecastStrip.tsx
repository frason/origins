/**
 * SeasonForecastStrip — next season boundary in ticks for the selected latitude, with predicted
 * changes in growth, metabolism and breeding multipliers (docs/design-seasons.md "UI needs").
 * Derived from the same pure functions as the simulation via buildSeasonForecast.
 */

import { validateSeasonConfig, type SeasonConfig } from '../simulation/seasons';
import {
  buildSeasonForecast,
  capitalise,
  formatChange,
  formatMultiplier,
} from './seasonDisplayModel';
import './SeasonDisplay.css';

interface SeasonForecastStripProps {
  tick: number;
  config: SeasonConfig;
  /** Representative latitude of the selected hemisphere (signed degrees). */
  latitudeDeg: number;
  /** Base cell temperature in basis points (0..10000). Defaults to 5000 (temperate). */
  baseTemperatureBP?: number;
}

export default function SeasonForecastStrip({
  tick,
  config,
  latitudeDeg,
  baseTemperatureBP,
}: SeasonForecastStripProps) {
  if (validateSeasonConfig(config).length > 0) return null;
  if (!config.enabled) {
    return <section className="season-forecast-strip" aria-label="Season forecast">Seasons are off.</section>;
  }

  const forecast = buildSeasonForecast({ tick, cfg: config, latitudeDeg, baseTemperatureBP });
  if (!forecast) return null;

  if (forecast.hemisphere === 'equator' || forecast.nextBoundaryTick === null) {
    return (
      <section className="season-forecast-strip" aria-label="Season forecast">
        <span className="season-forecast-strip__headline">equator: no seasons</span>
      </section>
    );
  }

  const changes = forecast.changes!;
  return (
    <section className="season-forecast-strip" aria-label="Season forecast">
      <span className="season-forecast-strip__headline">
        {capitalise(forecast.nextSeason)} in {forecast.ticksUntilBoundary} ticks
        <span className="season-forecast-strip__boundary"> (tick {forecast.nextBoundaryTick})</span>
      </span>
      <ul className="season-forecast-strip__changes">
        <li data-metric="growth">
          Growth {formatMultiplier(forecast.current.growth)} → {formatMultiplier(forecast.next!.growth)}{' '}
          ({formatChange(changes.growth)})
        </li>
        <li data-metric="metabolism">
          Metabolism {formatMultiplier(forecast.current.metabolism)} → {formatMultiplier(forecast.next!.metabolism)}{' '}
          ({formatChange(changes.metabolism)})
        </li>
        <li data-metric="breeding">
          Breeding {formatMultiplier(forecast.current.breeding)} → {formatMultiplier(forecast.next!.breeding)}{' '}
          ({formatChange(changes.breeding)})
        </li>
      </ul>
    </section>
  );
}
