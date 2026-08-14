# SPEC — Project Origins: Ecosystem Simulation

_Living spec. Seeded from CLAUDE.md vision; refined by lead during discovery._

## Status
- **Phase:** build — post-MVP. The original MVP (below, "Overview" through Phase 7) shipped
  and has been in a live-beta feedback/hardening loop for many passes (see `state/STATUS.md`
  for the up-to-date active-issue picture; this file's Phase 1–7 tables are historical/
  reference, not the current work queue).
- **Current initiative (2026-08-11):** Pivot — Crisis-Response Reframe. Full requirements in
  `/Users/frason/.claude/plans/swift-hopping-codd.md` (client-approved). Reframes the game from
  passive observation to active crisis response: player is a remote alien operator directing
  scouts, spending scarce resources on interventions. See "Pivot: Crisis-Response Reframe" below
  for the Phase 0 vertical-slice design (this is now the active build target; the historical
  MVP sections below remain accurate for the shipped engine they describe, which the pivot
  extends rather than replaces).
- **Settled slices:** MVP engine (Phases 1–5), MVP UI (Phase 6, with subsequent beta hardening).
  Phase 0 of the pivot (below) is settled and issued this pass.
- **Open questions:** see `questions/` (MVP-era) and open `agent-question` GitHub issues
  (current).

---

## Pivot: Crisis-Response Reframe

**Source of truth:** `/Users/frason/.claude/plans/swift-hopping-codd.md` — read that document
for full context, rationale, and everything outside Phase 0. This section only carries the
concrete design decisions needed to scope Phase 0 issues; it does not restate the whole plan.

**Phase order:** Phase 0 (vertical slice) → Phase A (core systems) → Phase B (rendering
foundation) → Phase C (art pipeline) → Phase D (full UI) → Phase E (backlog/opportunistic).
Only Phase 0 is issued so far (this pass). BYOK, Tier 2/3 LLM calls, and the primary 3D view are
explicitly out of scope for Phase 0.

### Phase 0 scope (vertical slice)

One scout, one comms bubble, one crisis type, template-only Tier 1 response (no LLM anywhere),
one resource ledger with a real ecological cost/sink, validated `InterventionCommand`s recorded
into versioned checkpoints, one building with the full operating→dormant→demolished lifecycle,
an equilibrium progress meter. Bare functional debug UI only — the real StarCraft-style HUD is
Phase D.

### Core Economy — Phase 0 definition (first real definition; supersedes nothing, this system
was previously unspecified)

Two resources tracked in Phase 0 (Compute/Bandwidth is Tier 2/3-only, out of scope until Phase
A). All numbers below are **Phase 0 defaults, tunable via playtesting** — same treatment as
every other tuning number already flagged this way in the plan (crisis frequency, beachhead
energy quantity, etc.) — not final balance.

- **Energy** — global stockpile, ledger-tracked (not per-tile).
  - Starting value: 500. Storage cap: 500 (can't exceed starting reserve in Phase 0 — no
    infrastructure yet raises it).
  - Passive drain: −1/tick (base beachhead survival cost), floored at 0.
  - No income source in Phase 0 (intentional — proves the scarcity pressure the plan calls out;
    the actual energy-generating building type is Phase A+).
  - Sinks: building construction cost (100 Energy, fixed), Tier 1 crisis response cost (20
    Energy per response). Action is rejected outright (no partial spend) if funds insufficient.
- **Biomass** — global stockpile, but its *income* is a real per-tile ecological draw, not an
  abstract accrual (this is the "real ecological cost/sink" the plan requires for Phase 0).
  - Starting value: 0. Storage cap: 300.
  - Source: the Phase 0 building (a Biomass Harvester, see below) — while operational, each tick
    it converts up to 2.0 units of its host tile's real `producerBiomass` (existing world-grid
    field) into +1 stockpiled Biomass. The draw never takes that cell's `producerBiomass` below
    0 — a depleted tile simply produces less/no income that tick, so bad placement visibly
    starves the local food web, matching the plan's stated design principle.
  - Sinks: Harvester recommission cost after dormancy (scales with how long it's been dormant),
    and the Tier 1 crisis remediation action's Biomass cost is deferred to Phase A (Phase 0's one
    crisis type spends Energy only, see below) — keep Phase 0 minimal.

### Scout Loop — Phase 0 definition (first real definition)

