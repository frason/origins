depends_on: #233

Requested by a beta tester via in-app feedback (`beta_feedback`, 2026-08-05, category `other`):

> We should add a pie chart of sorts to show the proportion of species types

## What

A proportional breakdown of the living population, shown in the Watch panel alongside the existing counts.

## Notes

- Now that creature colour encodes **diet**, not species (see `src/ui/creatureColor.ts`), the chart should reuse `strategyColor()` so the wedges match the dots on the map and the entries in the map key. Anything else would introduce a third, conflicting colour language.
- Worth deciding whether it breaks down by **diet** (4 wedges, matches the map) or by **species** (variable wedge count, matches the Remember panel). Diet is probably the more useful default; species could be a toggle.
- `StatsPanel` already computes species counts and the dominant-species share, so the data is available without new engine work.
- A stacked bar may read better than a pie at the panel's width (~20-25rem) — worth trying both.

## Out of scope

Not a bug; filed so it is not lost. No urgency for beta.

---
**Gated behind Phase 0 (2026-08-12):** Watch-panel/passive-observation enhancement — same category as the paused Observatory epics (see SPEC.md "Legacy roadmap note" and #234's rationale). Labeled agent-backlog, gated on #233, for re-evaluation once Phase 0 is verified rather than left untracked.

<!-- agent-planned -->
