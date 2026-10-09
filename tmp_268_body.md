depends_on: #265, #267, #304

## Goal
Make the new water/substrate/hydration systems visible and explainable to a player, and confirm
they hold up under long-run, same-seed, and performance testing before the epic (#120) closes.

## Context
Child 6/6 (final) of epic #120. Full design: `docs/design-dynamic-world.md` ("Performance and
determinism" + "Migration plan" step 6). Depends on both #265 (producer growth multipliers) and
#267 (hydration), since this issue verifies the whole feature set together.

- Add water/substrate rendering to the world view (distinct visual treatment for water depth,
  substrate type — bare functional differentiation is fine, e.g. distinct fill colors/icons per
  substrate and a blue overlay scaled by `waterDepth`; no art pass needed).
- Extend tile-detail UI (already showing the new Cell fields since #263) with a short plain-
  language explanation, e.g. "Loam, shallow water nearby — good growth for solar producers" —
  reuse whatever existing tile-explanation pattern the codebase has for biome/toxicity, if one
  exists.
- Add at least one demo/seed scenario in the existing scenario-setup pattern that showcases a
  mixed water/land world (for manual verification and future scenario reuse).
- Add a 500-tick determinism/stability test: same seed run twice produces identical world state
  including all new hydrology/substrate/hydration fields (extend existing determinism test
  patterns rather than writing a new framework).
- Add migration fixtures: confirm an old save (pre-#263, missing the new fields) loads correctly
  with the deterministic defaults from #263 and continues to simulate without errors.

## Done when
- World view visually distinguishes water depth and substrate type; tile-detail UI explains the
  new fields' effect on producers/creatures in plain language.
- At least one demo scenario exercises mixed water/land terrain.
- A 500-tick same-seed determinism test passes, covering hydrology/substrate/hydration fields.
- An old-save migration test passes (loads pre-#263 fixture data without crashing, applies
  correct defaults).
- Full test suite and `npm run build` pass with zero failures — run both yourself and confirm,
  don't rely on inspection.
- All changes committed.
- Post a short summary comment on epic #120 confirming all 6 child issues (#263-#267 and this
  one) are complete, since the lead closes epics directly rather than dispatching them.

---
**Lead note (planning pass, 2026-10-08) — why this was moved to `agent-backlog`:** the substance
of this issue (rendering, tile explanation, demo scenario, epic summary) is already karen-PASSED
and complete — see karen's latest verdict on this issue, which [PASS]ed all 4 of those items.
The ONLY remaining [FAIL] is the full-test-suite run hanging indefinitely (confirmed 29min/18min
CPU with zero output across two separate attempts), root-caused to a REAL infinite loop in
`src/simulation/biomeTraversal.ts`'s `moveAcrossTerrain` (the "no alternative route, not a
cadence tick" branch spins `while (budget > 0)` forever) — exactly the bug #304 is already
scoped and prioritized to fix. This is not something a worker on #268 itself should try to
re-fix (that would duplicate #304's scope and risk a conflicting edit to the same function);
wait for #304 to land, then re-verify #268's test suite completes cleanly. `depends_on` above
updated to include #304. Once #304 closes, this issue needs essentially nothing new except
confirming `npx vitest run src/tests/migration.test.ts src/tests/snapshot.test.ts` (and the full
suite) completes without hanging, then closing per the Done-when above.

<!-- agent-planned -->
