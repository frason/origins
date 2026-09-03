## Outcome
Prepare Origins for richer fields, larger populations, and advanced rendering while preserving exact replay and keeping optimization evidence-driven.

## Includes
- Named deterministic RNG streams.
- Decision intents that avoid repeated perception scans.
- Simulation Worker with compact render snapshots.
- Bounded detailed events and compact checkpoints.
- Profiling gate for typed-array or entity-storage migration.
- Performance, replay, recovery, and compatibility tests.

## Completion
Complete when simulation cost is isolated from rendering, histories remain bounded, and richer worlds can run responsively without changing same-seed outcomes unintentionally.

Source: Origins Game Design & Architecture Review.

---
**Paused pending pivot decision (2026-08-11):** this issue predates the client-approved Crisis-Response pivot (see SPEC.md "Pivot: Crisis-Response Reframe" and the pivot legacy-roadmap question issue). Note: the pivot's Phase 0 also extends checkpointTimeline.ts and will define a versioned checkpoint format — coordinate with that before resuming this epic to avoid rework. Gated behind the Phase 0 vertical slice; re-evaluated once Phase 0 is verified.

---
**Re-gated pass #56 (2026-08-19):** this is a pure tracking/rollup epic (completion = all child issues closed, here #173-#176) with no single-worker-actionable Done-when of its own. #233 closing auto-promoted it to `agent-todo`; a sibling epic (#157) got a worker+karen cycle wasted attempting to close it directly, correctly FAILED by karen since epics aren't closable by one worker. Epics should never sit in `agent-todo`; re-gating behind Phase A (#247). Re-evaluate once Phase A substantively lands (checkpoint-format coordination note above still applies).

---
**Re-gated planning pass 43 (2026-08-26):** Phase A (#247) closed, which mechanically re-promoted this epic straight back to `agent-todo` via the depends_on rule — exactly the failure mode the pass-56 note above was trying to prevent (a worker/karen cycle already got wasted on a sibling epic for this same reason). Fixing it properly this time: `depends_on` below now points at this epic's own children instead of the already-closed #247, and — regardless of the depends_on mechanism — **this epic should never be worker-dispatched, even once all children close.** It is a pure rollup/tracking issue with no single-worker-actionable Done-when. The lead closes it directly once all listed children are CLOSED, same treatment #247 itself received.

depends_on: #173, #174, #175, #176

<!-- agent-planned -->
