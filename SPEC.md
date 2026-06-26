# SPEC — Project Origins: Ecosystem Simulation

_Living spec. Seeded from CLAUDE.md vision; refined by lead during discovery._

## Status
- **Phase:** discovery
- **Settled slices:** (none yet — lead to identify and scope)
- **Open questions:** see `questions/`

## Overview

Players act as an ancient alien civilization guiding life across evolving worlds. Rather than directly controlling creatures, players influence evolution through species creation and environmental stewardship. The MVP validates that players form emotional attachment to species and that the simulation produces interesting, observable adaptations.

**For whom:** Players seeking emergent ecosystem management and long-term engagement with evolving life.

## Users & jobs

- **Primary user:** Evolution enthusiast / ecosystem gardener (player)
- **The one job:** Guide a diverse ecosystem to survive and evolve, witnessing speciation, extinction, and adaptation over time
- **MVP done when:** A player can create a world with initial species, run a deterministic simulation, observe real mutations and adaptation, and want to return to check on their ecosystem

## Scope & non-goals

### In scope (MVP)
- **Simulation engine:** Deterministic, seeded, local-first evolution sandbox (100×100 grid)
- **Energy model:** Solar/Geothermal/Chemical/Radioactive energy sources; Producers (plants, algae, chemosynthesizers); Consumers (herbivores, carnivores, omnivores); Decomposers; Nutrient recycling
- **Creature traits:** Size, Speed, Vision Range, Hearing, Camouflage, Armor, Metabolism, Reproduction Rate, Brain Size, Communication, Energy Acquisition Strategy
- **Lifecycle:** Birth → Growth → Reproduction → Death → Decomposition → Nutrient recycling
- **UI foundation:** World grid visualization, species list, basic controls (play/pause/speed), statistics display
- **Species editor:** Create/mutate species before simulation starts
- **Save/Load:** Persist world state to localStorage
- **Lineage tracking:** Players can trace species history and family lines
- **Determinism:** Same seed produces identical results (replay/debugging)

### Explicitly NOT doing (MVP)
- Multiplayer or shared worlds (V2+)
- Biome simulation or climate complexity (V3+)
- Plate tectonics or disaster events (V3+)
- Symbiosis, parasitism, or complex social structures (beyond communication)
- Terraform tools or planetary scale (V4+)
- Persistence to a database (localStorage only)
- Learning/memory in creatures (future versions)
- Moving/pausing mid-simulation is not a requirement
- Browser multiplayer sync or real-time collaboration

## Main flow (happy path)

1. **World Setup:** Player chooses energy type (Solar/Geothermal/Chemical/Radioactive/Mixed) and enters a seed
2. **Species Design:** Player creates 1–3 initial species by setting traits (size, speed, vision, diet, reproduction rate, etc.)
3. **Simulation Start:** Player presses Play; simulation runs deterministically at adjustable speed
4. **Observation:** Player watches creatures move, eat, reproduce, adapt
5. **Pause & Inspect:** Player can pause to inspect creature lineages, species statistics, and energy flows
6. **Return & Replay:** Player saves world, closes app, returns later to resume or replay with same seed
7. **Evolution Surprise:** Over time, mutations and environmental pressure cause visible speciation, extinction, or adaptation (emergent behavior)

## Stack & integrations

- **Runs as:** Single-page web app (browser-based, local-first)
- **Language/framework:** TypeScript + React (frontend), TypeScript (simulation engine)
- **Simulation engine:** Deterministic, portable, no dependencies
- **State management:** TBD (Redux, Zustand, or event sourcing)
- **Storage:** LocalStorage (MVP); DB for V2+ multiplayer
- **Visualization:** Canvas or WebGL for 2D grid; creature sprite rendering
- **Integrations:** None (V1 is local-only)
- **Auth/users:** No auth required for MVP

## Acceptance & quality bar

