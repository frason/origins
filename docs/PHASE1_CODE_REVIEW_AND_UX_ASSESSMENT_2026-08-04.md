# Project Origins — Phase 1 Code Review & UI/UX Assessment

**Reviewer:** Claude (Cowork), external review pass
**Date:** 2026-08-04
**Method:** Static code review of `src/simulation/engine.ts`, `src/simulation/species.ts`, `src/App.tsx`, `src/utils/constants.ts`, `src/simulation/creatureSpatialIndex.ts`, `src/simulation/toxicity.ts`; `tsc --noEmit` and `vite build`; targeted + broad `vitest` runs (45+ of 111 test files executed directly, zero failures, including the determinism-critical `snapshot.test.ts`); live interactive session against your local `npm run dev` server (localhost:5174) via Claude in Chrome — play/pause, speed, all four drawer tabs, God Mode, five live Turning Point events, console log check.

---

## 1. Code Review Summary

```
PHASE 1 COMPLETION: ✅ COMPLETE

Evolution Wired:      ✅  reproduceCreature (species.ts) is imported and called in engine.ts's
                           Step 7 reproduction loop (~line 746). Mutation via mutateTraits() and
                           lineage branching (new lineage_<hex>_<hex> id on energyStrategy change
                           or significant trait drift) are both live. No inline offspring-clone
                           stub remains.

Determinism Fixed:    ✅  Lineage IDs are derived from the seeded RNG (species.ts ~160-167), not
                           crypto.randomUUID(). Only one crypto call exists anywhere in src/ —
                           worldSeed.ts uses crypto.getRandomValues() to pick a fresh seed for the
                           "New World" button, which is outside the deterministic tick loop and
                           doesn't affect replay of a given seed. snapshot.test.ts passes
                           (byte-identical state).

Game Loop:             ✅  App.tsx ~312-360: setInterval-driven loop with a time accumulator,
                           calls tickEngine() respecting isRunning and speed (tickMs = 1000/speed),
                           publishes to the Zustand store every tick, and caps the accumulator at
                           5 ticks' worth so a backgrounded/throttled tab doesn't fast-forward on
                           return. More robust than the brief assumed.

UI Panels Mounted:     ✅  Wired, but organized differently than the brief expected: instead of a
                           single always-visible layout, ControlPanel/StatsPanel/SpeciesPanel live
                           inside a tabbed "Watch / Diagnose / Act / Remember" slide-out drawer.
                           Confirmed live: Play/Pause, speed −/+, StatsPanel metrics, SpeciesPanel/
                           LineageHistory, and God Mode all update in real time.

Build Status:          ✅  tsc --noEmit: 0 errors. vite build: succeeds (194 modules). See
                           Environment Notes for a sandbox-only permissions issue that briefly
                           blocked the build and was unrelated to your code.

Issues Found:
- [moderate, perf]: hasLocalReproductiveResources() (engine.ts ~97-127) and
  getLocalMiasmaMutationPressure() (toxicity.ts ~57-70) each scan the FULL creatures array once
  per reproducing creature per tick, instead of using the CreatureSpatialIndex that's already
  built for that tick. Movement/decision code correctly uses the spatial index; these two
  reproduction-path functions don't. At the current maxGlobalPopulation cap (500), worst case is
  ~250,000 redundant distance checks/tick from these two functions alone. Recommend routing both
  through creatureIndex.querySquare().
- [minor, bundle size]: WorldViewSpike chunk is 2.15 MB / 546 KB gzip (Vite's own build flags
  this). Likely three.js. Worth code-splitting/lazy-loading before beta if that view isn't needed
  on first paint.
- [minor, docs]: vite.config.ts's dev server defaults to port 5174, not 5173 as stated in the
  review brief — trivial but will trip up anyone following the doc literally.
- [minor-moderate, live-found copy bug]: An "Order Turning Point" modal read "The ecosystem is
  contracting" while its own stated numbers were "Population changed from 27 to 43" — a growth
  figure paired with a contraction headline. The underlying trigger is likely species/lineage
  count, but as displayed it reads as contradictory.
- [moderate, live-found UI bug, reproducible]: Switching drawer tabs (e.g., Diagnose → Act) while
  the drawer is already open doesn't swap cleanly. Repro: open any tab, then click a different tab
  label. First click visibly starts closing the drawer instead of swapping content; a second click
  on the same tab produces correct body content, but the header title/subtitle lags one tab behind
  (e.g. header still reads "Diagnose — Why it's happening" over the Act panel's body). The
  SETTINGS_TABS config itself is correct, so this looks like a transition/animation timing issue
  in SettingsDrawer, not a data bug — but it's a visible, confusing glitch.
- No console errors or warnings observed across ~5 minutes of live interaction.

Blockers for Beta (code-level): None. Core loop, evolution/mutation, and determinism are solid,
tested, and match spec. The nearest thing to a blocker is UX (Turning Point interruption
frequency — see Part 2), not correctness.
```

