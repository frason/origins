# Organism Size Classes and Tile Occupancy

Status: design proposal for issue #42; no implementation is included.

## Goals

- Let bacteria, fungi, plants, insects, and large animals coexist at useful scales.
- Keep `Traits.size` continuous so mutation and evolution remain gradual.
- Bound work per tile and support 1,000+ macro creatures without losing determinism.
- Make crowding visible and understandable in the tile inspector and God Mode.

## Size classes

Size class is derived from `Traits.size`; it is not another mutable or serialized trait.

| Class | Size range | Representation | Tile limit |
| --- | --- | --- | --- |
| Micro | `0.10–<0.25` | population cohort | 64 cohort units |
| Small | `0.25–<0.75` | individual | 8 individuals |
| Medium | `0.75–<2.50` | individual | 2 individuals |
| Large | `2.50–10.00` | individual | 1 individual |

Each tile has two independent occupancy layers:

- Microbial layer: capacity 64; each cohort consumes units based on biomass.
- Macro layer: capacity 8; small costs 1, medium costs 4, and large costs 8.

The per-class limits also apply. This permits microbes beneath a large animal while preventing
eight medium animals or mixed macro occupants from exceeding physical space. Plants use their
derived class but may later need a rooted-canopy rule separate from mobile organisms.

Thresholds and limits are initial tuning values, not promises of final balance.

## Movement, birth, and mutation

- Movement and reproduction create intents; they do not mutate occupancy immediately.
- Destination capacity is reserved in deterministic priority order using a hash of seed, tick,
  and stable organism ID. Array order must never decide admission.
- A rejected move stays in its origin tile; a rejected birth does not spend birth energy.
- If size mutation crosses a class boundary, the new class applies at the next tick boundary.
- If that makes a tile over capacity, existing occupants remain but cannot add or reproduce there;
  movement pressure should resolve crowding naturally. Do not silently delete organisms.

## Microbes and decomposers

Micro organisms are represented as cohorts, not thousands of `Creature` records. A cohort is one
species/lineage in one tile with population count, biomass, energy reserve, average traits, age,
and generation. Cohorts split only when lineage mutation is significant and merge when compatible.

Decomposer is an ecological role, distinct from the current herbivore/carnivore/omnivore/scavenger
feeding strategies. Scavengers consume corpse chunks directly; decomposer cohorts convert corpse
energy into cohort energy and dissolved tile nutrients with an explicit loss fraction. This keeps
energy accounting closed and gives fungi and bacteria a different niche from scavenging animals.

Fungi should spread primarily between neighboring tiles; bacteria should grow primarily within a
tile and disperse under pressure. Exact biological differences require client direction below.

## Data model

`world.ts`:

- Keep serialized `Cell` environmental: terrain, solar energy, nutrients, water, and corpses.
- Do not embed mutable organism objects or ID lists in every cell.
- Add a runtime `SpatialIndex`, keyed by cell index, with macro creature IDs and micro cohort IDs.
- Rebuild or incrementally update the index at tick boundaries in stable ID order.
- Expose occupancy summaries for the tile inspector without making them simulation state.

`creature.ts` and engine state:

- Keep `Creature` for individually simulated small, medium, and large organisms.
- Add pure helpers `sizeClass(size)` and `macroOccupancyCost(size)`.
- Add `MicroCohort` as a separate entity and `microCohorts` beside `creatures` in `EngineState`.
- Add `ecologicalRole` to species identity rather than duplicating it on every creature.
- Version serialization before adding cohorts; snapshot ordering is always stable by ID.

## Performance and determinism

- Build the spatial index in O(creatures + cohorts) each tick, then query only local cells.
- Replace feeding, mating, and collision scans over all creatures with indexed local queries.
- Aggregate microbial populations; population count must not equal engine object count.
- Resolve intent batches with preallocated buffers where profiling justifies it.
- Benchmark 1,000 macro creatures and 10,000+ represented microbes at normal and fast speeds.
- Add same-seed snapshots covering full tiles, rejected intents, cohort split/merge, and class changes.

## Migration plan

1. Add size-class/capacity helpers and boundary tests without changing behavior.
2. Add the runtime spatial index and prove snapshots remain unchanged.
3. Enforce macro capacity for movement and birth with deterministic intent resolution.
4. Add versioned `MicroCohort` state, serialization, and cohort lifecycle tests.
5. Route corpse decomposition through cohorts with energy-conservation tests.
6. Add occupancy, crowding, and decomposer details to tile/species UI and God Mode.
7. Tune only after deterministic benchmarks and a sustainable demo-world run.

Each phase should be independently releasable and preserve old saves through migration or an
explicit save-version error.

## Client decisions required before implementation

1. Should microbes be directly created/edited in God Mode, or emerge from seeded ecology?
2. Should a micro cohort render as a subtle colony layer, individual dots, or only tile statistics?
3. May microbes always coexist with macro organisms, or should trampling/terrain reduce capacity?
4. Are the proposed limits (8 small, 2 medium, 1 large) the desired gameplay scale?
5. Should fungi and bacteria be separate kingdoms with distinct traits, or decomposer strategies?
6. Should rooted plants share macro capacity with animals or receive a separate canopy/root layer?
7. When size mutation crosses a class, should crowding block growth or allow temporary overflow?
8. Can predators consume microbial cohorts, and if so, which size classes or traits permit it?
