/**
 * SeasonCalendarBar — current year, day of year, season per hemisphere and progress through the
 * year (docs/design-seasons.md "UI needs"). Renders from SeasonConfig + calendarAt only.
 */

import { validateSeasonConfig, type SeasonConfig } from '../simulation/seasons';
import { buildCalendarBarModel, capitalise } from './seasonDisplayModel';
import './SeasonDisplay.css';

interface SeasonCalendarBarProps {
  tick: number;
  config: SeasonConfig;
  /** Latitude under the cursor, if any. Used to show "equator: no seasons". */
  cursorLatitudeDeg?: number;
}

export default function SeasonCalendarBar({ tick, config, cursorLatitudeDeg }: SeasonCalendarBarProps) {
  const errors = validateSeasonConfig(config);
  if (errors.length > 0) {
    return (
      <section className="season-calendar-bar" role="alert" aria-label="Season calendar">
        Invalid season config: {errors.join('; ')}
      </section>
    );
  }
  if (!config.enabled) {
    return (
      <section className="season-calendar-bar" aria-label="Season calendar">
        Seasons are off for this world.
      </section>
    );
  }

  const model = buildCalendarBarModel(tick, config, cursorLatitudeDeg);
  return (
    <section className="season-calendar-bar" aria-label="Season calendar">
      <span className="season-calendar-bar__date">
        Year {model.year} · Day {model.dayOfYear + 1} of {model.yearLengthTicks}
      </span>
      <span className="season-calendar-bar__hemispheres">
        <span data-hemisphere="north">North: {capitalise(model.northSeason)}</span>
        <span data-hemisphere="south">South: {capitalise(model.southSeason)}</span>
      </span>
      {model.cursorHemisphere === 'equator' && (
        <span className="season-calendar-bar__equator" data-hemisphere="equator">
          equator: no seasons
        </span>
      )}
      <div
        className="season-calendar-bar__track"
        role="progressbar"
        aria-label="Progress through the year"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={model.progressPct}
      >
        <div className="season-calendar-bar__fill" style={{ width: `${model.progressPct}%` }} />
      </div>
    </section>
  );
}