**Test coverage note:** the full suite (111 files) wasn't run to completion in a single pass due to per-command time limits in the review sandbox, not a project issue. Batches covering energy, movement, species, world, producer, engine, decomposition, dispersal, determinism/snapshot, godMode, spatial index, biomass diagnostics, adaptive reproduction, and 10 UI component tests (statsPanel, speciesPanel, controlPanelGodMode, settingsDrawerAccessibility, worldLegend, simWindow, turningPointChoice, extinctionSummary, evolutionRibbon, godModeHelp) all passed with zero failures.

---

## 2. UI/UX Findings

```
BETA READINESS: Needs Work

Strengths:
- The real implementation is well ahead of the brief's MVP description: a "Watch / Diagnose / Act
  / Remember" mental model organizes tools by the steward's actual workflow rather than a flat
  control panel — a genuinely good information-architecture choice.
- StatsPanel ("Watch") pairs every raw number with a plain-language status badge (Coherent/
  Turbulent, Holding/Easing/Branching) and a one-line cause ("48 births, 57 deaths... Weighted
  turnover fell from 75 to 30"). This directly serves CLAUDE.md's "no biology PhD required"
  principle and is above what most sims in this genre show.
- Diagnose tab surfaces causal narrative ("Predation is shaping turnover," "Corpse toxicity is
  leaving ecological scars"), a World Story timeline, and a population/species/lineage sparkline —
  exactly the "transparent metrics" design principle.
- Determinism, checkpoints/restore points, world export/import, and cloud backup are already
  built — well beyond "MVP" scope.
- TileInfoPanel is not a stub as the brief assumed — it has working keyboard navigation (arrow
  keys, Home/End, Escape) and live tick-aware status text.
- Zero console errors/warnings during live testing.

Gaps (High Priority):
- Turning Point interruption frequency: in ~5 minutes of light interaction at 1x speed, five
  separate modal dialogs auto-paused the simulation ("Exploration," "Chaos," "Order" turning
  points). Each blocks the canvas and demands a decision (Apply / Introduce species / Do nothing)
  before you can keep watching. For a "sit back and watch your world evolve" experience this reads
  as naggy, and works against CLAUDE.md's own "Session length / Frequency" success metrics.
  Recommend: a non-blocking toast/banner instead of a modal, a frequency/threshold setting, or a
  one-keystroke dismiss.
- Creature visibility on the canvas: at normal zoom, a population of 20-40 renders as a handful of
  near-invisible 1-2px dots against a busy multi-hue biome map (green producer shading, toxicity
  dither, mutation-pressure hatching all compete visually). This is the biggest gap against the
  brief's own "Canvas & World Visualization" checklist item. Recommend larger/higher-contrast
  creature markers or a default zoom where individuals are legible.
- Onboarding: no first-load explanation of what the colors/legend mean before the sim is running
  (and possibly about to auto-pause on you). The legend itself (species hue, elevation, biomass,
  toxicity, mutation pressure, followed lineage) is well designed once found, but nothing points a
  first-time player to it. A brief first-run modal would close this cheaply.
- The drawer header/content desync bug (Part 1) is small in scope but the kind of glitch that
  undercuts confidence in a "beta" build.

Gaps (Nice-to-Have):
- Two controls for the same `speed` value: a stepped −/+ (doubling) control in the persistent
  bottom transport bar, and a separate continuous slider inside the Act tab. Consider
  consolidating, or make the relationship between them obvious.
- Act tab progressive disclosure: Export world, Export diagnostic, Cloud backup, Restore cloud,
  World Mode presets, checkpoint Restore, and God Mode are all present in one tab alongside basic
  Play/Pause. That's a lot of advanced/irreversible-sounding actions next to the everyday ones for
  a first-time user. Consider splitting "everyday" vs. "advanced."
- Editorial pass on dynamically generated Turning Point headlines — at least one didn't match its
  own stated numbers (see Part 1).
- Code-split the WorldViewSpike (three.js) bundle for first-load time.
- Mobile/responsive layout could not be conclusively verified in this session (window-resize
  testing was inconclusive with available tooling) — worth a manual pass with browser dev tools
  device emulation.
- Accessibility: no obvious contrast problems were spotted during live use, and TileInfoPanel's
  keyboard support is a good sign, but nothing here was measured numerically against WCAG AA.

Design Checklist Score: 6 / 10
(Good bones — determinism, causal transparency, keyboard support already in place — but two
concrete gaps, interruption frequency and creature legibility, are exactly the "does the user
understand and enjoy what they're looking at" checks the brief cares most about, and both need
work before a wider beta.)
```