- **A feature is "done" when:**
  - Simulation step passes unit tests (energy flow, reproduction logic, mutations)
  - Full simulation loop runs deterministically (same seed = identical results) — snapshot/replay tests
  - UI renders creatures and stats without lag (60 FPS target)
  - Players can create a world, run it, observe mutations/death/adaptation, and save/reload
  - Lineage tree correctly reflects parentage and mutations

- **Quality bar:**
  - Determinism (same seed = same results) is non-negotiable
  - Simulate 1000+ creatures @ 60 FPS
  - World updates in <16ms per tick
  - No hardcoded creature behaviors; trait interactions only

## Guardrails

- **Agents must never:**
  - Touch prod servers or external services (none exist in MVP)
  - Commit secrets (.env files)
  - Deploy without explicit approval (not in MVP scope)
  - Commit breaking changes to the simulation engine without snapshot tests proving determinism

- **Decisions that come back to the client:**
  - UI/UX design choices (layout, color scheme, creature sprites)
  - Exact mutation rates and energy budgets (game balance)
  - Whether to use Canvas vs WebGL
  - State management library choice (Redux vs Zustand vs other)
  - When MVP is "good enough" to stop and play with it

## Build order & dependencies

_Last updated: 2026-06-24 by lead agent. Architecture questions #1–4 are in `questions/`; UI phases are backlogged until answers arrive._

### Phase 1 — Scaffold (no dependencies; start immediately)

