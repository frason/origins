---
type: question
created: 2026-06-24
asked_by: lead
slug: arch-decisions
blocks: Phase 6 (UI + integration)
---

# Architecture Decisions — 4 questions before Phase 6

Hi! The simulation engine (Phases 1–5) is planned and queuing now. The four questions below
only block **Phase 6 (UI + integration)**. We can start building the engine immediately and
will pick up these answers before we reach UI work.

---

## Q1 — State management library

**Question:** Should the simulation engine state flow to React via **Redux Toolkit**, **Zustand**, or a custom **event-sourcing / message bus** approach?

**Why it matters:** This shapes the `src/state/` module entirely — the store shape, how engine ticks dispatch updates, and how the UI subscribes to creature/world changes.

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Zustand** | Simple, minimal boilerplate, easy to colocate with engine | Less structured; harder to time-travel debug |
| **Redux Toolkit** | DevTools, time-travel debugging fits "replay" feature well, structured slices | More boilerplate; heavier setup |
| **Event sourcing (custom)** | Perfect for replay/determinism (events are the source of truth) | Most work to build; may be over-engineered for MVP |

**Our lean:** Zustand for MVP simplicity, with event log stored separately for lineage/replay. Redux if the client values DevTools integration.

**Once answered:** We'll queue 6.5 (state slice + engine wiring) immediately.

---

## Q2 — Visualization: Canvas vs WebGL

**Question:** Should the world renderer use **Canvas 2D**, **OffscreenCanvas 2D**, or **WebGL** (via Three.js or raw)?

**Why it matters:** Determines the renderer implementation in `src/ui/WorldView.tsx`. Canvas is faster to build; WebGL is needed for V2+ worlds (1000×1000+).

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Canvas 2D** | Simple, readable, sufficient for 100×100 @ 60 FPS with 1000 creatures | Won't scale to V3+ (1000×1000) without rewrite |
| **OffscreenCanvas 2D** | Same API, runs off main thread (better frame consistency) | Slightly more setup; same long-term scaling limit |
| **WebGL (Three.js)** | Scales to V3+, GPU-accelerated sprites | Significant extra complexity for MVP |

**Our lean:** Canvas 2D for MVP (100×100 is well within its performance envelope). Easy to swap renderer later if V2+ needs it.

**Once answered:** We'll queue 6.1 (WorldView renderer) immediately.

---

## Q3 — Energy budget baseline numbers

**Question:** What are the starting numeric values for the simulation's energy budget?

**Why it matters:** These numbers become the test fixtures in Phase 5 and directly affect whether the ecosystem is fun to watch (does it collapse? flourish? stabilize?). They can be tuned later, but we need a baseline to write tests against.

**Suggested defaults (you can approve or change):**

| Parameter | Suggested default | Notes |
|-----------|------------------|-------|
| Solar energy generated per cell per tick | 10 units | Base; scales with energy type |
| Producer biomass growth rate | 0.1 × available energy | Each tick |
| Creature base metabolism (small, size=1) | 2 units/tick | Scales with Size |
| Feeding efficiency | 80% | 80% of consumed biomass → creature energy |
| Reproduction energy threshold | 200 units | Must have this much energy to reproduce |
| Reproduction energy cost | 100 units | Deducted from parent |
| Max creature age (ticks) | 500 | Before natural death |
| Corpse decay rate | 10% biomass/tick → nutrients | |
| Mutation rate per trait | 5% per reproduction | Trait drifts ±10% of current value |

**Once answered:** We'll use these in Phase 3 unit tests and Phase 5 snapshot fixtures.

---

## Q4 — Initial world UX: pre-built demo vs. blank canvas

**Question:** When a player first opens the app, do they:
- **(A) Start with a pre-built demonstration world** (e.g., a balanced ecosystem with 3 pre-designed species already placed) so there's immediate action, OR
- **(B) Start with a blank world and design every species from scratch** before pressing Play?

**Why it matters:** Option A is better for onboarding/attachment (you immediately see life); Option B better matches the "you are the creator" theme. This affects the Species Editor UX scope and whether we need a "demo world" config.

**Our lean:** Option A with the ability to clear and redesign — first-time players get a working ecosystem to observe, returning players can experiment with custom species.

**Once answered:** We'll scope 6.2 (Species Editor) accordingly.

---

**Please drop answers into `lead-inbox/answer-arch-decisions.md`** (one section per question is fine). We'll pick them up on the next lead pass and immediately queue Phase 6 tasks.
