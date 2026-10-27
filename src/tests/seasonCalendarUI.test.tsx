import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SeasonCalendarBar from '../ui/SeasonCalendarBar';
import SeasonForecastStrip from '../ui/SeasonForecastStrip';
import SeasonTileTooltip from '../ui/SeasonTileTooltip';
import {
  buildCalendarBarModel,
  buildSeasonForecast,
  buildTileSeasonReadout,
  nextSeasonBoundaryTick,
} from '../ui/seasonDisplayModel';
import {
  DEFAULT_SEASON_CONFIG,
  calendarAt,
  seasonNameAt,
  type SeasonConfig,
} from '../simulation/seasons';
import { breedingQuartileIndex } from '../simulation/seasonResponses';

const cfg: SeasonConfig = { ...DEFAULT_SEASON_CONFIG };
const disabled: SeasonConfig = { ...DEFAULT_SEASON_CONFIG, enabled: false };

describe('SeasonCalendarBar', () => {
  it('renders year, day of year and per-hemisphere season from calendarAt', () => {
    const html = renderToStaticMarkup(<SeasonCalendarBar tick={0} config={cfg} />);
    expect(html).toContain('Year 0 · Day 1 of 960');
    expect(html).toContain('North: Winter');
    expect(html).toContain('South: Summer');
    expect(html).toContain('aria-valuenow="0"');
    expect(html).not.toContain('equator: no seasons');
  });

  it('wraps the year and applies phase offset', () => {
    const offsetCfg = { ...cfg, phaseOffsetTicks: 500 };
    const html = renderToStaticMarkup(<SeasonCalendarBar tick={500} config={offsetCfg} />);
    // (500 + 500) = 1000 -> year 1, dayOfYear 40, displayed as day 41
    expect(html).toContain('Year 1 · Day 41 of 960');
    const model = buildCalendarBarModel(500, offsetCfg);
    expect(model.year).toBe(calendarAt(500, offsetCfg).year);
    expect(model.dayOfYear).toBe(calendarAt(500, offsetCfg).dayOfYear);
  });

  it('shows "equator: no seasons" when the cursor is on the equator row', () => {
    const html = renderToStaticMarkup(
      <SeasonCalendarBar tick={0} config={cfg} cursorLatitudeDeg={0} />,
    );
    expect(html).toContain('equator: no seasons');
  });

  it('renders an error instead of a calendar for an invalid config', () => {
    const bad = { ...cfg, yearLengthTicks: 7.5 };
    const html = renderToStaticMarkup(<SeasonCalendarBar tick={0} config={bad} />);
    expect(html).toContain('Invalid season config');
    expect(html).not.toContain('Year ');
  });

  it('says seasons are off when disabled', () => {
    const html = renderToStaticMarkup(<SeasonCalendarBar tick={0} config={disabled} />);
    expect(html).toContain('Seasons are off for this world.');
    expect(html).not.toContain('North:');
  });
});