| # | Task | Lane | Notes |
|---|------|------|-------|
| 1.1 | Scaffold Vite + React + TypeScript project with Vitest | frontend | Creates `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `src/` directory tree matching CLAUDE.md module plan. Done when `npm run dev` starts and `npm test` runs (empty suite). |

### Phase 2 — Engine primitives (all depend on 1.1; run in parallel)

| # | Task | Lane | Notes |
|---|------|------|-------|
| 2.1 | Seeded deterministic RNG (`src/simulation/rng.ts`) | simulation | Mulberry32 or SFC32 algorithm; `createRng(seed: number)` returns stateful generator; fully unit-tested with determinism assertion. |
| 2.2 | World grid data model (`src/simulation/world.ts`) | simulation | 100×100 `Cell` interface: `{ energy, nutrients, producerBiomass, toxicity }`; `World` class with constructor, `getCell`, `setCell`, JSON serialization. |
| 2.3 | Trait definitions & simulation constants (`src/utils/traits.ts`, `src/utils/constants.ts`) | simulation | All MVP traits typed (Size, Speed, Vision, Hearing, Camouflage, Armor, Metabolism, ReproductionRate, BrainSize, Communication, EnergyStrategy); default/baseline values; mutation rate table. |

### Phase 3 — Creature & producer logic (depend on 2.1 + 2.2 + 2.3)

| # | Task | Lane | Notes |
|---|------|------|-------|
| 3.1 | Producer growth logic (`src/simulation/producer.ts`) | simulation | Biomass growth from available energy per cell; configurable energy-type multipliers (Solar/Geothermal/Chemical/Radioactive). |
| 3.2 | Creature data model & lifecycle state (`src/simulation/creature.ts`) | simulation | `Creature` class with all trait fields, position, energy, age, lineageId; lifecycle states: alive/dead/corpse. |
| 3.3 | Energy flow: feeding, metabolism, reproduction cost (`src/simulation/energy.ts`) | simulation | Energy transfer on feeding; per-tick metabolism drain; reproduction energy threshold and cost; unit-tested. |
| 3.4 | Creature movement & decision logic | simulation | Per-tick decision: scan vision range for food/threats → move toward food or away from predators; speed-capped movement. |
| 3.5 | Death, decomposition & nutrient recycling | simulation | Starvation/age death; corpse decay over N ticks; nutrients += decomposed biomass. |

### Phase 4 — Simulation engine loop (depend on 3.1–3.5)

| # | Task | Lane | Notes |
|---|------|------|-------|
| 4.1 | Main simulation engine loop (`src/simulation/engine.ts`) | simulation | Orchestrates the 10-step tick: Energy Gen → Producer Growth → Decisions → Movement → Feeding → Energy Update → Reproduction → Death → Decomposition → Nutrient Recycling → Events. |
| 4.2 | Mutation system & lineage tracking (`src/simulation/species.ts`) | simulation | On reproduction: random trait drift per mutation rate table; assign child lineageId; maintain `LineageTree` data structure. |
| 4.3 | Event generation (births, deaths, mutations, extinctions) | simulation | Emit typed `SimEvent` objects each tick; store in append-only log for UI consumption. |

### Phase 5 — Determinism & tests (depend on 4.1–4.3)

| # | Task | Lane | Notes |
|---|------|------|-------|
| 5.1 | Determinism snapshot tests: same seed → same results | tests | Vitest snapshot of world state at tick 10, 100, 500 with fixed seed; must match on re-run. |
| 5.2 | Unit test suite for energy, reproduction, mutation | tests | Cover edge cases: zero energy, starvation, max reproduction, lineage depth. |

### Phase 6 — UI & integration (BLOCKED pending architecture decisions Q1 + Q2)

_Will be decomposed once client answers state-management and Canvas-vs-WebGL questions._

| # | Task | Lane | Notes |
|---|------|------|-------|
| 6.1 | World grid Canvas renderer (`src/ui/WorldView.tsx`) | frontend | 2D Canvas; color cells by producer biomass; render creatures as dots sized by Size trait. |
| 6.2 | Species editor UI (`src/ui/SpeciesPanel.tsx`) | frontend | Form to create a species: set all MVP traits; submit adds species to initial world config. |
| 6.3 | Control panel: play / pause / speed (`src/ui/ControlPanel.tsx`) | frontend | Play/pause, simulation speed slider (1×–100×), seed display. |
| 6.4 | Stats panel: biodiversity & ecosystem metrics (`src/ui/StatsPanel.tsx`) | frontend | Live counts: species alive, total creatures, energy balance, mutation events. |
| 6.5 | State management slice & engine ↔ UI wiring | backend | Wire simulation tick to React render loop; chosen library TBD (Q1). |
| 6.6 | Save/load to localStorage | backend | Serialize full world state to JSON; reload on return; keyed by seed + timestamp. |
| 6.7 | Lineage history view (`src/ui/LineageTree.tsx`) | frontend | Tree diagram showing parent→child species relationships with mutation callouts. |

### Phase 7 — Verification (depend on Phase 6)

| # | Task | Lane | Notes |
|---|------|------|-------|
| 7.1 | Performance benchmark: 1000 creatures @ 60 FPS | tests | Automated bench; world-tick must complete in <16ms; report to `artifacts/`. |
| 7.2 | End-to-end play test checklist | tests | Create world → run 1000 ticks → observe speciation or extinction → save → reload → verify state identical. |
| 7.3 | Karen verification: Phase 1–5 engine correctness | verify | Audit determinism, energy conservation, lineage integrity against SPEC requirements. |

---

### Architecture decisions still open (blocking Phase 6+)

| Question | Options | Impact | Status |
|----------|---------|--------|--------|
| Q1 — State management | Redux Toolkit, Zustand, event-sourcing | How engine state flows to React | ❓ asked in `questions/arch-decisions.md` |
| Q2 — Visualization | Canvas 2D, OffscreenCanvas, WebGL | Renderer choice for 6.1 | ❓ asked in `questions/arch-decisions.md` |
| Q3 — Energy budget numbers | Baseline energy/tick, reproduction cost, metabolism | Balancing / test fixtures | ❓ asked in `questions/arch-decisions.md` |
| Q4 — Initial world UX | Pre-built demo world vs. blank + design-from-scratch | Species editor scope | ❓ asked in `questions/arch-decisions.md` |

---

**Living reference:** See `/docs/` for detailed design docs (Master Design Reference, MVP Technical Spec, Product Vision).