---

## 3. Recommendation Priority

```
IMMEDIATE (Block Beta):
- Reduce/soften Turning Point interruption cadence — currently the single biggest risk to the
  "session length" and "voluntarily return" success metrics in CLAUDE.md.
- Improve creature visual legibility on the canvas — this is the #1 "does the user understand what
  they're looking at" criterion, and right now the answer is often no.

BEFORE LAUNCH (Do ASAP):
- Add a first-run onboarding beat that points at the existing (good) legend.
- Fix the drawer header/content desync on tab switching (SettingsDrawer transition timing).
- Route hasLocalReproductiveResources() and getLocalMiasmaMutationPressure() through the existing
  CreatureSpatialIndex before beta populations push toward the 500 cap — this is a real O(N²) cost
  hiding in an otherwise well-optimized engine.
- Copy-edit the dynamically generated Turning Point headlines for internal consistency.

FUTURE (Post-Beta):
- Code-split/lazy-load the three.js WorldView chunk.
- Consolidate or visually differentiate the two speed controls.
- Progressive disclosure for advanced World/God Mode controls.
- Manual mobile/responsive pass and a numeric WCAG-contrast check.
```

---

## Environment Notes (for transparency, not code issues)

- The review sandbox's mounted copy of this repo has a filesystem quirk: files can be created but
  not deleted (`EPERM` on unlink). This briefly broke `npm run build` (couldn't clear `dist/`) and
  `npm run dev` (couldn't clear `node_modules/.vite`) — both were sandbox-only, worked around with
  a temporary output/cache dir, and are not reproducible on a normal machine.
- Side effect: because of the delete restriction, a handful of harmless Vite/Vitest
  cache-invalidation debris files were left in your repo root (`vite.config.ts.timestamp-*.mjs`,
  `vitest.config.ts.timestamp-*.mjs`, and a `vite.temp-review.config.mjs*` I created for the
  workaround). None are tracked by git (`git status` shows them all as untracked), so they're safe
  to ignore, but you'll want to delete them yourself from a terminal:
  `rm vite.config.ts.timestamp-*.mjs vitest.config.ts.timestamp-*.mjs vite.temp-review.config.mjs*`
- Also noticed (pre-existing, not caused by this review): `git status` printed a warning about
  `.git/index.lock` not being removable in this sandbox. Worth checking from your own machine that
  git isn't stuck behind a stale lock file.
- Live UI testing used the dev server you already had running locally at `localhost:5174` (the
  sandbox's own dev server isn't reachable from your browser, so this review connected to yours
  instead once confirmed).