describe('season boundary and forecast', () => {
  it('finds the first tick where the hemisphere quartile changes', () => {
    // North: quartile floor(4·d/960) flips to 1 at d = 240.
    expect(nextSeasonBoundaryTick(0, cfg, 'north')).toBe(240);
    expect(nextSeasonBoundaryTick(239, cfg, 'north')).toBe(240);
    expect(nextSeasonBoundaryTick(0, cfg, 'equator')).toBeNull();
  });

  it('agrees with the simulation quartile at the boundary tick and one tick before', () => {
    for (const hemisphere of ['north', 'south'] as const) {
      for (let tick = 0; tick < 2 * cfg.yearLengthTicks; tick += 37) {
        const boundary = nextSeasonBoundaryTick(tick, cfg, hemisphere);
        expect(boundary).not.toBeNull();
        const before = breedingQuartileIndex(calendarAt(boundary! - 1, cfg).yearFraction, hemisphere);
        const at = breedingQuartileIndex(calendarAt(boundary!, cfg).yearFraction, hemisphere);
        expect(before).not.toBe(at);
      }
    }
  });

  it('reports the next season and ticks until the boundary', () => {
    const f = buildSeasonForecast({ tick: 0, cfg, latitudeDeg: 45 })!;
    expect(f.hemisphere).toBe('north');
    expect(f.currentSeason).toBe('winter');
    expect(f.nextSeason).toBe('spring');
    expect(f.nextBoundaryTick).toBe(240);
    expect(f.ticksUntilBoundary).toBe(240);
    expect(f.nextSeason).toBe(seasonNameAt(calendarAt(240, cfg).yearFraction, 'north'));
  });

  it('predicted changes equal next minus current multipliers', () => {
    const f = buildSeasonForecast({ tick: 0, cfg, latitudeDeg: -45, baseTemperatureBP: 3000 })!;
    expect(f.next).not.toBeNull();
    expect(f.changes!.growth).toBeCloseTo(f.next!.growth - f.current.growth, 6);
    expect(f.changes!.metabolism).toBeCloseTo(f.next!.metabolism - f.current.metabolism, 6);
    expect(f.changes!.breeding).toBeCloseTo(f.next!.breeding - f.current.breeding, 6);
  });

  it('returns null from the forecast when seasons are disabled', () => {
    expect(buildSeasonForecast({ tick: 0, cfg: disabled, latitudeDeg: 45 })).toBeNull();
  });

  it('renders the forecast strip with boundary and multiplier changes', () => {
    const html = renderToStaticMarkup(<SeasonForecastStrip tick={0} config={cfg} latitudeDeg={45} />);
    expect(html).toContain('Spring in 240 ticks');
    expect(html).toContain('(tick 240)');
    expect(html).toContain('data-metric="growth"');
    expect(html).toContain('data-metric="metabolism"');
    expect(html).toContain('data-metric="breeding"');
  });

  it('renders "equator: no seasons" in the forecast on the equator', () => {
    const html = renderToStaticMarkup(<SeasonForecastStrip tick={0} config={cfg} latitudeDeg={0} />);
    expect(html).toContain('equator: no seasons');
    expect(html).not.toContain('ticks');
  });
});

describe('SeasonTileTooltip', () => {
  it('reads latitude from the row and seasonal values from the curves', () => {
    // height 101 => row 0 is +45°, row 50 is the equator.
    const top = buildTileSeasonReadout({ tick: 0, cfg, y: 0, height: 101, temperature: 0.5 });
    expect(top.latitudeDeg).toBeCloseTo(45, 6);
    expect(top.hemisphere).toBe('north');
    expect(top.daylightBP).toBe(5000);
    expect(top.seasonalTempBP).toBe(5000);
    expect(top.evaporationMultiplier).toBe(1);

    const html = renderToStaticMarkup(
      <SeasonTileTooltip tick={0} config={cfg} y={0} height={101} temperature={0.5} />,
    );
    expect(html).toContain('role="tooltip"');
    expect(html).toContain('Latitude: 45.0° N');
    expect(html).toContain('Daylight: 50%');
    expect(html).toContain('Seasonal temp: 50%');
    expect(html).toContain('Snow cover:');
    expect(html).toContain('Evaporation: ×1.00');
  });

  it('shows 0.0° and no seasonal values on the equator when seasons are off', () => {
    const html = renderToStaticMarkup(
      <SeasonTileTooltip tick={0} config={disabled} y={50} height={101} temperature={0.5} />,
    );
    expect(html).toContain('Latitude: 0.0°');
    expect(html).toContain('Seasons are off.');
    expect(html).not.toContain('Daylight:');
  });

  it('reports null seasonal fields when disabled', () => {
    const r = buildTileSeasonReadout({ tick: 0, cfg: disabled, y: 0, height: 101, temperature: 0.5 });
    expect(r.seasonsEnabled).toBe(false);
    expect(r.daylightBP).toBeNull();
    expect(r.evaporationMultiplier).toBeNull();
  });
});
