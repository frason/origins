# Default demo collapse diagnosis (#358)

Status: report only. No simulation source changed.

## Evidence base and limits

- **Probe execution was denied in this session.** Every attempt to run `tsx` / `npx` / `vitest` (including
  redirected output) returned "requires approval", so no new probes were run.
- All numbers below come from the existing probe output
  `state/probe358_s4242_100.txt` (seed 4242, 100x100, seasons OFF, 400 ticks, `SUMMARY` header). Its t120
  (alive 29) and t240 (alive 3) values match the figures reported in #358/#357, so it is very likely the same run,
  but it was not regenerated here.
- The "20x20 across 12 seeds, all extinct within year 1" claim was **not** re-verified.
- Code paths were read directly from `src/simulation/{creature,energy,producer,engine}.ts`.
- Counterfactual fixes have **not** been tested. The ranking below is a hypothesis to validate with a probe.

## Headline

Producers do not collapse. Energy and nutrients are not globally exhausted. Herbivores starve because of
**foraging target selection**: `scanEnvironment` treats any cell with `producerBiomass > 0` as food, and
`computeMovementTarget` picks the nearest such cell by Chebyshev distance, ignoring how much biomass it holds.
Herbivores therefore chase the thin trailing edge of depleted patches (biomass < 5) while the grid holds
lush cells (mean 70–90, ~9,800 of 10,000 cells above 5). Their intake falls below metabolic cost, and the
collapse cascades up the food chain.

## Trophic order of collapse (seed 4242, 100x100, seasons off)

| Group | Start count | First zero tick | Notes |
|---|---|---|---|
| Omnivore | 3 | t80 | Small group; loses herbivore prey and its own feeding. |
| Scavenger | 3 | t100 | Corpse pool is thin (14 corpse creatures at t80, falling); see the scavenger section. |
| Carnivore | 3 | t180 | Prey-limited: herbivores fall to ~10 by t180. |
| Herbivore | 12 | t280 | Largest group. Its decline starts after t80, when it is ~41 and falling. |

Note: "first zero" ordering is biased toward small groups. The real driver is the herbivore decline. Herbivores
peak at 41 around t80, then fall: 39 (t100), 27 (t120), 14 (t140), 8 (t160), 10 (t180), 6 (t200), 3 (t220),
2 (t240), 1 (t260), 0 (t280).

## Trajectory (alive counts, from probe)

| Tick | Alive | Herb (mean E) | Carn | Omni | Scav | Grid producer biomass | Nutrients | Herbs on bio<5 cell |
|---|---|---|---|---|---|---|---|---|
| 0 | 21 | 12 (137.5) | 3 | 3 | 3 | 109k | 450,323 | 6/12 |
| 60 | 48 | 40 (88.4) | 2 | 3 | 3 | 431k | 450,030 | 35/40 |
| 100 | 41 | 39 (64.8) | 2 | 0 | 0 | 543k | 449,976 | 37/39 |
| 120 | 29 | 27 (48.7) | 1 | 1 | 0 | 582k | 449,953 | 26/27 |
| 140 | 16 | 14 (40.4) | 1 | 1 | 0 | 614k | 449,929 | 14/14 |
| 240 | 3 | 2 (16.0) | 0 | 1 | 0 | 705k | 449,890 | 2/2 |
| 280 | 0 | 0 | 0 | 0 | 0 | 725k | 449,884 | - |

Cumulative deaths over 400 ticks: starvation 61, predation 14, environmental-stress 3.
Births over 400 ticks: 57 total (most in t0–t80).

## Dominant cause by layer

1. **Producers: not limiting.** Grid biomass rises monotonically (109k → 725k). Grassland/forest mean reaches
   ~90–117 against a cap of 100. The problem is not production.
2. **Nutrients: not limiting.** The nutrient pool is effectively constant (450,323 → 449,884, under 0.2% drop).
   The nutrient cycle does not explain the collapse.
3. **Energy (aggregate): not limiting.** Biomass is abundant. Local intake is the problem.
4. **Herbivore intake (primary cause).** From `src/simulation/creature.ts` (food detection around line 415):
   `cell.producerBiomass > 0` counts as food, and `findNearestTarget` (around line 580) selects the nearest food
   by Chebyshev distance with no biomass weighting. Herbivores move to the nearest trace-biomass cell, graze it
   to near zero, then move on. The probe agrees: herbivore mean local biomass falls from 9.2 (t0) to 0.8 (t100)
   and ~0.0–0.2 from t140 on, while 97–99% of cells are above 5. Bite capacity is about 19 biomass per tick for a
   size ~0.94 creature (`getProducerBiteCapacity`), but the cells they reach hold far less, so intake stays
   small. Energy then falls under metabolism.
5. **Predation / reproduction (secondary).** Predation accounts for only 14 of 78 deaths. Births are rare after
   t80 (0–6 per window) because herbivores sit well below the reproduction threshold (`REPRODUCTION_ENERGY_THRESHOLD`
   = 150, cost 75). Once below ~40 energy they cannot rebound, so the decline is self-reinforcing.
6. **Scavengers / omnivores.** They collapse first because they depend on herbivore kills and corpses. Corpse
   biomass peaks around 356 at t120 and is ~0 by t320; decomposition is not the bottleneck.

Dominant cause: **energy access (foraging target selection), not energy supply, nutrients, or reproduction cost.**

## Recommended minimal fixes (ranked, candidate issues)

1. **Biomass-aware foraging target** (`src/simulation/creature.ts`: food scan around line 415 and
   `computeMovementTarget` / `findNearestTarget` around line 580). Only treat cells above a minimum useful
   biomass (for example >= 5, the same threshold `hasLocalReproductiveResources` already uses) as food, or
   rank targets by biomass per unit distance. Expected to cut the trailing-edge grazing loop. Validate with a
   probe on seed 4242 (20x20 and 100x100): herbivore alive at t240 should exceed 3. This is the highest-leverage
   candidate and is a logic change, not a balance-constant change.
2. **Herbivore grazing regrowth check** (`src/simulation/producer.ts`, `calculateProducerGrowth`). Growth is
   proportional to `cell.energy` and has no minimum floor. Confirm whether residual biomass near zero regrows
   slowly enough to stall grazing. Probe only; do not change until fix 1 is measured.
3. **Reproduction recovery** (`src/simulation/engine.ts` / constants `REPRODUCTION_ENERGY_THRESHOLD` = 150,
   `REPRODUCTION_ENERGY_COST` = 75). Consider a lower threshold only after fix 1, so the constants are not tuned
   to mask the foraging defect. Balance-only; defer.
4. **Scavenger corpse supply** (`src/simulation/engine.ts`, `hasLocalReproductiveResources` scavenger range 2/6).
   Low priority: scavengers follow herbivore mortality and should recover once herbivores stabilize.

## Follow-up

- Re-run the probe with approval for `tsx` (`scripts/probe-demo-collapse-358.ts 20 960 4242,1,2 40 detail` and a
  100x100 run) to confirm the numbers here and to measure fix 1 in a scratch copy.
- Do not change constants (`src/utils/constants.ts`) as part of this issue. Per #358, this is diagnosis only.
