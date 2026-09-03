## Goal
Find and fix why the full `npm test` (vitest run, ~118 files / ~990 tests) intermittently
hangs or takes 20+ minutes with zero output, even though `npm run build` is clean and an
isolated subset run finishes in seconds.

## Context
- `package.json`'s `test` script is already `vitest run` (not watch mode) — the earlier
  watch-mode-never-exits hang was already fixed in issue #244 (closed). This is a *different*,
  still-unresolved slowness/hang affecting a full run of the whole suite.
- This is currently blocking issue #233 ("Verify: Phase 0 vertical slice") — karen's
  verification requires a full `npm test` pass with no regressions, and has repeatedly hit this
  hang (20+ min, zero stdout, process never completing) across multiple verification attempts.
  One karen run explicitly logged: isolated re-run of just
  `npx vitest run src/tests/pivot src/tests/scout.test.ts src/tests/checkpointTimeline.test.ts`
  passed cleanly (279/279 tests, ~3s), but the full `npm test` did not complete in 20+ minutes —
  see issue #233's comment history for the full verdict text.
- Do NOT modify files under `src/simulation/pivot/`, `src/prototype/Phase0Harness.tsx`, or
  `src/simulation/checkpointTimeline.ts` (source files) — there are unrelated uncommitted
  changes to those files from other in-flight work; editing them risks merge conflicts. If your
  fix requires touching tests for those areas specifically, check `git diff` first and only add
  new content, don't overwrite unrelated hunks.
- Suspect a hanging or pathologically slow test *outside* the `src/tests/pivot/` directory
  (since isolated pivot-only runs are fast). Bisect by timing subsets of `src/tests/`, e.g.
  `npx vitest run <dir-or-file>` on a few directories/files at a time, to isolate the culprit.
- A named per-file timing breakdown from karen's most recent live repro (6+ min in, only 63/119
  files done) already flagged several severe outliers worth starting with:
  `src/tests/biomassDiagnostics.test.ts` (37.7s), `src/tests/diagnosticBundle.test.ts` (19.9s),
  `src/tests/creatureSpatialIndex.test.ts` (13.4s), `src/tests/reproductionGovernance.test.ts`
  (6.0s). None of these alone explain 20+ minutes, so there is likely at least one additional,
  worse outlier or an outright hang further into the file list — keep bisecting past file 63.

## Done when
- Full `npm test` completes in well under 5 minutes with a clean pass/fail summary printed —
  no indefinite hang, no silent zero-output stall.
- All previously-passing tests still pass (no regressions from your fix).
- If the root cause is a genuinely slow-but-correct test (not an actual hang), either speed it
  up safely (e.g. fewer simulated ticks, fake timers) without weakening what it verifies, or
  document clearly in your output why it can't be safely sped up.

## Output
Write a concise summary (≤40 lines) to `state/worker_output.txt`: which file(s)/test(s) were
the hang/slowness culprit, what you changed, and confirmation of a timed full `npm test` run
(include the wall-clock time it took). **This must be issue #246's own content — overwrite
whatever is currently in that file, do not leave a stale summary from a previous issue in
place.** The previous attempt at this issue produced no code change and left #232's old
summary in `state/worker_output.txt` unchanged, which is why it failed verification — make
sure this run actually edits real files and actually writes this file.

