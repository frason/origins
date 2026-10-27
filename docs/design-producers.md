# Evolving Producer Species and Plant Competition: Design

Status: proposal only; docs only, no implementation under issue #351. Epic: #122 (depends on #351).

## Goals

- Replace undifferentiated producer biomass with a small number of **aggregated, evolving producer
  populations per tile**, each with lineage traits.
- Let producers compete, spread, adapt, speciate, and go extinct, while staying understandable to players.
- Never create one simulation object per plant. Cost must scale with tiles × populations, not with plant count.
- Stay fully deterministic: same seed and config produce identical snapshots. Only seeded RNG streams
  from `src/simulation/rng.ts` are used.
- Preserve current behaviour for existing saves until producer evolution is explicitly enabled.

## Existing model this builds on

- `src/simulation/producer.ts`: growth formula (`calculateProducerGrowth`, `growProducers`), biome
  productivity, energy-type multipliers, substrate/water/salinity/moisture suitability, nutrient capacity,
  `MAX_PRODUCER_BIOMASS = 100`, `PRODUCER_MAINTENANCE_RATE`. This remains the baseline rule set.
- `src/simulation/producerTypes.ts`: `ProducerArchetype`, `PRODUCER_TRAITS`, and
  `PRODUCER_ARCHETYPE_BY_BIOME`. Archetypes are the *founder* templates; evolving populations are
  derived from them, not replacements for them.
- `src/simulation/rng.ts`: existing streams include `MUTATION`, `DISPERSAL`, `ENVIRONMENTAL_STRESS`,
  and `WORLD_GENERATION`. `RNG_STREAM_VERSION = 1`. This design needs **no new stream**, so
  `RNG_STREAM_VERSION` must not change. If a later child needs a stream, it must justify the bump.
- `src/simulation/enginePersistence.ts`: `ENGINE_SAVE_VERSION = 1`; the loader currently rejects any
  payload whose version differs. New producer state must therefore be an optional block (see Save/load).
- `src/simulation/species.ts`, `speciation.ts`, `founderSpecies.ts`, `founderTraits.ts`: animal species and
  lineage machinery. Producer lineages should reuse the naming and lineage-id conventions where possible.
- `src/simulation/dispersal.ts` and `decomposition.ts`: existing dispersal and nutrient return paths that
  producer seeding and corpse nutrients must integrate with.

## Data model

Producers are stored per tile as a small, bounded list of **populations**. A population is an aggregate,
not a plant.

```ts
interface ProducerPopulation {
  lineageId: string;        // stable id, e.g. "P-<tile>-<birthTick>-<index>" or a hash of parent + tick
  archetype: ProducerArchetype; // founder template it descends from (grass, shrub, tree, aquatic, chemo, ...)
  biomass: number;          // aggregate biomass units, fixed precision (see Determinism)
  traits: ProducerEvolvableTraits;
  ageTicks: number;         // integer, for succession and lineage stories
  parentLineageId: string | null;
}

interface ProducerEvolvableTraits {
  growthRate: number;       // base growth multiplier
  carryingCapacityShare: number; // share of tile capacity this lineage can hold
  defense: number;          // reduces herbivore feeding efficiency (0..1)
  energyDensity: number;    // energy per biomass unit delivered to consumers
  nutrientDemand: number;   // nutrients per biomass unit
  moistureOptimum: number;     // preferred moisture centre
  temperatureOptimum: number;  // preferred temperature centre
  dispersalRange: number;   // integer tiles per dispersal event
  seedOutput: number;       // dispersal volume per tick at maturity
}

interface TileProducerState {
  populations: ProducerPopulation[]; // sorted by lineageId; hard cap MAX_POPULATIONS_PER_TILE (default 4)
  totalBiomass: number;             // derived, cached; not authoritative
}
```

Notes:

- Trait names are proposals; the child that owns the schema (child 1) finalises them.
- `PRODUCER_TRAITS` values define the founder defaults. An evolving trait is the founder value plus a
  bounded, deterministic offset per lineage, clamped to the trait's declared range.
