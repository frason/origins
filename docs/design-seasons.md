# Deterministic Seasonal Climate Cycle: Design

Status: proposal only; no implementation under issue #349. Epic: #121.

## Goals

- Make seasons observable: regional warm/cold phases that change habitat over a configurable year.
- Keep seasons a **pure function of `(tick, latitude, config)`**. No wall-clock time, no
  per-tick accumulated floats, no new unseeded randomness.
- Keep the equator comparatively stable; northern and southern phases oppose each other.
- Make every seasonal response a named, tunable constant in a data table, not a branch on season names.
- Preserve current behaviour exactly for existing saves until seasons are explicitly enabled.

## Existing model this builds on

- `src/simulation/world.ts`: `TerrainCell` carries static `moisture` and `temperature`. Generation
  computes a latitude as `y / (height - 1)` and an `equatorWarmth = 1 - |2·lat - 1|`, so the
  middle row is warmest and the top and bottom rows are coldest. This baseline is used by
  `classifyBiome`, so it must stay as-is.
- Hydrology (#263–#268) is static after generation (`waterDepth`, `waterTable`, substrate). The
  file comments say seasonal changes are a later phase; this design is that later phase.
- `src/simulation/rng.ts`: `RNG_STREAMS` and `RNG_STREAM_VERSION = 1`. Seasons need **no new RNG
  stream** and therefore must not change `RNG_STREAM_VERSION`.
- `src/simulation/enginePersistence.ts`: `ENGINE_SAVE_VERSION = 1` with `rngStreamVersion`. The save
  payload carries `tick`, which is the only time input seasons need.

## Calendar: tick to season

Seasons are derived, never stored per tick.

```ts
interface SeasonConfig {
  enabled: boolean;          // false = today's behaviour, byte-identical
  yearLengthTicks: number;   // integer, >= 4 * MIN_SEASON_TICKS
  axialTiltDeg: number;      // 0..30; scales the amplitude of hemispheric swings
  phaseOffsetTicks: number;  // integer; shifts the calendar origin, default 0
  gridMaxLatitudeDeg: number;// latitude of row 0 and row height-1, default 45
}

interface CalendarState {
  year: number;              // floor((tick + phaseOffsetTicks) / yearLengthTicks)
  dayOfYear: number;         // (tick + phaseOffsetTicks) mod yearLengthTicks, integer
  yearFraction: number;      // dayOfYear / yearLengthTicks, in [0, 1)
}

function calendarAt(tick: number, cfg: SeasonConfig): CalendarState;
```

- All arithmetic is integer (`Math.floor`, `%`) on the tick; `yearFraction` is the only float and
  is recomputed each call, so it never drifts over long runs.
- Default `yearLengthTicks`: **960** (four seasons of 240 ticks). Long enough that a creature sees
  a full season; short enough that a 10-year run is ~9,600 ticks. Configurable per world.
- Season names are a display derivation of `yearFraction` quartiles, with a per-hemisphere label
  (north "spring" at 0.25 means south "autumn"). Season name is never simulation input; the
  simulation reads continuous curves (below).

## Latitude mapping

Each row has a signed latitude, computed once at generation and stored in the cell array or
a per-row lookup:

```
latDeg(y) = gridMaxLatitudeDeg * (1 - 2·y / (height - 1))
```

- Row 0 is northern (`+gridMaxLatitudeDeg`); the last row is southern. Equator is the middle row.
- `hemisphere` is `north` when `latDeg > 0`, `south` when `< 0`, and `equator` when `|latDeg| < 1`.
- The existing generation latitude (`y / (height - 1)`) is unchanged; seasonal code uses its own
  signed field so `classifyBiome` results do not move.

## Seasonal curves (pure functions)

Let `s = sin(2π · yearFraction)` and `φ = latDeg` in radians. The hemispheric sign comes from
`sin φ`, so north and south oppose automatically and the equator (`sin 0 = 0`) has no swing.

```
tilt = axialTiltDeg / 23.5                     // 1.0 at Earth-like tilt
insolation(φ, t) = clamp01(0.5 + 0.5 · tilt · sin φ · s)   // 0.5 at equator for all t
daylight(φ, t)   = clamp01(0.5 + 0.5 · tilt · sin φ · s)   // day fraction, 12h at equator
seasonalTemp(φ, t) = clamp01(baseTemp + SEASON.tempAmplitude · tilt · sin φ · s)
```

- `insolation` and `daylight` share a shape in v1; they are kept separate so a later phase can
  make daylight nonlinear near the poles without touching energy generation.
- At `|φ|` near the poles, daylight saturates at 0 or 1 (polar night / midnight sun). This is
  intentional, not a bug.
- `snowCover` is a derived signal: `clamp01((freezeThreshold - seasonalTemp) / freezeBand)`.
  Snow is a dormancy input, not a separate resource.

### Fixed-point boundary

`Math.sin` is not guaranteed bit-identical across JavaScript engines. To keep replay portable,
seasonal curves are evaluated from a **precomputed integer table** (for example 1024 entries,
values in basis points 0–10000 computed once and frozen in source). Interpolation uses integer
math. Floats appear only in the final multiplier passed to growth or metabolism, and those
multipliers are also rounded to a fixed precision (e.g. 1e-6) before use.

## Seasonal effects as data-table constants

All tunable numbers live in one `SEASON_EFFECTS` table in `src/utils/traits.ts` or a new
`src/simulation/seasonEffects.ts` (child issue decides). Defaults are proposals:

| Effect | Input | Constant | Default |
|---|---|---|---:|
| Producer growth | daylight × temp factor | `growthDaylightWeight` | 0.6 |
| Producer growth | snow cover | `growthDormantAtSnow` | 0.85 (suppressed when snow ≥ 0.85) |
| Producer growth | temperature below `growthColdFloor` | `growthColdFloor` | 0.18 |
| Water evaporation | seasonal temp | `evapTempSensitivity` | 0.5 |
| Water evaporation | seasonal temp | `evapMinScale` / `evapMaxScale` | 0.4 / 1.6 |
| Rainfall baseline | hemisphere wet phase | `rainPeakYearFraction` | 0.0 north, 0.5 south |
| Rainfall baseline | wet-phase cosine | `rainAmplitude` | 0.25 |
| Metabolism | cold stress | `metabolismColdScale` | 0.3 extra at temp 0 |
| Metabolism | snow / dormancy | `dormantMetabolismScale` | 0.35 (multiplier while dormant) |
| Reproduction | season window | `breedingWindow` | `spring`, `summer` multipliers 1.0; `autumn` 0.6; `winter` 0.2 |
| Reproduction | cold stress | `reproductionColdFloor` | 0.25 (no breeding below) |

- Each effect is a multiplier of an existing base value (`base growth`, `base evaporation`,
  `base metabolism`, `base reproduction chance`). No effect replaces a base rule.
- Growth, evaporation and metabolism use `clamp(min, max)` on the multiplier.
- Breeding windows are keyed by quartile index (0–3) of `yearFraction`, with a hemisphere flip
  for southern cells. Creatures do not read season names; they read the multiplier.

### Interaction with existing systems

- `energy.ts`: seasonal metabolism multiplies base metabolic cost; energy source and
  total energy budget are unchanged.
- `producer.ts`: seasonal factors multiply the existing growth formula. Dormant producers keep
  their biomass; they do not decay (decay is a separate, existing path).
- `world.ts` hydrology: evaporation is a per-tick update to `waterDepth` and `waterTable`. This is
  the first per-tick hydrology change; it must be deterministic and bounded (see below).
- `temperature` (static baseline) is **never overwritten**. Seasonal temperature is a derived
  read via `seasonalTemp(φ, t)`, so biome classification and saves stay stable.

## Save/load and determinism

- **Stored:** `SeasonConfig` (all fields), `tick` (already stored), and the `SEASON_EFFECTS`
  table version. **Not stored:** per-cell seasonal values, which are recomputed.
- **Save version:** adding a config block requires a payload bump only if the loader must reject
  older versions. Preferred: keep `ENGINE_SAVE_VERSION = 1` and treat a missing season block as
  `{ enabled: false }`, so old saves reload identically. Confirm with the child that owns the
  save migration.
- **Old-save default:** `enabled: false`. Old saves must produce identical event logs and snapshots
  before and after the change. This is the main regression test.
- **RNG:** no new stream. `RNG_STREAM_VERSION` stays 1. If evaporation consumes randomness later
  (it should not in v1), it must reuse an existing stream or justify a new stream and version bump.
- **Determinism tests:** same seed + same `SeasonConfig` = identical full-state snapshot at
  ticks 0, 240, 960, 9600. Seasons disabled = identical to pre-change snapshot.
- **Replay:** because seasons are a pure function of tick, replay from any saved tick needs no
  extra state. Scrubbing to tick T recomputes calendar and curves directly.

## Per-tick cost

- Latitude fields and the curve table are precomputed once per world.
- Per tick, per row: one table lookup and one multiply, not per cell. Cost is O(rows), not O(cells).
- Evaporation and growth multipliers are per row per tick and cached until the calendar quartile
  or the table index changes.

## UI needs

- **Calendar bar:** current year, day of year, season name for each hemisphere, and progress
  within the year. Must show "equator: no seasons" when the cursor is on the equator row.
- **Forecast strip:** next season boundary in ticks for the selected hemisphere, with the
  predicted changes in growth, metabolism and breeding multiplier. Derived from the same pure
  functions, so forecast and simulation cannot disagree.
- **Tile tooltip:** latitude, daylight, seasonal temperature, snow cover and current evaporation
  multiplier for the hovered cell.
- **Overlay toggle:** temperature and daylight heat overlay; a dormancy overlay for snow.
- **Stats panel:** producer biomass and birth counts per season, so players can see the cycle.
- **God Mode:** `yearLengthTicks`, `axialTiltDeg`, `phaseOffsetTicks` and `enabled` are editable
  only before a world starts, or on a branch. Changing them mid-run would break replay history.

## Proposed child issues (ordered)

1. **Calendar and season config schema** — `calendarAt`, `SeasonConfig` defaults, validation
   (year length bounds, integer checks), latitude field, unit tests on wrap-around and phase offset.
   Depends on: #349.
2. **Fixed-point seasonal curves** — integer sine table, `insolation`, `daylight`,
   `seasonalTemp`, `snowCover`, equator-stability and hemisphere-opposition tests.
   Depends on: 1.
3. **Producer and evaporation seasonal multipliers** — wire growth and per-tick evaporation
   through `SEASON_EFFECTS`; bounded evaporation tests; dormancy keeps biomass.
   Depends on: 2.
4. **Metabolism, reproduction and migration responses** — breeding windows, cold metabolism,
   dormancy. Migration is listed in #121 but is scoped here only if the lead confirms (see Q3).
   Depends on: 2.
5. **Save/load migration and determinism snapshots** — season block in save payload, missing
   block defaults to disabled, old-save fixture replay, same-seed snapshots at fixed ticks.
   Depends on: 1; should land before 3 and 4 are enabled by default.
6. **Calendar and forecast UI** — calendar bar, forecast strip, tile tooltip, overlay, read-only
   config display. Depends on: 1, 2.
7. **Multi-year balance and demo** — 10-year seeded runs per hemisphere, extinction and biomass
   stability checks, demo scenario with seasons enabled. Depends on: 3, 4, 5.

Dependency order: 1 → 2 → {3, 4}; 1 → 5; {1, 2} → 6; {3, 4, 5} → 7.

## Open questions with recommended defaults

1. **Year length default.** Recommend 960 ticks (four 240-tick seasons), configurable per world.
2. **Hemisphere split.** The grid has no hemisphere concept. Recommend top half (row 0 side)
   as north, with an explicit `gridMaxLatitudeDeg` of 45.
3. **Migration in this epic.** #121 lists migration, but it is a movement feature. Recommend
   deferring migration to child 4 as a breeding and dormancy-driven movement bias only, and
   leaving full migration to a follow-up issue.
4. **Default enabled state for new worlds.** Recommend `enabled: true` for new worlds, `false`
   for loaded legacy saves. Seasons must be visible but cannot break old replays.
5. **Evaporation randomness.** Recommend none in v1; evaporation is a deterministic function of
   seasonal temperature and daylight.
6. **Axial tilt range.** Recommend 0–30 degrees with 23.5 as the default. Zero tilt yields no
   seasons anywhere, which is a useful test case.
7. **Cross-platform trig.** Recommend the integer sine table (see Fixed-point boundary) rather
   than `Math.sin` in the simulation path. Confirm the table size with the child owner of 2.
8. **Polar behaviour.** Recommend saturating daylight at 0 or 1 near the poles, with no special
   polar-night rules in v1.
9. **Stats granularity.** Recommend per-season aggregation in the stats panel, not per-tick
   charts, to keep UI cost bounded.

## Non-goals (v1)

- Seasonal changes to elevation, substrate, or biome assignment.
- Ocean currents, climate feedback, or weather events.
- Per-creature hibernation state beyond the dormancy multiplier.
- Any change to `RNG_STREAMS` or `RNG_STREAM_VERSION`.
