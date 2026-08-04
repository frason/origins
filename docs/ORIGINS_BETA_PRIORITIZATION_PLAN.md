# Origins: Beta Prioritization Plan

**Repository:** [frason/origins](https://github.com/frason/origins)  
**Planning date:** 2026-07-19  
**Source review:**
[Origins Game Design and Architecture Review](./ORIGINS_DESIGN_ARCHITECTURE_REVIEW.md)

## Purpose

This document turns the full design and architecture review into a beta-readiness plan.
It is intended as a handoff to the agent implementing the next phase of Origins.

The priority is testable fun and product truth, not architectural perfection. A beta
tester must be able to:

1. Witness meaningful evolution before the ecosystem collapses.
2. Understand the pressure that caused an outcome.
3. Make an intervention with a visible consequence.
4. Return to the same world after refreshing or closing the browser.
5. Submit enough deterministic context to reproduce a problem.

The complete reasoning, source audit, balance results, UX findings, and long-term
architecture recommendations remain in the
[full review](./ORIGINS_DESIGN_ARCHITECTURE_REVIEW.md).

## Priority Summary

| Priority | Outcome | Required for beta? |
| --- | --- | --- |
| P0.1 | First-run ecosystems survive long enough to evolve | Yes |
| P0.2 | Corpse-driven mutation is mechanically real | Yes |
| P0.3 | Life, hazards, and mutation pressure are readable | Yes |
| P0.4 | Worlds persist and bug reports are reproducible | Yes |
| P0.5 | New players complete one observation/intervention loop | Yes |
| P1.1 | Players can monitor important autonomous changes | Closed beta |
| P1.2 | God Mode has clear rules and consequences | Closed beta |
| P1.3 | Timeline explains causality | Closed beta |
| P1.4 | Notable species persist in a minimal journal | Closed beta |
| P2 | Scaling rewrites, campaigns, and advanced simulation | Defer |

## P0: Beta Blockers

### P0.1 Fix First-Run Balance

Promote the balanced-longevity preset into the default baseline, then tune it across a
larger deterministic seed matrix. The current default values routinely cause complete
extinction before producing a mutation, which prevents testers from experiencing the
game's central promise.

#### Implementation Tasks

- Start default tuning from `BALANCED_LONGEVITY_PRESET` in
  `src/utils/constants.ts`.
- Preserve the old default as a named stress-test preset if it remains useful.
- Expand sustainability evaluation from three seeds to at least ten curated seeds.
- Track time to first birth, mutation, persistent mutation, extinction, and speciation.
- Track time spent at the global population cap.
- Include at least one intentionally difficult seed so all worlds do not converge on the
  same stable outcome.

#### Ship Gate

- At least 80% of curated seeds retain living creatures through tick 500.
- The first mutation usually occurs by tick 50-75.
- At least two ecological roles survive through tick 250 in most seeds.
- Outcomes vary meaningfully between seeds.
- Populations do not spend long periods pinned to the hard cap.
- Same-seed reruns remain identical.

### P0.2 Make Corpse-Driven Mutation Mechanically Real

Implement the smallest viable local mutation-hotspot system. Do not simulate individual
bacteria for beta.

#### Minimum Model

Add deterministic environmental fields such as:

```ts
interface CellEcology {
  nutrients: number;
  corpseBiomass: number;
  bacteriaDensity: number;
  toxicity: number;
}
```

Required behavior:

1. Corpses deposit biomass and nutrients during decomposition.
2. Available corpse biomass supports local bacterial growth.
3. Bacteria diffuse or expand locally and decay over time.
4. Local bacteria increase offspring mutation probability.
5. Toxicity independently suppresses producers and reproductive viability.
6. Scavenging reduces corpse biomass and shortens the hotspot lifetime.

Example formulas:

```ts
const localMutationRate = clamp(
  baseMutationRate * (1 + 3 * cell.bacteriaDensity),
  baseMutationRate,
  0.6
);

const embryoViability = Math.exp(
  -cell.toxicity * creature.traits.toxicitySensitivity
);
```

#### Required Tests

- A corpse deterministically creates a bacterial hotspot.
- The field spreads and decays identically for the same seed and state.
- Births inside a hotspot have a higher mutation rate than a control region.
- Extreme toxicity reduces successful reproduction or survival.
- Scavenging reduces the duration or intensity of the field.
- Snapshot and recipe replay remain deterministic.

#### Product Constraint

If this system cannot ship before beta, remove bacterial-swarm and mutation-hotspot
claims from beta messaging. The interface must not describe causality the engine does
not implement.

### P0.3 Make The World Readable

Add a compact, persistent layer toolbar:

- Terrain
- Biomass
- Life density
- Toxicity
- Mutation pressure
- Lineages

Each layer needs a numeric or categorical legend. Toxicity and mutation pressure must
not share the same visual treatment.

#### Rendering Rules

- Use hue for species.
- Use glyph shape for ecological strategy.
- Use glyph size for size class.
- Use outline or halo for health and exposure.
- Use contours or stipple density for toxicity.
- Use a separate pulse or edge treatment for mutation pressure.
- Use density glyphs instead of individual pixels at full-world zoom.
- Show individual organisms only at closer semantic zoom levels.

#### Mobile Fix

Constrain the world to a true square and use remaining space for compact monitoring or
a bottom sheet. Remove the large vertical letterboxing observed at 390 x 844.

```css
.app-shell__world {
  display: grid;
  place-items: center;
}

.world-view {
  width: min(100%, calc(100dvh - 11rem));
  height: auto;
  aspect-ratio: 1;
}
```

#### Ship Gate

- A tester can distinguish organisms, corpses, toxicity, and mutation pressure without
  opening the tile inspector.
- Every environmental overlay has a visible legend.
- Selecting a hazard explains strength, trend, and affected organisms.
- Desktop and 390 x 844 mobile layouts contain no major overlap or letterboxing.

### P0.4 Add Persistence And Reproducible Bug Reports

A beta world must survive refreshes and browser restarts.

#### Implementation Tasks

- Automatically save the authoritative engine state locally.
- Restore the most recent compatible world on launch.
- Provide at least `Continue`, `Start over`, and `Export world` actions.
- Version the persisted schema and provide deterministic migration defaults.
- Handle corrupted or incompatible saves without trapping the player.
- Create an exportable diagnostic bundle.

The diagnostic bundle should contain:

```ts
interface BetaDiagnosticBundle {
  appVersion: string;
  commit: string;
  seed: number;
  tick: number;
  constants: SimulationConstants;
  interventions: SimEvent[];
  recentEvents: SimEvent[];
  snapshot: WorldSnapshot;
}
```

#### Ship Gate

- Refreshing restores the same tick, creatures, fields, history, and constants.
- Exported worlds replay identically on another browser session.
- A submitted diagnostic bundle reproduces the reported state.
- Incompatible saves display a recoverable error with export/reset options.

### P0.5 Create A Minimal First-Run Loop

Do not build a long tutorial or a marketing landing page. Use contextual objectives in
the playable world:

1. Run until the first ecological pressure appears.
2. Inspect the affected region or lineage.
3. Make one intervention and observe the measured outcome.

Pause automatically for the first major mutation, extinction risk, and toxic hotspot.
Each notice should provide `Focus`, `Inspect`, and `Continue` actions.

#### Ship Gate

- A new tester can complete the observation/intervention loop without external help.
- The tutorial never requires changing raw simulation constants.
- The player can skip or dismiss guidance permanently.
- The UI explains correlation honestly and does not claim exclusive causation.

## P1: Closed-Beta Value

### P1.1 Monitoring And Alerts

Add a watchlist for autonomous play:

- Followed-lineage population thresholds.
- Extinction risk.
- A mutation surviving multiple generations.
- Toxicity or bacteria crossing a regional threshold.
- A missing trophic role.
- Sudden changes in birth or death rate.
- A followed lineage entering a new biome.

Each alert should offer `Focus`, `Pause`, and `Compare with 50 ticks ago`.

### P1.2 Reshape God Mode

Separate two explicit rule sets:

- **Laboratory Sandbox:** unlimited constants and interventions; world visibly marked as
  modified.
- **Stewardship:** spatial interventions with limits, cooldowns, or ecological debt.

For beta, avoid a complicated economy. Track intervention count, show the affected
footprint, preserve a checkpoint, and report before/after ecosystem deltas.

Do not expose a species brainpower control until brain size has a real behavioral effect.

### P1.3 Upgrade The Timeline

Add:

- Labeled axes and units.
- Hover/cursor tick inspection.
- Selectable population, species, and lineage series.
- Birth, death, mutation, extinction, disaster, and intervention markers.
- Before/after intervention shading.
- Click-to-focus for the relevant region or lineage.

The timeline must help a tester answer, "What changed, when did it change, and what may
have contributed?"

### P1.4 Build A Minimal Field Journal

Record notable species and lineages with:

- Founder and descendants.
- Population trend.
- Major mutations.
- Geographic range.
- Extinction status and likely cause.
- Related player interventions.

Defer generated art, complex morphology, and cross-world collection progression until
beta evidence shows that players care about individual species histories.

## P2: Explicitly Deferred Work

Do not delay beta for the following unless profiling or testing exposes a blocker:

- Worker migration.
- Typed-array or entity-storage rewrite.
- WebGL rendering.
- Individual bacterial agents.
- Full campaign progression.
- Daily challenges and leaderboards.
- Complex disasters, hydrology, seasons, and pathogens.
- Social intelligence or learning.
- Unlockable mutation trees.
- Full bestiary art generation.
- Species brainpower controls.

The current architecture is adequate for a bounded beta population. Profile before
rewriting it.

## Delivery Milestones

### Milestone 1: Evolution Works

- First-run balance uses a viable baseline.
- The expanded seed matrix passes.
- Corpse-driven local mutagenicity is implemented.
- Determinism and hotspot/control tests pass.
- Inert-trait audit identifies what must be hidden or activated.

### Milestone 2: Evolution Is Legible

- Layer controls and legends ship.
- Hazards and organisms have separate visual channels.
- Semantic zoom or world-scale density representation ships.
- Mobile world sizing is corrected.
- First-run pressure and mutation notices focus the relevant location.

### Milestone 3: Beta Is Operable

- Local save/resume and schema versioning ship.
- Diagnostic world export ships.
- Minimal first-run objectives ship.
- Monitoring alerts ship or are feature-flagged for closed beta.

### Milestone 4: Closed Beta

- Timeline causality improvements ship.
- Minimal Field Journal ships.
- God Mode rule sets are clearly labeled.
- Intervention previews and before/after comparisons ship.
- Usability findings from internal playtests are addressed.

## Beta Acceptance Matrix

| Area | Acceptance criterion |
| --- | --- |
| Balance | 8 of 10 curated seeds retain life through tick 500 |
| Evolution | First mutation usually appears by tick 50-75 |
| Diversity | Most seeds retain at least two ecological roles through tick 250 |
| Causality | Tester can identify one pressure and its likely consequence |
| Agency | Tester completes one intervention and evaluates its result |
| Persistence | Refresh restores the exact compatible world state |
| Reproduction | Diagnostic export recreates a reported world |
| Desktop UX | No major overlap at 1440 x 1000 |
| Mobile UX | No major overlap or letterboxing at 390 x 844 |
| Performance | A 30-minute accelerated session remains responsive |
| Reliability | Full unit suite and production build pass |
| Accessibility | Keyboard world inspection and dialogs remain usable |

## Suggested Internal Playtest Script

1. Start a new world without opening God Mode.
2. Run at normal speed until the first pressure or mutation notice.
3. Ask the tester what they think happened before showing detailed data.
4. Inspect the relevant tile, region, and lineage.
5. Apply one spatial intervention.
6. Advance at least 50 ticks and inspect the before/after comparison.
7. Refresh the browser and verify the world resumes exactly.
8. Export a diagnostic bundle and import/replay it in a clean session.
9. Continue at accelerated speed for at least 30 minutes.
10. Ask the tester to recount the world's most memorable causal story.

## Agent Working Rules

The implementing agent should:

- Preserve deterministic same-seed behavior and update snapshots intentionally.
- Add tests before changing balance-critical or replay-critical formulas.
- Keep beta work scoped to the milestones above.
- Avoid architectural rewrites without profiling evidence.
- Treat UI claims as contracts with the underlying simulation.
- Report balance results across the seed matrix, not only a favored demo seed.
- Verify desktop and mobile layouts through rendered screenshots.
- Keep sandbox freedom separate from challenge integrity.

## Final Beta Question

The beta is ready when a new player can answer yes to this question:

> Did I witness a comprehensible evolutionary story, care about its outcome, make a
> decision, and understand enough of the result to want to try another world?

Feature count is secondary. That experience is the beta product.
