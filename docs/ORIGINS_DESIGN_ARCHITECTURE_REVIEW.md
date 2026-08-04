# Origins: Game Design and Architecture Review

**Repository:** [frason/origins](https://github.com/frason/origins)  
**Reviewed commit:** `763d21eb0c29c9f5dc8e909bea1da4dd1e8a2c72`  
**Review date:** 2026-07-19  
**Playable build:** `http://localhost:5174`

**Companion implementation plan:**
[Origins Beta Prioritization Plan](./ORIGINS_BETA_PRIORITIZATION_PLAN.md)

## Executive Summary

Origins has a strong deterministic simulation foundation and unusually good replay,
history, and intervention infrastructure for an early evolution sandbox. Its largest
problem is not technical correctness. It is a gap between the game's promise and the
causal systems currently implemented.

The game presents corpse-driven bacterial mutation hotspots as a defining mechanic,
but the engine currently models corpses as nutrient and toxicity sources. Toxicity
suppresses producer growth; it does not affect mutation probability, and bacterial
swarms do not exist as entities or environmental fields. Several traits also mutate
and contribute to speciation without affecting fitness or behavior. This creates
statistical trait drift that can be mistaken for adaptation.

The most urgent product issue is the first-run balance. Across the three seeds in the
project's sustainability test matrix, the default settings cause complete extinction
by ticks 130-171 with zero mutations. The existing balanced-longevity preset survives
to tick 500 with 27-63 mutations and 3-5 living species. The successful game already
exists in the tuning data, but it is hidden behind an optional God Mode button.

## Scorecard

| Area | Score | Assessment |
| --- | ---: | --- |
| Technical foundation | 8/10 | Deterministic, modular, well tested, and replayable |
| Systemic emergence | 6/10 | Real food-web coupling, but limited behavioral depth |
| Default balancing | 3/10 | Tested defaults collapse before meaningful evolution |
| Player agency | 6/10 | Strong intervention history, weak tradeoffs and spatial powers |
| Visualization | 5/10 | Distinctive visual identity, insufficient causal legibility |
| Retention | 4/10 | Strong ingredients without a durable discovery/challenge loop |

## 1. Core Game Design and Systemic Balancing

### What Already Works

Food, metabolism, reproduction, predation, scavenging, decomposition, nutrients,
toxicity, and producer regrowth form a genuine closed loop. Local reproductive-resource
checks are especially valuable because reproduction requires nearby appropriate food,
not merely stored energy. Speciation also requires a divergent lineage to persist across
multiple organisms and generations instead of declaring every mutation a new species.

Relevant implementation:

- `src/simulation/engine.ts`: simulation update order, reproduction, population pressure.
- `src/simulation/energy.ts`: feeding, metabolism, reproduction energy transfer.
- `src/simulation/decomposition.ts`: corpse decay, nutrient return, toxicity.
- `src/simulation/speciation.ts`: divergence and species-establishment thresholds.

### Critical Default-Balance Failure

The deterministic 500-tick evaluation produced the following results:

| Seed | Preset | Ecosystem lifetime | Final population | Mutations | Final species |
| ---: | --- | ---: | ---: | ---: | ---: |
| 12345 | Defaults | 171 | 0 | 0 | 0 |
| 54321 | Defaults | 130 | 0 | 0 | 0 |
| 99999 | Defaults | 170 | 0 | 0 | 0 |
| 12345 | Balanced longevity | 500+ | 18 | 27 | 3 |
| 54321 | Balanced longevity | 500+ | 49 | 42 | 4 |
| 99999 | Balanced longevity | 500+ | 70 | 63 | 5 |

The values in `BALANCED_LONGEVITY_PRESET` should become the first-run baseline or the
starting point for a new default-tuning pass. "Apply longevity" should remain a lab
preset for comparison, not the hidden prerequisite for seeing evolution.

The opening should reliably create within roughly 90 seconds:

1. A visible ecological pressure.
2. An understandable heritable variation.
3. A consequential player decision.

### Corpse-Driven Mutation Is Not Yet Causal

The current engine behavior is:

1. A corpse returns some remaining energy as nutrients.
2. It deposits radial toxicity for the duration of decomposition.
3. Toxicity dissipates geometrically.
4. Toxicity reduces local producer growth.
5. Mutation remains a global per-birth probability.

There is no bacterial population or field, and local corpse conditions do not change
mutation probability. The implementation therefore supports "death creates temporary
ecological scars," but not yet "death creates dangerous evolutionary hotspots."

Model decomposition with at least four separate cell fields:

```ts
interface CellEcology {
  nutrients: number;
  corpseBiomass: number;
  bacteriaDensity: number;
  toxicity: number;
}

const localMutationRate = clamp(
  baseMutationRate * (1 + 3 * cell.bacteriaDensity),
  baseMutationRate,
  0.6
);

const embryoViability = Math.exp(
  -cell.toxicity * creature.traits.toxicitySensitivity
);
```

This creates a useful risk/reward curve: moderate decomposition produces nutrients and
evolutionary novelty, while severe contamination suppresses producer recovery and
offspring survival. Bacteria should initially be a deterministic diffusing scalar field,
not thousands of individual agents.

### Replace Abstract Global Punishment With Local Ecology

The global population cap, random overcrowding deaths, dominant-species reproduction
suppression, and monoculture mortality successfully prevent population explosions.
They are also visibly game-like corrections that do not emerge from the landscape.

Prefer the following negative feedback loops:

- Local biomass depletion and regrowth lag.
- Density-dependent reproduction and movement pressure.
- Pathogen transmission that rises with local density and genetic similarity.
- Inbreeding load in small or isolated populations.
- Waste and toxicity accumulation around dense colonies.
- Predator functional response to concentrated prey.
- Territorial or nesting capacity tied to organism size.

Keep the global population cap as a performance failsafe rather than the primary ecology.

### Mutation Is Not The Same As Evolution

Several mutable traits have little or no effect beyond contributing to divergence:

- `brainSize`
- `consciousnessLevel`
- `communication`
- `collectiveConnection`
- `hearingRange`
- `reproductionRate`
- Most direct effects of armor and bone density

A trait should not be promoted in the UI as an adaptation until it changes survival,
behavior, reproduction, or resource acquisition in an observable context. Otherwise,
the game risks the most common evolution-simulator failure: decorative numbers drift
while the player is told that selection occurred.

## 2. Playability and Player Agency

### Intervention Infrastructure

The existing architecture is strong:

- Setting changes are recorded as intervention events.
- Events capture a pre-intervention ecosystem checkpoint.
- The UI evaluates population, species, lineage, energy, and biomass changes afterward.
- Fixed checkpoints allow the player to replace the current future.
- Recipe replay can reproduce interventions deterministically.

This should become the foundation for explicit counterfactual experimentation: branch
the timeline, apply an intervention, and compare the modified future with the untouched
control world.

### Separate Sandbox and Stewardship Rules

**Laboratory Sandbox** should provide unlimited constants and spatial tools. The world
should remain visibly marked as modified so outcomes are not confused with baseline runs.

**Stewardship Challenge** should provide limited, forecastable interventions with a cost,
cooldown, or ecological debt. Intervention costs create meaningful choices without
pretending that the player is a neutral observer.

Useful spatial powers include:

- Paint nutrients, moisture, shade, or cleanup zones.
- Establish refuges, migration corridors, and quarantine areas.
- Seed decomposers or relocate a small founder cohort.
- Protect a nursery or temporarily exclude predators.
- Trigger drought, bloom, fire, impact, or cold snap with a preview footprint.
- Mark a lineage and pause when it crosses a population or risk threshold.

Every destructive action should show a forecast overlay: affected area, expected duration,
primary pressures, uncertain outcomes, and the checkpoint that will allow reversal.

Do not offer a species-level brainpower slider until brain size genuinely changes behavior.
Directly improving an inert number would create false agency rather than systemic play.

### Passive Monitoring

The player needs reasons to glance back at an autonomous world. Add configurable watches:

- Population below or above a threshold.
- A followed lineage enters a new biome.
- A species becomes locally dominant.
- A mutation survives multiple generations.
- Toxicity or bacteria crosses a regional threshold.
- Predation, starvation, or birth rate changes sharply.
- A trophic role is close to disappearing.

Alerts should offer "focus," "pause," and "compare with 50 ticks ago," not only text.

## 3. UI/UX and Simulation Visualization

### Current Strengths

The retro scientific-console presentation is distinctive, coherent, and appropriate for
a simulation. The world supports pointer and keyboard tile inspection, deterministic
species colors, tile details, lineage following, ecosystem pressure explanations, and
accessible dialog semantics.

### Primary Visualization Problems

At full-world scale, living organisms are effectively colored pixels. Mature toxicity
appears as large blocky violet patches that can visually swallow organism and corpse marks.
There is no persistent legend, layer selection, or zoom-dependent representation. The
player can see activity but cannot reliably interpret causality.

Use semantic zoom:

- **Planet scale:** population density, trophic balance, biome health, hazard contours.
- **Regional scale:** lineage clusters, migration paths, corpse zones, resource fronts.
- **Local scale:** individual organisms, direction, energy state, target, and exposure.

Use separate visual channels:

- Species: hue.
- Energy strategy: glyph shape.
- Size class: glyph size.
- Health/exposure: outline or halo.
- Toxicity: translucent contour or stipple density.
- Bacteria: subtle animated particulate field.
- Mutation pressure: a distinct pulse/edge treatment, not the toxicity color.

### Recommended Main Layout

```text
[Play] [1x 8x 64x]  Tick 235   Order 72  Turnover Up  Variation Up  [Alerts]
[Terrain | Biomass | Life | Toxicity | Mutation | Lineages]          [Legend]
+------------------------------------------------------+-------------+
| World: contours, density glyphs, selected path       | Watchlist   |
| Corpse radius and predicted exposure                 | trends/risk |
+------------------------------------------------------+-------------+
[Timeline: births - deaths - intervention - mutation - speciation]
```

The control drawer should remain for infrequent laboratory settings. Headline monitoring,
layer selection, alerts, and followed lineages belong in persistent observation surfaces.

### Hazard Telegraphing

Environmental danger should answer four questions visually:

1. Where is it?
2. How strong is it?
3. Is it spreading or fading?
4. Which organisms are affected?

Use threshold contours, animated direction or diffusion texture, a numeric legend, and a
selected-organism exposure halo. Hovering a corpse should preview its remaining toxicity
radius and projected dissipation. Selecting a hazard region should show births, deaths,
mutations, and producer recovery inside that region over time.

### Timeline and Charts

The current evolution chart shows movement but not explanation. Add:

- Labeled axes and units.
- Hover/cursor inspection at a tick.
- Selectable population/species/lineage series.
- Mutation, extinction, disaster, and intervention pins.
- Before/after shading for interventions.
- Regional filtering and followed-lineage comparison.

### Mobile Layout

The square world currently sits inside a tall full-height canvas, creating large black
letterboxed regions. Constrain the world to an actual square and use remaining space for
a compact observation strip or bottom sheet.

```css
.app-shell__world {
  display: grid;
  place-items: center;
}

.world-view {
  width: min(100%, calc(100dvh - 11rem));
  height: auto;
  aspect-ratio: 1;
}
```

## 4. Fun, Progression, and Retention

### The Required Hook

The player should quickly witness a causal story such as:

> A dense grazer colony exhausts local producers. Starvation creates a corpse field.
> Decomposers bloom, toxicity spreads, and a resistant branch survives at the edge.
> The player must decide whether to clean the region, open a migration corridor, or let
> the evolutionary bottleneck continue.

That story contains pressure, visible causality, uncertainty, attachment, and a choice.
Origins has most of the required primitives, but they are not yet connected strongly
enough or surfaced clearly enough.

### Field Journal / Bestiary

Record each notable species and lineage with:

- Deterministic name and representative morphology.
- Founder, descendants, and extinction status.
- Geographic range over time.
- Trophic role and preferred habitat.
- Major mutations and the environments in which they spread.
- Evidence explaining why the game considers a trait adaptive.
- Cause of decline, recovery, or extinction.
- Player interventions that affected its history.

The journal should preserve extinct species across worlds. This turns procedural output
into a collection of remembered stories.

### Progression Without Undermining The Sandbox

Award **Knowledge** for observing evidence, not for forcing a specific population result.
Knowledge can unlock better instruments, forecasts, sampling, and intervention precision.
It should not arbitrarily unlock biological mutations that the simulation claims are
naturally possible.

The existing ecosystem-points model is a strong starting point. Give those points a clear
purpose and separate challenge scoring from unrestricted sandbox play.

### Scenario Challenges

- Sustain three trophic roles for 500 ticks.
- Recover from a toxic bloom without changing global constants.
- Evolve and establish an aquatic lineage.
- Prevent one species from exceeding 70% dominance.
- Preserve two isolated lineages through environmental change.
- Restore a collapsed seed using only spatial interventions.
- Produce a scavenger lineage that turns a corpse field into a recovery zone.

Daily and shared seeds can use the deterministic recipe system for fair comparisons.

## 5. Architecture Review

### Strong Foundations

- Pure TypeScript simulation core separated from React presentation.
- Seeded deterministic RNG and replay tests.
- Immutable-style engine snapshots.
- Structured simulation events and intervention metadata.
- Bounded ecosystem-history sampling.
- Spatial creature index.
- Broad unit coverage across simulation and UI models.

### Long-Run Risks

1. **Shared RNG stream:** The engine creates a per-tick RNG, but every subsystem consumes
   the same sequence. Adding one perception draw can change later feeding, births, mutations,
   and deaths. Use named deterministic streams such as `movement`, `predation`, `birth`,
   `mutation`, and `mortality`, derived from seed, tick, entity, and stream name.

2. **Full object-graph copy per tick:** The engine serializes/reconstructs the 10,000-cell
   world and reconstructs all creatures every tick. This will become expensive as fields
   and populations grow. Use double-buffered typed arrays for cell fields and compact entity
   storage for hot simulation data.

3. **Repeated perception:** A creature scans during decision-making and again during movement.
   Return a `DecisionIntent` containing its target and perception evidence, then execute it
   without rescanning.

4. **Main-thread simulation:** Move ticking into a Worker. Publish compact render snapshots
   at a bounded visual cadence and keep the authoritative simulation independent of React.

5. **Unbounded detailed events:** `state.events` grows indefinitely even though ecosystem
   history is bounded. Store recent detailed events, indexed milestone events, and compressed
   historical rollups separately.

6. **Heavy checkpoints:** Thirty full engine states include large cell arrays and event logs.
   Use binary snapshots, structural sharing, or periodic base snapshots plus deterministic
   intervention/event deltas.

7. **Renderer scalability:** Canvas 2D is adequate for the current grid, but rendering should
   consume prepared layer buffers rather than derive all semantics during painting. Use
   `ImageData` or WebGL only when profiling demonstrates the need.

### Recommended Simulation Pipeline

```text
Input/Interventions
       |
       v
Deterministic Simulation Worker
  climate/energy -> producers -> perception intents -> movement intents
  -> feeding -> metabolism/stress -> reproduction/mutation
  -> death -> bacteria/decomposition/toxicity -> field diffusion
       |
       +--> Domain events and indexed history
       +--> Compact render snapshot
       +--> Periodic binary checkpoint
```

## 6. Recommended Delivery Order

### Phase 1: Make The Promise True

1. Promote viable longevity tuning into the default first-run balance.
2. Guarantee an observable mutation within a bounded opening window across curated seeds.
3. Implement local bacteria/mutagenicity and connect it to reproduction.
4. Add deterministic tests comparing mutation inside and outside corpse hotspots.

### Phase 2: Make Evolution Meaningful

1. Give each visible mutable trait a fitness or behavioral consequence.
2. Remove or hide traits that remain future placeholders.
3. Add frequency-over-time tracking for traits and evidence-based adaptation labels.
4. Replace global monoculture punishment with local ecological feedback where possible.

### Phase 3: Make The World Readable

1. Add layer controls and legends.
2. Add semantic zoom and density representations.
3. Separate corpse, toxicity, bacteria, and mutation-pressure visuals.
4. Upgrade the timeline with axes, event pins, and intervention comparisons.
5. Fix the mobile square-world layout.

### Phase 4: Make It A Repeatable Game

1. Add watches, alerts, and followed-lineage monitoring.
2. Add a persistent Field Journal / Bestiary.
3. Introduce stewardship challenges and meaningful Knowledge progression.
4. Add branch-and-compare counterfactual experiments.
5. Publish daily/shared deterministic seeds and outcome summaries.

## Verification

- `npm test -- --run`: 67 test files passed, 474 tests passed.
- `npm run build`: successful TypeScript and Vite production build.
- Desktop review viewport: 1440 x 1000.
- Mobile review viewport: 390 x 844.
- No runtime console or page errors observed during the browser walkthrough.
- Repository working tree remained unchanged during the review.

## Final Assessment

Origins is not merely a visual tech demo. It already contains the foundations of a strong
systemic game: deterministic ecology, lineage history, replay, intervention records,
speciation, narrative summaries, and balance instrumentation. Its current weakness is that
these systems do not yet converge on one clear playable promise.

The shortest route to a compelling game is:

1. Make the sustainable tuning the default.
2. Make corpse-driven mutation mechanically real and spatially readable.
3. Ensure every celebrated trait participates in selection.
4. Give the player persistent monitoring and spatial stewardship tools.
5. Preserve the resulting histories in a journal and challenge framework.

Those changes would turn Origins from a well-engineered simulation prototype into a sandbox
where players can understand, influence, and remember the evolutionary stories they create.
