---
type: goal
created: 2026-06-24T00:00:00Z
---

# Discovery: Refine SPEC and Plan Phase 1

## Goal

Review SPEC.md and CLAUDE.md, identify key architecture decisions, and plan the first engineering sprint. Write a prioritized, phased build order into SPEC.md's "Build order & dependencies" section.

## Context

- **Vision:** `/Users/frason/Developer/origins/CLAUDE.md` (detailed project goals, MVP scope, architecture sketch)
- **Living spec:** `/Users/frason/Developer/origins/SPEC.md` (seeded, needs build order)
- **Tech stack:** TypeScript + React; determinism is non-negotiable
- **Lanes available:** simulation, frontend, backend, tests (4 concurrent workers)

## Open questions to raise (if needed)

Before planning tasks, confirm with the client:

1. **State management:** Redux, Zustand, or event sourcing? (impacts how engine state flows to UI)
2. **Visualization:** Canvas or WebGL? (Canvas is simpler, WebGL scales to larger worlds in V2)
3. **Energy budgets:** Baseline numbers (energy per tick, reproduction cost, creature base metabolism)?
4. **Initial creatures:** Should MVP start with a pre-built world or let players design from scratch?

## Done when

- [ ] SPEC.md "Build order & dependencies" is filled with Phase 1–6 breakdown
- [ ] Each phase has 3–5 concrete, worker-sized tasks
- [ ] All questions (above) are either answered or flagged in `questions/`
- [ ] File `lead-inbox/answer: architecture-decision-name.md` for each answer received

## Output

Write all decisions and the build order into SPEC.md, then queue Phase 1 worker tasks into `queue/todo/`.
Return a 2–3 line summary of what's ready to build.