- `populations` is capped per tile. When the cap is exceeded, the smallest population merges into its
  closest relative (same archetype, nearest trait vector) or is removed. The rule is deterministic and
  documented in the child that implements it.
- Biome-level defaults (`PRODUCER_ARCHETYPE_BY_BIOME`) seed the founders. Non-plant energy producers
  (chemosynthetic, geothermal, radioactive-energy producers) use the same structure with different
  archetypes and energy-source multipliers from `ENERGY_TYPE_MULTIPLIERS`. We never assume plants.

## Growth, carrying capacity, and competition

Per tick, per tile, after the existing energy generation step (simulation flow step 2, "Producer Growth"):

1. **Resource budget.** Each tile has an available-resource budget derived from existing cell state
   (energy, nutrients, moisture, toxicity). The budget is shared by populations on the tile.
2. **Growth.** Each population grows by the existing growth formula scaled by its own traits:
   `growth_i = calculateProducerGrowth(...) × traits.growthRate × suitability_i`, where suitability uses
   the existing `calculateSuitabilityMultiplier` family with the lineage's optimum instead of the archetype's.
3. **Carrying capacity.** Tile capacity is `MAX_PRODUCER_BIOMASS × tileFertility`. Each population's
   effective capacity is `capacity × carryingCapacityShare`, reduced by the total biomass on the tile.
4. **Competition.** When total demand exceeds the budget, the budget is allocated proportionally to
   `biomass_i × growthRate_i`, with a fixed-order tie-break on `lineageId`. Competitive exclusion emerges
   from this rule; no special-case "tree beats grass" logic.
5. **Maintenance and decay.** Existing `PRODUCER_MAINTENANCE_RATE` applies per population. Biomass that
   falls below a floor (`MIN_POPULATION_BIOMASS`, default 0.01) is removed and its nutrients returned via
   the existing nutrient recycling path.

Succession emerges from steps 4–5: fast-growing archetypes dominate early, slow high-capacity
archetypes (trees) displace them as shading and nutrient demand build. Shading is modelled as a
tile-level `canopyCover` derived from tree and shrub biomass, which reduces grass growth. No per-plant
shading.

## Dispersal and colonization

- Each population with `seedOutput > 0` emits seeds per tick into a **dispersal pool**, spread over
  neighbouring tiles within `dispersalRange`.
- Seeds arrive as a new or increased population on the target tile only if the target tile's suitability
  for that lineage is above `COLONIZATION_THRESHOLD` (default 0.2).
- Randomness for target choice and arrival comes from the existing `DISPERSAL` stream, keyed by
  `(tick, sourceTileIndex, lineageId)` so the draw order is fixed.
- Colonization of an empty tile creates a population with `parentLineageId` set. This is what gives the
  lineage tree depth.

## Extinction

- A population is extinct when biomass falls below `MIN_POPULATION_BIOMASS` for `EXTINCTION_GRACE_TICKS`
  consecutive ticks (default 24). The grace period avoids flicker from single-tick dips.
- Global extinction (no population of a lineage left anywhere) is logged as an event and drives the
  existing extinction-reaction UI.
- Disasters (`disasters.ts`) and seasonal dormancy (`docs/design-seasons.md`) act only through the
  growth and carrying-capacity inputs above. They do not directly delete populations.

## Mutation, gene flow, and speciation

- **Mutation.** Each reproduction event from a population (seed arrival that creates a new lineage
  on a tile, or a rare in-place variant) applies a per-trait offset drawn from the `MUTATION` stream.
  Offsets are bounded by the trait's declared range and by `PRODUCER_MUTATION_SCALE` (default 0.05 of
  range per event).
- **Gene flow.** Populations on adjacent tiles of the same archetype share a small fraction of their
  trait mean each tick (`GENE_FLOW_RATE`, default 0.01). This is a deterministic weighted average, with no
  RNG. It keeps neighbouring populations from diverging faster than they should.