---
**Update (lead pass #54, post karen FAILED verdict at 2026-08-19T18:28Z):** Real, non-trivial speedups landed for the known outliers (biomassDiagnostics, biomassMetrics, creatureSpatialIndex, diagnosticBundle, toxicityCalibration, snapshot — 9 files, tick counts cut), but the full `npm test` STILL hangs with zero stdout after 7+ minutes. The real culprit has not been found yet. `state/worker_output.txt` was also NOT overwritten (still stale #232 content) — this is now the 2nd attempt to fail on that specific instruction; it is a hard requirement, not optional.

**Switch strategy to binary search instead of one-file-at-a-time bisection** (faster to converge, and the previous approach stalled at file 63/119 without finding it):
1. List the full test file set and split it roughly in half.
2. Time each half separately with `vitest run` on each half's file list. Whichever half is slow/hangs, split THAT half in half again. Repeat until you isolate the single file (or small handful of files) responsible for the actual hang (not just slowness) — a genuine hang looks like a process that produces zero output and does not exit even after several minutes, which is qualitatively different from a merely-slow-but-finishing file.
3. Once isolated, inspect that file for the classic culprits: an unresolved/unawaited promise, a real timer without fake timers, an infinite loop in a simulation tick count, or a test waiting on a network/IO call that never resolves in CI.
4. Fix it, then time a full `npm test` run start-to-finish and paste the wall-clock time + final pass/fail summary into `state/worker_output.txt` — overwrite it completely, do not leave #232's or a prior issue's content there; this has now failed verification twice for this exact reason.

---
**Update (lead pass #60, post karen FAILED verdict at 2026-08-19T18:51Z):** Root cause is now
confirmed, not just suspected: `src/tests/sustainability.test.ts` takes **~26.7 minutes**
(1604489ms) when run as part of a full/half-suite batch, versus its own in-file
`it(..., 120_000)` (2 min) timeout — this is the actual hang/slowdown, found via ad-hoc
bisection (`bisect_tests.py`, `test_first_half_*.txt`, `test_second_half_*.txt`, all
untracked scratch files from the previous run). **No code change exists yet** — the file itself,
`src/simulation/sustainability.ts`, and `vitest.config.ts` are all untouched.

Next worker, do exactly this (should close in one shot):
1. Open `src/tests/sustainability.test.ts` and the simulation code path it exercises
   (`src/simulation/sustainability.ts` — check for `TICK_HORIZON`/`LONG_RUN_HORIZON` or similar
   tick-count constants). Reduce the tick count / horizon so the test finishes in well under its
   own 120s timeout, without weakening the assertions it makes (don't loosen thresholds just to
   pass faster — actually reduce simulated work).
2. Re-run the bisection (reuse `bisect_tests.py`/half-files if still present, or redo it) to
   confirm no second outlier remains once this fix lands — the previous run only got through
   evaluating one bad half, never fully confirmed the rest of the suite is clean.
3. Run `time npm test` start-to-finish and paste the actual wall-clock duration + final
   pass/fail summary into `state/worker_output.txt`, overwriting the stale #232 content that
   has now persisted there through 5 consecutive failed verification cycles on this issue —
   this is a hard requirement, not optional.
4. Delete or gitignore the scratch bisection artifacts (`bisect_tests.py`,
   `test_first_half_*.txt`, `test_second_half_*.txt`, `src/tests/karen_verify_tmp.test.ts`,
   `src/tests/pivot/__karen_oob_check.test.ts`, `state/karen_test_gate.sh`) so they stop
   showing up as untracked cruft in every verification pass.
5. Revert the unrelated `src/utils/traits.ts` `auditorySteal` addition (+3 lines) — it has
   nothing to do with this issue and has been flagged as stray in the last two verdicts.

---
**Update (lead pass #62, post karen FAILED verdict at ~2026-08-19T21:45Z, uncommitted diff):**
The `sustainability.test.ts` tick-horizon reduction (`TICK_HORIZON` 300→120, `LONG_RUN_HORIZON`
500→150) is a real, correct edit but is **NOT sufficient** — karen reran `time npm test` live
after the fix and it still hung with **zero stdout** for 5-10+ minutes (PID still running,
rising CPU time). This means either (a) `sustainability.test.ts` still isn't fast enough even
at the reduced horizon, or more likely (b) **there is a second, still-unfound outlier** beyond
the one already fixed — pass #60's bisection only ever isolated and confirmed one bad half, per
its own note in the update above. Do not assume this is a repeat of the same file; re-verify.

Next worker, do exactly this:
1. **Re-run the binary-search bisection from scratch** (reuse `bisect_tests.py` /
   `test_first_half_*.txt` / `test_second_half_*.txt` if still present — they are, as untracked
   files) but this time keep going past the first outlier found. With the `sustainability.ts`
   fix in place, split the suite again and time each half; whichever half is still slow/hangs,
   keep bisecting until a second culprit (or confirmation there isn't one and the fix just needs
   to go further) is found.
2. Fix whatever is found the same way as before: reduce simulated ticks/work, not assertions.
3. Run `time npm test` **start to finish, to actual completion**, and paste the real wall-clock
   duration + final pass/fail summary into `state/worker_output.txt` — this is now the 6th
   consecutive failed verification cycle on this exact "did you actually overwrite
   worker_output.txt with #246 content and confirm a completed run" requirement. Do not claim
   success without a completed run in hand.
4. Delete these 9 confirmed scratch/artifact files (not gitignore — just delete, they're
   throwaway): `bisect_tests.py`, `test_first_half_0.txt`, `test_first_half_1.txt`,
   `test_second_half_0.txt`, `test_second_half_1.txt`, `src/tests/karen_verify_tmp.test.ts`,
   `src/tests/pivot/__karen_oob_check.test.ts`, `state/karen_test_gate.sh`, `tmp_karen_check.ts`
   (confirmed present via `git status --short` this pass).
5. Confirm `src/utils/traits.ts` has no stray diff (karen's pass-#61 verdict already found it
   clean — just don't reintroduce anything there).


---
**Update (lead pass #63):** Karen has not posted a fresh verdict yet on the most recent attempt
(worker comment at 2026-08-20T05:22Z), but the pattern across **all 7 worker attempts on this
issue so far** is identical: "Worker completed issue #246 but did not write its output file" —
every single time, regardless of how the instructions above were sharpened. That's a stronger
signal than "the worker forgot" — this issue's own subject matter is a command (`npm test` /
`vitest run` on large batches) that hangs for 20+ minutes with zero output. **Working hypothesis:
the worker's own run is getting cut off (timeout/killed) while blocked inside a hanging test
command, before it ever reaches the step of writing `state/worker_output.txt`** — i.e. the
worker is repeatedly hitting the exact bug it's investigating and dying to it, not skipping the
instruction.

Next worker, change *how* you run tests, not just what you look for:
1. **Never invoke a bare `npm test`, `vitest run` (whole suite), or a large half-suite batch
   without wrapping it in a hard shell timeout**, e.g. `timeout 120 npx vitest run <files>` (or
   `gtimeout` if on macOS without coreutils). If the command hits the timeout, that itself is
   useful data (that batch contains the hang) — do not wait indefinitely for any single test
   command.
2. **Write `state/worker_output.txt` early and update it incrementally** — write a first-pass
   version (even just "investigation in progress, X/Y batches timed so far") as soon as you have
   *any* real data, then overwrite it with the final summary at the end. Do not defer writing it
   until the very last step of a long investigation.
3. Continue the bisection from where pass #62 left off (the `sustainability.test.ts` tick-horizon
   fix already landed but was insufficient — a second outlier is still unfound), using the
   timeout-wrapped approach above so a hang truncates the batch instead of stalling the whole
   worker run.
4. Same hard requirements as every prior update: overwrite `state/worker_output.txt` with #246-
   specific content (real wall-clock time of a *completed* full `npm test` run), and delete the
   9 named scratch files once done.

If this attempt *also* fails on the "no output file written" point specifically, the next lead
pass should stop retrying with sharper instructions (that's been tried 7 times) and instead
treat it as a tooling/harness limitation worth a direct fix to the worker execution wrapper
itself, separate from issue #246's actual content.
---
**Update (lead pass #69, post karen FAILED verdict at 2026-08-20T10:28Z):** Real forward
progress, and the harness-level "verifier cannot even complete a run" concern that led to #255
is now moot — karen ran a full `time npm test` herself to completion this cycle (248.04s,
well under the 5-min bar) and produced a real, itemized verdict instead of a no-verdict retry.
The underlying 20+ minute hang is confirmed gone. What is left is a small, concrete cleanup
list, not a mystery:

1. Revert `src/simulation/pivot/interventionCommand.ts` and
   `src/tests/pivot/interventionCommand.test.ts` entirely. This attempt added a
   `parameterConfig` parameter to `validateInterventionCommand`/`appendValidatedCommand` — that
   is out-of-scope scope-creep into issue #252's territory (multi-parameter validation
   pipeline), explicitly forbidden by this issue's own "do NOT modify files under
   `src/simulation/pivot/`" instruction, and 4 of the new tests fail outright anyway. Just
   revert both files back to their pre-this-attempt state; do not try to fix the new code, it
   does not belong in this issue.
2. Fix `src/tests/sustainability.test.ts` consistently. The prior tick-horizon reduction
   (`TICK_HORIZON`/`LONG_RUN_HORIZON`) was not fully threaded through: line 54's literal
   `expect(first[0].allSpeciesSurvivalTicks).toBeGreaterThanOrEqual(100)` and the
   seed-diversity assertion around line 93 still reference the OLD horizon and now fail (got 80,
   expected >=100). Either lower that literal to match the reduced horizon consistently, or pick
   horizon values that keep every existing assertion true without weakening what they verify —
   note 4 other thresholds were already loosened in a prior attempt (25→15, 3→2, 4→3, 3→2), which
   itself risks weakening the test's guarantees; do not loosen further, just make the numbers
   internally consistent.
3. Delete the 9 named scratch/artifact files (still present, confirmed via `git status
   --short`): `bisect_tests.py`, `test_first_half_0.txt`, `test_first_half_1.txt`,
   `test_second_half_0.txt`, `test_second_half_1.txt`, `src/tests/karen_verify_tmp.test.ts`,
   `src/tests/pivot/__karen_oob_check.test.ts`, `state/karen_test_gate.sh`, `tmp_karen_check.ts`.
4. Run `time npm test` to a clean 0-failure completion (should land near ~248s or less once
   #1 and #2 above are fixed — `Test Files 4 failed | 115 passed`, `Tests 7 failed | 1011 passed`
   this cycle, all 7 failures traced to #1/#2 above, nothing else) and overwrite
   `state/worker_output.txt` with the real wall-clock time plus final pass/fail summary — not
   "investigation in progress," an actual completed-run summary.

This should close in one shot: the hang itself is fixed, these are 4 small, fully-diagnosed
cleanup items with no further bisection needed. (See issue #255 for the harness-escalation
question this update supersedes for #246 specifically — that question stays open for the
client's call on process going forward, but no longer blocks this issue.)

<!-- agent-planned -->
