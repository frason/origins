## Outcome
Turn Origins into a repeatable game without undermining the open-ended sandbox or pretending players unlock biologically impossible mutations.

## Includes
- Knowledge earned by observing evidence and used for better instruments.
- Deterministic scenario and challenge framework.
- Shared/daily seeds with comparable recipes and summaries.
- Branch-and-compare counterfactual experiments.
- Integration with #124 world modes and #125 scripted ecological events.

## Completion
Complete when players have compelling reasons to start another world, compare approaches, and improve their observational tools while simulation rules remain honest.

Source: Origins Beta Prioritization Plan and Game Design & Architecture Review.

---
**Paused pending pivot decision (2026-08-11):** this issue predates the client-approved Crisis-Response pivot (see SPEC.md "Pivot: Crisis-Response Reframe" and the pivot legacy-roadmap question issue). Gated behind the Phase 0 vertical slice so worker time goes to the approved pivot first; re-evaluated once Phase 0 is verified.

---
**Re-gated pass #56 (2026-08-19):** this is a pure tracking/rollup epic (completion = all child issues closed, here #177-#180) with no single-worker-actionable Done-when of its own. #233 closing auto-promoted it to `agent-todo`; a sibling epic (#157) got a worker+karen cycle wasted attempting to close it directly, correctly FAILED by karen since epics aren't closable by one worker. Epics should never sit in `agent-todo`; re-gating behind Phase A (#247). Re-evaluate once Phase A substantively lands.

---
**Re-gated planning pass 43 (2026-08-26):** Phase A (#247) closed, which mechanically re-promoted this epic straight back to `agent-todo` via the depends_on rule — exactly the failure mode the pass-56 note above was trying to prevent (a worker/karen cycle already got wasted on a sibling epic for this same reason). Fixing it properly this time: `depends_on` below now points at this epic's own children instead of the already-closed #247, and — regardless of the depends_on mechanism — **this epic should never be worker-dispatched, even once all children close.** It is a pure rollup/tracking issue with no single-worker-actionable Done-when. The lead closes it directly once all listed children are CLOSED, same treatment #247 itself received.

depends_on: #177, #178, #179, #180

<!-- agent-planned -->
