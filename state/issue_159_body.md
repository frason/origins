## Outcome
Give players persistent tools to notice, understand, follow, and remember autonomous evolutionary stories.

## Includes
- Configurable watches and actionable alerts.
- Causal timeline with axes, event pins, filtering, and intervention comparisons.
- Persistent Field Journal for living and extinct lineages.
- First-run observe -> inspect -> intervene -> evaluate guidance.
- Focus, Pause, Compare, and lineage/region navigation across surfaces.

## Completion
Complete when a player can identify a meaningful change, investigate likely causes, follow its lineage, and recount the world's story after returning later.

Source: Origins Beta Prioritization Plan and Game Design & Architecture Review.

---
**Paused pending pivot decision (2026-08-11):** this issue predates the client-approved Crisis-Response pivot (see SPEC.md "Pivot: Crisis-Response Reframe" and the pivot legacy-roadmap question issue). This epic's stated goal — deeper passive-observation tooling — is the exact experience this pivot moves away from; needs explicit client re-confirmation before resuming, not just a closed dependency. Gated behind the Phase 0 vertical slice.

---
**Re-gated pass #56 (2026-08-19):** this is a pure tracking/rollup epic (completion = all child issues closed, here #169-#172) with no single-worker-actionable Done-when of its own. #233 closing auto-promoted it to `agent-todo`; a sibling epic (#157) got a worker+karen cycle wasted attempting to close it directly, correctly FAILED by karen since epics aren't closable by one worker. Epics should never sit in `agent-todo`. Re-gating behind Phase A (#247) — note the explicit-client-reconfirmation caveat above still applies too; do not treat a closed #247 alone as green light to resume, raise an agent-question first.

---
**Client sign-off received via #234 (2026-08-13):** client explicitly confirmed Watch/Observatory stays in scope — it's the last phase of the Explore → Fix → Study → Watch loop and the win/completion condition, not the passive-viewer problem the pivot removes. Paused for sequencing only, not superseded or questionable. The explicit-client-reconfirmation caveat above is satisfied; no further question needed to resume once Phase A substantively lands.

---
**Re-gated planning pass 43 (2026-08-26):** Phase A (#247) closed, which mechanically re-promoted this epic straight back to `agent-todo` via the depends_on rule — exactly the failure mode the pass-56 note above was trying to prevent (a worker/karen cycle already got wasted on a sibling epic for this same reason). Fixing it properly this time: `depends_on` below now points at this epic's own children instead of the already-closed #247, and — regardless of the depends_on mechanism — **this epic should never be worker-dispatched, even once all children close.** It is a pure rollup/tracking issue with no single-worker-actionable Done-when. The lead closes it directly once all listed children are CLOSED, same treatment #247 itself received.

depends_on: #169, #170, #171, #172

<!-- agent-planned -->