- One scout entity, positioned on the existing world grid.
- **Movement authority:** player issues a single-destination waypoint (click-to-move); the scout
  autonomously paths one tile per tick toward it (no direct real-time steering). Fixed speed: 1
  tile/tick in Phase 0 (no trait-driven speed — scouts aren't creatures).
- **Comms bubble:** fixed radius of 15 tiles, centered on the Landing Base tile (not on the
  scout). Distance metric: Chebyshev (8-directional square bubble) — cheap and deterministic,
  matches grid movement.
- **Discovery (Phase 0 definition):** the scout's current tile matching the single Phase 0
  crisis's trigger condition (see below) generates one Discovery record
  `{ tick, x, y, type, payload }`.
- **Battery:** starts at 100. Drains −1/tick only while outside the comms bubble (no drain while
  docked at the Landing Base tile). Recharges instantly to full only when the scout is exactly
  on the Landing Base tile (not bubble-wide).
- **Data sync/loss:** Discoveries accumulate in onboard storage while outside the bubble. The
  moment the scout re-enters the bubble, onboard discoveries flush in one batch into the
  persistent synced log, then clear. If battery reaches 0 while outside the bubble, the scout
  becomes `stranded`: movement stops, and all undumped onboard discoveries are permanently
  deleted — no warning, by design (see plan's Scout Data Loss section). A stranded scout can
  later be "found" (informational/narrative closure field only) — no rescue/recovery mechanic in
  Phase 0.

### Phase 0 crisis type

One crisis for the vertical slice: **Localized Toxicity Spike** — triggers when any grid tile's
existing `toxicity` field (see `src/simulation/toxicity.ts`) crosses a fixed threshold. Alert is
canned/templated text (no LLM). Tier 1 response: a fixed heuristic delta reduces that tile's
toxicity, emitted as a validated `InterventionCommand` against a whitelisted
`toxicity_reduction` parameter, costing 20 Energy.

### `InterventionCommand` (security architecture, exercised end-to-end at Phase 0 scale)

Every tier's output — Phase 0 only has Tier 1 — must conform to one typed command shape before
it's eligible to touch simulation state: whitelist (fixed named parameters only) → hard
min/max bounds per parameter → per-command delta cap, engine-side, all independent of whatever
produced the command. Only commands that pass all three are applied to state or recorded into
checkpoints/the diagnostic-export command log. This Phase 0 implementation is exactly what Phase
A's Tier 2/3 LLM paths will reuse — Phase 0 proves the pipe with a non-LLM source first.

### Equilibrium progress meter (Phase 0)

Reuses `src/ui/ecosystemHealth.ts`'s existing Order/Chaos/Exploration bands as-is, plus a new
Replacement-ratio criterion (mean 0.95–1.05, coefficient of variation ≤ 0.10) evaluated over a
trailing 2,000-tick streak. All four conditions must hold simultaneously. The streak resets to
zero on any applied `InterventionCommand`; pausing freezes it (no advance, no reset); loading a
checkpoint does not reset it. Phase 0 only needs the tracker + progress readout — the full
"infrastructure must be demolished" completion gate and fast-forward-to-completion UX are Phase
A/D concerns.

### Legacy roadmap note

Issues #116–#126 and #155–#180 (Evolution Observatory, Three.js Living World, Engine Scale,
Knowledge Progression/Scenarios, Evolution Truth — all labeled `pivot-candidate`) predate this
approved pivot decision. All are moved to `agent-backlog`, gated on the Phase 0 verify issue
(#233), so worker time goes to the approved pivot first. Client-confirmed disposition per #234
(answered 2026-08-13), by category:

- **Evolution Observatory (#159, #169–172, Watch-panel-adjacent items like #223):** client
  correction to the lead's original framing — the game's loop is **Explore → Fix → Study →
  Watch**, and Watch is the *last* phase, the win/completion condition (the equilibrium
  "trophy/observation" state this same pivot section already defines above). Observatory is
  earned payoff, not the passive-viewer problem this pivot exists to remove — do not treat it as
  conflicting with the pivot or as a candidate for cancellation/rethink. It stays paused behind
  Phase 0 purely for sequencing (single-worker dispatch; crisis-response loop must exist before
  its capstone view matters), not because it's in question.
- **Evolution Truth (#155, #165–168) and Engine Scale (#158, #173–176):** simulation
  correctness/performance work, orthogonal to the UI/gameplay reframe. Client confirmed: pause
  behind Phase 0 same as everything else, no need to run in parallel.

Re-evaluate the full paused list at the Phase 0 checkpoint (#233 close) — resume in whatever
order makes sense then, informed by what Phase 0 actually teaches about the loop.

---

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

