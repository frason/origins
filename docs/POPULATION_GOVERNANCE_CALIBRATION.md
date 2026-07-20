# Population Governance Calibration

Issue: #147  
Calibration date: 2026-07-19  
Command: `npm run calibrate:population -- --measure-runtime`

## Decision

Remove the legacy global monoculture mortality penalty from the default policy in a follow-up
change. Keep the deterministic global population cap, local resource pressure, reproduction
restraint, and costly dispersal.

The legacy rule did not prevent collapse, preserve diversity, or improve evolution in this
calibration. It shortened three of four runs and added a global death lottery whose cause is less
transparent than local scarcity. Disabling only that penalty remained bounded, produced distinct
seed trajectories, stayed within the runtime gate, and delayed extinction without causing runaway
population or mutation.

This report recommends the policy change; it does not silently change the default constant.

## Method

The headless suite compared two candidates over seeds `42`, `12345`, `54321`, and `99999` for 500
ticks, sampling every 25 ticks:

- `current-default`: all current simulation constants.
- `without-legacy-monoculture-mortality`: identical constants except
  `monocultureMortalityPenalty = 0`.

Hard gates require at least 50% survival through the horizon, population at or below 500,
evolutionary activity between 0.001 and 1 event-equivalent per tick, non-stagnant trajectories,
at least half of seed trajectories to be distinct, and mean tick cost at or below 100 ms.
Deterministic replay is covered by byte-identical calibration-report tests when runtime timing is
disabled. The configured 500-creature ceiling and two-tick deterministic performance probe are
covered by the dispersal suite; oversized imports are deterministically reduced to their configured
cap by the monoculture suite.

## Evidence

| Candidate | Extinction ticks | Maximum populations | Mutations | Mean tick cost | Gate result |
| --- | --- | --- | --- | --- | --- |
| Current default | 500, 172, 229, 261 | 31, 30, 31, 34 | 2, 0, 6, 6 | 60.50 ms | Failed survival share |
| No legacy mortality | 500, 500, 500, 500 | 35, 30, 39, 45 | 2, 0, 6, 3 | 34.98 ms | Failed survival share |

Both candidates stayed far below the 500-creature cap and produced non-identical bounded
trajectories. Neither produced speciation. All no-legacy runs reached the last tick but registered
extinction at tick 500, so they correctly fail the survival gate rather than being reported as
healthy. The no-legacy candidate had no population-ceiling, stagnation, cross-seed-uniformity,
runaway-evolution, or runtime failure.

Producer depletion remained severe: mean depleted occupied-tile share was 0.827 for the current
default and 0.887 without legacy mortality. This is evidence that removing the global death lottery
is not, by itself, an ecosystem-balance fix. Biomass recovery, food access, and late-life population
replacement remain the next calibration targets.

## Safety and observability

- Birth slots are capped before reproduction at `maxGlobalPopulation`.
- Oversized imported populations are deterministically culled back to the configured cap.
- Every cap intervention is emitted as a death event with cause `overcrowding` and is counted in
  calibration outcomes as `overcrowdingDeathCount`.
- Calibration now rejects flat trajectories and insufficiently distinct cross-seed trajectories.
- Calibration separately rejects evolutionary stagnation and runaway evolutionary activity.

## Follow-up

Change the default `monocultureMortalityPenalty` to zero, retain the control in God Mode for
experimentation, and update the monoculture tests and player-facing guidance. Then address the
shared tick-500 collapse through local biomass and replacement dynamics rather than restoring a
global stochastic mortality rule.