- **Lineage divergence.** A new lineage is created when its trait vector differs from every existing
  population of the same archetype by more than `SPECIATION_DISTANCE` (default 0.25, normalized over
  the evolvable traits). The new lineage gets a new `lineageId` and a parent link.
- **Speciation naming.** Lineage display names come from `speciesNames.ts` conventions, assigned by
  lineageId hash so names are deterministic.
- Animal-species speciation (`speciation.ts`) is not changed by this epic. Producer speciation is a
  parallel path that writes to the producer lineage table only.

## Save/load and determinism

- **Stored:** `TileProducerState` for every tile that has populations, the producer lineage table
  (id, archetype, parent, creation tick, name), and a `producerEvolutionConfig` block with the constants
  used (`MAX_POPULATIONS_PER_TILE`, `GENE_FLOW_RATE`, `SPECIATION_DISTANCE`, etc.) plus a version number.
- **Not stored:** `totalBiomass` caches and per-tick intermediate budgets. These are recomputed on load.
- **Save version:** keep `ENGINE_SAVE_VERSION = 1` and add the producer block as an optional field.
  A missing block means "producer evolution disabled, use legacy per-tile biomass". This is the same
  approach `design-seasons.md` proposes for its config block. Confirm with the child that owns the
  save migration. Do not silently drop the block on save.
- **Legacy saves:** loaded with `evolution: false`. Their event logs and snapshots must be identical
  before and after this change. This is the primary regression test.
- **Fixed precision.** Biomass and trait values are stored and compared at a fixed precision (for example
  1e-6, rounded at each write). Sums iterate populations in `lineageId` order, never in insertion or
  hash-map order, so floating-point addition order is fixed.
- **RNG.** Only `MUTATION` and `DISPERSAL` streams are used, keyed by tick and tile/lineage. Gene flow
  and competition are RNG-free. `RNG_STREAM_VERSION` stays 1.
- **Determinism tests.** Same seed and config produce identical full-state snapshots at ticks 0, 240,
  960, and 9600. Evolution disabled produces a snapshot identical to the pre-change snapshot.
- **Replay.** Replay from a saved tick uses the saved producer state and the same stream keys, so
  scrubbing to tick T needs no extra history.

## Performance notes

- Target: a 100×100 grid (10,000 tiles) with at most `MAX_POPULATIONS_PER_TILE` populations per tile
  (worst case 40,000 populations). Per-tick cost must stay O(tiles × populations), and the per-tick
  budget should remain well inside the 16 ms world-update target in `CLAUDE.md`.
- Only tiles with populations, or tiles adjacent to one that changed, are visited each tick (active-tile
  set). Empty ocean or bare-rock tiles cost nothing.
- Populations are stored in typed arrays or flat struct-of-arrays per tile, not one object per plant.
- Trait distance and gene flow are computed per tile, not per pair of plants.
- The large-world test (for example 1000×1000 at a sparse population density) is a performance check,
  not a correctness check; it is a child issue (see below).

## UI needs

- **Tile inspector:** list of populations on the hovered tile with lineage name, archetype, biomass,
  share of tile capacity, and key traits (growth, defense, energy density, dispersal range).
- **Lineage view:** producer lineage tree (parent links), with birth tick, extinction tick, and
  current distribution (tile count).
- **Distribution overlay:** tile colour by dominant producer lineage, plus a biomass heat overlay.
- **Stats panel:** producer biodiversity (number of living lineages), dominant lineage share, and
  extinction and speciation counts per window.
- **Evolutionary story:** event entries for colonization, extinction, speciation, and succession
  milestones, using the existing event log.
