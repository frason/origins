# Natural Population Governance

Status: approved design for issue #130  
Scope: architecture and sequencing; no simulation behavior changes

## Decision

Origins should balance populations through two complementary systems:

1. A deterministic, headless calibration tool used only during development.
2. Transparent local ecology in normal play: food scarcity, crowding pressure,
   reproduction restraint, rest, territorial dispersal, and later disease risk.

The simulation must not use an invisible “Director” that secretly changes
resources, traits, fertility, or mortality to force a desired outcome. The
existing global population limit remains a deterministic safety and performance
guard, not the normal ecological explanation for population control. Explicit,
opt-in challenge scripts may alter rules if the UI and event history disclose
the intervention.

## Why this fits Origins

The goal is continued evolution, not a static ideal. A good run moves between
order, chaos, and exploration while remaining observable and computationally
bounded. Population governance should therefore create pressures and tradeoffs,
not converge every seed on one population curve.

The current engine already provides the right foundations:

- Seeded replay and snapshot tests make experiments repeatable.
- Headless sustainability and biomass calibration can be generalized.
- The per-tick spatial index supports bounded neighborhood queries.
- Biomass (#119) exposes local food scarcity and recovery.
- Toxicity (#118) exposes local hazards and adaptation costs.
- Future disease (#126) can reuse the same local-density signal.
- History, events, tile inspection, and charts can explain consequences.

## Approach comparison

| Approach | Role | Strengths | Risks | Decision |
| --- | --- | --- | --- | --- |
| Grid or seeded random search | Development calibration | Simple, deterministic, parallelizable, and easy to audit | Combinatorial growth | Build first with bounded parameter ranges |
| Simple genetic algorithm | Development calibration | Explores interactions efficiently | Can overfit fitness and obscure why a candidate won | Add only after the baseline search proves too costly |
| Guided multi-objective search | Development calibration | Preserves several useful tradeoff frontiers | More implementation and interpretation complexity | Defer; consume baseline reports before deciding |
| Transparent ecological governance | Normal simulation | Causal, playable, inspectable, and compatible with evolution | Requires careful calibration to avoid oscillation | Primary runtime architecture |
| Individual density responses | Normal simulation | Creates migration, territories, restraint, and varied strategies | More creature state and decisions | Add incrementally with explicit costs |
| Invisible Director | Normal simulation | Can force aesthetically pleasing curves | Breaks trust, replay explanation, and evolutionary causality | Reject |
| Visible scripted intervention | Optional challenge mode | Enables catastrophes and authored scenarios | Can dominate natural ecology | Allow only when opt-in and recorded |

## Headless calibration architecture

The first tool should run a fixed seed suite and bounded parameter candidates
without rendering. Grid search and seeded random search share the same runner and
report format. A later optimizer can generate candidates without changing how
they are evaluated.

Run the baseline suite with `npm run calibrate:population`. This emits stable JSON
without wall-clock measurements. Use `npm run calibrate:population --
--measure-runtime` when profiling; measured tick time is intentionally diagnostic
and therefore excluded from byte-equivalence expectations.

```ts
interface CalibrationCandidate {
  id: string;
  constants: Partial<SimulationConstants>;
  densityPolicy: DensityPolicy;
}

interface CalibrationSuite {
  seeds: number[];
  ticks: number;
  sampleInterval: number;
  maximumWallTimeMs: number;
}

interface CalibrationOutcome {
  candidateId: string;
  seed: number;
  populationSeries: number[];
  speciesSeries: number[];
  lineageSeries: number[];
  extinctionTick: number | null;
  maximumPopulation: number;
  meanTickTimeMs: number;
  biomassDepletionShare: number;
}

interface MultiObjectiveScore {
  extinctionRisk: number;       // minimize
  populationOverflowRisk: number; // minimize
  diversityRetention: number;   // maximize
  evolutionaryActivity: number; // maximize, with a sensible upper bound
  trajectoryVariation: number;  // maximize enough to reject stagnation
  runtimeCost: number;          // minimize
}
```

Do not collapse these objectives into one opaque “health” score. Produce a
Pareto-style report and reject candidates that violate hard gates. This prevents
a stagnant but stable ecosystem from winning merely because its population line
is flat.

Initial hard gates:

- Identical candidate, seed, and tick count produce byte-equivalent reports.
- No candidate exceeds the configured population/performance safety ceiling.
- The seed suite completes within a recorded runtime budget.
- At least one species survives the evaluation window for an agreed share of
  seeds, without requiring every seed to survive.
- Evolutionary activity and lineage turnover stay above a minimum and below a
  runaway-noise maximum.

## Runtime ecology architecture

### Local density signal

Compute density once per simulation tick using the existing spatial index. Cache
the result for all decisions made during that tick.

```ts
interface LocalDensity {
  living: number;
  sameSpecies: number;
  competitors: number;
  prey: number;
  edibleBiomass: number;
  pressure: number; // normalized, derived only from visible local facts
}

interface DensityPolicy {
  radius: number;
  updateIntervalTicks: number;
  reproductionPressureStart: number;
  dispersalPressureStart: number;
  stressEnergyCost: number;
}
```

Pressure should combine nearby consumers with accessible food, not creature
count alone. Ten grazers on depleted grass should experience more pressure than
ten grazers in a productive wetland. Carnivores and scavengers use prey/corpse
availability rather than producer biomass.

### Individual responses and costs

Responses are deterministic decisions based on cached local conditions and
heritable traits. No response should be universally optimal.

| Response | Benefit | Cost or weakness | Suggested trait relationship |
| --- | --- | --- | --- |
| Reproduction restraint | Avoids births where offspring are unlikely to survive | Slower expansion into recovering habitat | reproduction rate and social awareness |
| Rest or inactivity | Reduces movement energy during temporary scarcity | Less foraging, mating, and escape opportunity | metabolism and patience/awareness |
| Territorial behavior | Protects a local food patch | Conflict and patrol energy | communication, armor, aggression later |
| Dispersal migration | Finds underused habitat and expands range | Travel energy and exposure to harsh biomes | speed, vision, habitat adaptations |

The first implementation should modify reproduction probability/eligibility and
dispersal choice. Territorial conflict and new traits should follow only if the
simpler mechanisms do not create enough visible variation.

### Relationship to existing systems

- Biomass (#119): primary short-term carrying signal for herbivores and
  omnivores; depletion and recovery remain visible on tiles.
- Toxicity (#118): crowding can create corpse clusters, but toxicity must remain
  a consequence rather than a hidden density penalty.
- Disease (#126): later pathogens consume the same local-density cache to
  calculate contact opportunities; disease is not required for the first phase.
- Global cap: continue to block births above `maxGlobalPopulation`; reserve
  forced removal for invalid/imported states and record it explicitly.
- Monoculture rules: replace unexplained global mortality with local competition
  and reproduction pressure once calibration demonstrates equivalent safety.

## Determinism, memory, and performance

- Iterate creatures and spatial buckets in stable engine order.
- Any random response uses the engine RNG and a documented call order.
- Store only compact per-creature state that affects future ticks; derive local
  density each tick instead of serializing neighborhood lists.
- Use typed arrays or reusable records for per-tick density caches if profiling
  shows allocation pressure.
- Update expensive strategic decisions at fixed tick intervals, never per frame.
- Include density state that influences future behavior in save/replay snapshots.
- Gate candidate policies at 500 creatures and at the configured hard ceiling;
  compare mean and worst tick duration against the current baseline.

## Observability and replay

Players should be able to answer “why did growth slow?” without reading code.

- Tile inspection: local consumers, accessible food, pressure level, and active
  response for inspected creatures/lineages.
- Species panel: births deferred by crowding, dispersal attempts, and habitat
  reached through dispersal.
- Timeline: only aggregate sustained pressure or major migrations to avoid spam.
- Population graph: annotate density-driven slowdown and recovery events.
- Replay recipe: stores policy constants and produces identical annotations.
- God Mode: expose calibrated policy constants only after defaults are proven;
  help text must explain both benefit and downside.

## Sequenced implementation

1. #143 — Headless multi-seed calibration runner and Pareto report.
2. #144 — Deterministic local density and resource-pressure model.
3. #145 — Density-aware reproduction restraint with inspection and history evidence.
4. #146 — Costly dispersal toward lower-pressure suitable habitat.
5. #147 — Multi-seed ecology, replay, and performance gates; then reassess global
   monoculture mortality.
6. Future disease integration reusing local contact density (#126).

The first five steps are child issues of #130. Disease remains in its existing
epic until the local-density model is stable.

## Explicit non-goals

- No live adaptive optimizer inside a normal game.
- No target population the engine secretly attempts to maintain.
- No automatic resource grants, forced mutations, or unexplained deaths.
- No requirement that every seed survive or converge.
- No per-frame ecological decisions.
