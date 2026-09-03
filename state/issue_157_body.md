## Outcome
Turn the completed #148/#149 Three.js spike into a production living-world renderer that makes ecology easier to understand and more emotionally engaging without coupling rendering to the authoritative simulation.

## Product direction
- Isometric tile world is the primary playable 3D direction.
- Globe is reserved for overview, storytelling, and future planet-scale presentation.
- The current 2D tile map remains a synchronized navigation/accessibility fallback.
- Three.js is a renderer, never the source of simulation truth.

## Includes
- Renderer-neutral compact snapshots and prepared layer buffers.
- Live isometric world rendering with synchronized selection.
- Semantic zoom from world density to regional lineages to local organisms.
- Distinct terrain, biomass, life, corpse, toxicity, mutation-pressure, and lineage channels.
- Mobile, pointer, touch, keyboard, reduced-motion, fallback, and performance gates.
- Measured comparison against Canvas 2D before any replacement decision.

## Completion
Complete when the live deterministic simulation can be observed and inspected through the production Three.js view on desktop and mobile, without breaking replay, accessibility, performance, or the 2D fallback.

Source: Origins Beta Prioritization Plan and Game Design & Architecture Review.

---
**Paused pending pivot decision (2026-08-11):** this issue predates the client-approved Crisis-Response pivot (see SPEC.md "Pivot: Crisis-Response Reframe" and the pivot legacy-roadmap question issue). Phase B of the pivot resequences the 3D rendering work (bare scene before archetype rigs/foot IK). Gated behind the Phase 0 vertical slice; re-evaluated once Phase 0 is verified.

---
**Re-gated pass #56 (2026-08-19):** #233 closing auto-promoted this to `agent-todo` and a worker+karen cycle actually attempted to close it directly this pass — karen correctly **FAILED** it (state/verdict.txt), confirming this is a pure tracking/rollup epic (completion = all 5 children #160-#164 closed) with no single-worker-actionable Done-when of its own, and recommending it be returned to a blocked/paused state rather than cycled through agent-review again. Epics should never sit in `agent-todo`; re-gating behind Phase A (#247) instead. Re-evaluate once Phase A substantively lands (Phase B resequencing note above still applies).

---
**Re-gated planning pass 43 (2026-08-26):** Phase A (#247) closed, which mechanically re-promoted this epic straight back to `agent-todo` via the depends_on rule — exactly the failure mode the pass-56 note above was trying to prevent (this is the very epic that already burned one worker/karen cycle for this same reason). Fixing it properly this time: `depends_on` below now points at this epic's own children instead of the already-closed #247, and — regardless of the depends_on mechanism — **this epic should never be worker-dispatched, even once all children close.** It is a pure rollup/tracking issue with no single-worker-actionable Done-when. The lead closes it directly once all listed children are CLOSED, same treatment #247 itself received.

depends_on: #160, #161, #162, #163, #164

<!-- agent-planned -->