- **Tooltips:** every trait shows a plain-language explanation (for example "defense: reduces how
  much herbivores can eat").
- **God Mode:** `evolution` on/off and the constants in `producerEvolutionConfig` are editable only
  before a world starts, or on a branch. Changing them mid-run would break replay history.

## Proposed child issues (ordered)

Each child is worker-sized and should land as its own PR. Child issues are for the lead to create;
this document does not create them.

1. **Producer population schema and legacy equivalence** — `ProducerPopulation`, `TileProducerState`,
   trait ranges, founder construction from `PRODUCER_TRAITS`, optional save block with `evolution: false`
   default, legacy snapshot-equivalence test. Depends on: #351 (this doc).
2. **Per-tile growth and competition** — resource budget, proportional allocation, carrying capacity,
   maintenance, extinction floor and grace period, nutrient return. Unit tests on exclusion and
   succession ordering. Depends on: 1.
3. **Dispersal and colonization** — seed emission, neighbour spread, suitability threshold, `DISPERSAL`
   stream draws, population cap merge rule. Determinism test on fixed seed. Depends on: 2.
4. **Mutation, gene flow, and lineage divergence** — `MUTATION` offsets, RNG-free gene flow, speciation
   distance check, lineage table entries, naming hook. Depends on: 2.
5. **Save/load and determinism snapshots** — save block round-trip, legacy save fixture replay, same-seed
   snapshots at ticks 0, 240, 960, 9600, and fixed-precision checks. Should land before 3 and 4 are
   enabled by default. Depends on: 1.
6. **Producer UI** — tile inspector, distribution overlay, lineage view, stats panel counts, tooltips.
   Read-only until the data is stable. Depends on: 1, 4.
7. **Performance and large-world tests** — active-tile set, struct-of-arrays layout if profiling
   requires it, 100×100 and sparse 1000×1000 benchmarks against the 16 ms budget. Depends on: 3, 4.
8. **Multi-generation balance and demo** — long seeded runs (succession and extinction checks, no total
   collapse in the demo scenario), demo world with evolution enabled, and tuning of the constants above.
   Depends on: 2, 3, 4, 5.

Dependency order: 1 → {2, 5}; 2 → {3, 4}; 1 → 6; {3, 4} → 7; {2, 3, 4, 5} → 8. Children 3 and 4 may
run in parallel. Child 5 must not be skipped even though it is listed after 2: it gates enabling
evolution by default.

## Open questions with recommended defaults

1. **Population cap per tile.** Recommend `MAX_POPULATIONS_PER_TILE = 4`. Enough for grass, shrub,
   tree, and one variant, while keeping worst-case cost bounded.
2. **Biomass units.** Recommend keeping the existing `MAX_PRODUCER_BIOMASS` scale (100) so existing
   balance and calibration (`biomassCalibration.ts`) still apply.
3. **Evolution default for new worlds.** Recommend `evolution: true` for new worlds once child 8 passes,
   and `false` for loaded legacy saves. Until then, default new worlds to `false` behind a flag.
4. **Separate stream for producers.** Recommend reusing `MUTATION` and `DISPERSAL`. Add a new stream
   only if draw-order collisions appear in testing, and then bump `RNG_STREAM_VERSION` deliberately.
5. **Gene flow vs. speciation.** Recommend gene flow only between adjacent tiles of the same archetype,
   so it cannot erase speciation between archetypes.
6. **Non-plant producers.** Recommend the same population structure with archetypes for chemosynthetic
   and geothermal producers, using `ENERGY_TYPE_MULTIPLIERS`. Do not add a separate code path.
7. **Shading model.** Recommend a tile-level `canopyCover` derived from tree and shrub biomass, not
   per-plant shading, to keep cost O(tiles).
8. **Extinction grace period.** Recommend 24 ticks, so a single bad season does not erase a lineage.
9. **Lineage naming.** Recommend deterministic names from `speciesNames.ts` keyed by lineageId hash, with
   player renaming added later (out of scope here).
10. **Trait count.** Recommend the nine evolvable traits in the schema above for v1. Adding more is a
    follow-up, and each addition must include a trait range and tooltip text.

## Non-goals (v1)

- One simulation object per plant, or any per-plant position tracking.
- Animal speciation changes (`speciation.ts` stays as is).
- Changes to `RNG_STREAMS` or `RNG_STREAM_VERSION` unless child 3 or 4 justifies it.
- Seasonal rules (owned by `docs/design-seasons.md`); this design only consumes their growth inputs.
- Player-directed plant breeding or genetic editing tools.
- Multi-tile populations spanning more than one tile.
