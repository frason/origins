# Dynamic World: Soil and Water Design

Status: proposal only; no implementation in issue #41.

## Goals

- Make substrate and water create persistent, readable ecological niches.
- Keep generation and simulation deterministic for a given seed and constants.
- Support solar, geothermal, chemical, radioactive, and mixed producers without assuming plants.
- Add pressure and opportunity without making creatures die from opaque hidden meters.

## Cell model

Keep the existing `elevation`, `moisture`, `temperature`, `biome`, energy, nutrients,
producer biomass, toxicity, and producer archetype fields. Add:

```ts
type SubstrateType = 'sand' | 'loam' | 'clay' | 'peat' | 'rock' | 'sediment';

interface Cell {
  substrate: SubstrateType;
  waterDepth: number;       // 0 dry; 0..1 shallow to deep water
  waterTable: number;       // 0..1 subsurface availability on dry cells
  dissolvedNutrients: number;
  salinity: number;         // 0 fresh; 1 hypersaline
}
```

`biome` remains a derived display/category field. Substrate and hydrology are physical state.
This prevents rules such as “forest soil is always loam” and allows wetlands to dry or spread.

### Existing-field interactions

- `energy` remains source energy; water never creates energy by itself.
- `nutrients` represents substrate-bound nutrients; `dissolvedNutrients` moves with water.
- `producerBiomass` remains total biomass until producer populations become explicit entities.
- `toxicity` can dissolve and diffuse through connected water at a separately tuned rate.
- `moisture` becomes a derived surface condition from rain/climate, water table, and drainage.

## Data-driven substrate effects

Create a `SUBSTRATE_TRAITS` table rather than branching on names in `producer.ts`:

```ts
interface SubstrateTraits {
  nutrientRetention: number;
  waterRetention: number;
  drainage: number;
  toxicityRetention: number;
  energyAffinity: Record<EnergyType, number>;
}
```

Example tendencies:

| Substrate | Retention | Drainage | Energy affinities |
|---|---:|---:|---|
| sand | low | high | solar neutral, chemical low |
| loam | high | medium | broadly neutral |
| clay | high | low | chemical high, solar neutral |
| peat | very high | low | chemical high, geothermal low |
| rock | very low | high | geothermal/radioactive high |
| sediment | high | low | chemical and mixed high |

Producer growth becomes:

`base growth × source efficiency × archetype traits × substrate affinity × water suitability × nutrient suitability × toxicity penalty`

Each producer archetype gains preferred water-depth, moisture, salinity, and substrate ranges.
Out-of-range conditions reduce growth; they do not hardcode “plants cannot grow here.” Algae,
lithotrophs, and chemosynthesizers can therefore occupy water, sediment, or rock niches.

## Water generation and updates

1. Generate elevation and temperature as today.
2. Select deterministic basin/outlet cells from elevation and seeded rainfall noise.
3. Route water downhill with stable neighbor ordering; local minima retain lakes.
4. Mark ocean-connected low basins saline; inland basins begin fresh.
5. Derive substrate from elevation, slope, water flow, temperature, and seeded noise.
6. Derive biome last from physical fields.

For the first implementation, hydrology is static after generation. A later phase may add slow
evaporation, rainfall, flow, and seasonal changes. Static water delivers gameplay without a
costly per-tick fluid simulation or replay complexity.

## Creature movement and survival

Add traits only when their gameplay is implemented:

```ts
aquaticAdaptation: number;  // 0..1, efficient movement in depth
waterNeed: number;          // energy-independent hydration demand
saltTolerance: number;      // 0..1
```

- Movement cost is multiplied by water depth and reduced by `aquaticAdaptation`.
- Deep water is blocked only when effective traversal cost exceeds a configured maximum; it is
  not universally impassable.
- Path selection uses traversal cost, so land creatures route around lakes when practical.
- Aquatic creatures receive the inverse pressure: moving onto dry cells is expensive.
- Drinking is a deliberate decision at adjacent fresh/shallow water, not automatic at range.
- Hydration declines slowly and first increases metabolism; only prolonged deprivation kills.
- Saline water satisfies hydration according to salt tolerance and may add toxicity otherwise.
- UI tile details show depth, salinity, substrate, and traversal cost for the selected creature.

Hydration must use integer/fixed-step updates and existing seeded decisions. It must never use
wall-clock time or unordered path tie-breaking.

## Migration plan

1. **Schema:** add fields and enums to `world.ts`, snapshots, serialization, and tile UI; give
   old saves deterministic defaults (`loam`, depth 0, table from moisture, salinity 0).
2. **Generation:** extract terrain generation into staged elevation → hydrology → substrate →
   biome functions with same-seed snapshot tests and basin invariants.
3. **Producers:** add substrate/water preference tables and pure growth-multiplier tests before
   wiring them into `growProducers`.
4. **Movement:** introduce a pure `getTraversalCost(creature, cell)` function; update movement
   and food targeting to choose lowest-cost deterministic routes.
5. **Hydration:** add creature state and drink decisions after movement is stable; expose God
   Mode constants for depletion, recovery, and maximum traversal cost.
6. **UI/balance:** add water/substrate rendering, tile explanations, demo scenarios, 500-tick
   determinism/stability tests, and migration fixtures.

## Performance and determinism

- Store fields in the existing flat cell array; avoid per-cell object graphs or occupant lists.
- Precompute static traversal/substrate multipliers and water connectivity during generation.
- Recompute paths only when a target changes; cap search radius by vision range.
- Use fixed neighbor order and seeded RNG only for true ties.
- Include all new fields and creature hydration in full-state determinism snapshots.

## Open questions for the client

1. Should the first version have static lakes/oceans, or are seasons and changing shorelines core?
2. Should ordinary land creatures be able to cross deep water slowly, or is it a hard barrier?
3. Should hydration be a visible individual meter, a species-level trait, or deferred initially?
4. Do you want freshwater and saltwater ecosystems to be distinct in the first implementation?
5. Can God Mode paint/edit substrate and water, or only tune generation and survival constants?
6. Should flooding move corpses/toxicity, or should water initially affect only growth/movement?
