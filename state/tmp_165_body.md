Parent: #155

## Why this is narrower than before
4 straight worker attempts (2026-08-27 through 2026-08-31) failed the same way karen's own
history shows on #164 (7 rounds) and #163/#161/#160 before their pass-67 narrowing: worker
claims "completed" but writes no `state/worker_output_165.txt` and nothing is committed. Same
root-cause diagnosis as #273 (closed) — this issue's original scope (data model + evidence
thresholds + drift/mutation/selection/speciation classification + wiring into 3 separate UI
surfaces) is too large for one Haiku run to finish and commit. Narrowing to the same
commit-first pattern that got #164 to a real PASS.

## Goal (this issue only)
Record bounded, deterministic trait-frequency summaries per lineage over time windows, with
storage that stays bounded for long runs. **No UI wiring, no adaptation-labeling/evidence-
threshold logic, no drift/mutation/selection/speciation classification in this issue** — those
are split into follow-up issues (see below) so this one can land as a small, real commit.

## Scope
- Add a bounded, deterministic trait-frequency tracking structure (e.g. per-lineage histogram
  or rolling summary, keyed by trait, updated each tick or on a fixed sampling interval) fed by
  existing lineage/trait data already in the engine.
- Bound memory: cap history length/window count so long simulations don't grow unbounded
  (ring buffer or decay/eviction of old windows is fine — pick the simplest deterministic
  approach and document it in the code comment).
- Save/load: the new structure round-trips through checkpoint save/load; loading an old save
  without it initializes empty/default, no crash.
- A minimal deterministic unit test proving: same seed -> identical trait-frequency summaries
  across two runs.

## Done when
- New tracking structure exists, is wired into the tick loop's existing lineage/trait update
  path, and is covered by the determinism test above.
- `npm run build` and full test suite pass with zero new failures (run both, don't just inspect).
- Change is actually committed (`git log` shows it) — this is the single most important
  criterion given the failure history above. Commit as soon as the structure + test pass, before
  attempting any polish.

## Output
Write a concise summary (<=40 lines) to state/worker_output.txt, including confirmation the
change is committed (paste the commit hash).

<!-- agent-planned -->
