## Outcome
Ensure every celebrated evolutionary change has a real environmental cause, fitness consequence, and observable evidence.

## Includes
- Aggregated corpse biomass and decomposer/bacterial ecology.
- Local mutagenicity that remains distinct from toxicity.
- Audit, activate, or hide inert mutable traits.
- Trait-frequency and lineage evidence for adaptation claims.
- Replace remaining abstract global corrections with local ecological feedback where practical.
- Deterministic multi-seed balance and explanation tests.

## Completion
Complete when players can distinguish mutation from adaptation and the UI can explain why a trait spread without inventing causation.

Source: Origins Beta Prioritization Plan and Game Design & Architecture Review.

---
**Paused pending pivot decision (2026-08-11):** this issue predates the client-approved Crisis-Response pivot (see SPEC.md "Pivot: Crisis-Response Reframe" and the pivot legacy-roadmap question issue). Gated behind the Phase 0 vertical slice so worker time goes to the approved pivot first; re-evaluated once Phase 0 is verified.

---
**Re-gated pass #56 (2026-08-19):** this is a pure tracking/rollup epic (completion = all child issues closed, here #165-#168) with no single-worker-actionable Done-when of its own. #233 closing auto-promoted it to `agent-todo`, and this pass found a sibling epic (#157) got a worker+karen cycle wasted attempting to close it directly — karen correctly FAILED it since epics aren't closable by one worker. Epics should never sit in `agent-todo`; re-gating behind Phase A (#247) so this doesn't happen here too. Re-evaluate once Phase A substantively lands.

---
**Re-gated planning pass 43 (2026-08-26):** Phase A (#247) closed, which mechanically re-promoted this epic straight back to `agent-todo` via the depends_on rule — exactly the failure mode the pass-56 note above was trying to prevent (a worker/karen cycle already got wasted on a sibling epic for this same reason). Fixing it properly this time: `depends_on` below now points at this epic's own children instead of the already-closed #247, and — regardless of the depends_on mechanism — **this epic should never be worker-dispatched, even once all children close.** It is a pure rollup/tracking issue with no single-worker-actionable Done-when. The lead closes it directly once all listed children are CLOSED, same treatment #247 itself received.

depends_on: #165, #166, #167, #168

<!-- agent-planned -->
