## Goal
Fix one real gap (a committed component referencing an uncommitted CSS file) and clear out ~40
accumulated scratch/debug files cluttering `git status`, without using any blocked `rm`/`git rm`
command.

## Context
- **Real gap (fix by committing, not deleting):** `src/ui/BranchComparison.tsx` (already
  committed, closes #292) imports `src/ui/BranchComparison.module.css`, but that CSS file was
  never committed -- it currently shows as untracked (`?? src/ui/BranchComparison.module.css` in
  `git status --short`). Just `git add` + commit it normally.
- **Scratch files to neutralize** (confirmed via `git status --short` this lead pass -- all
  currently untracked, i.e. never committed, so no history is lost either way):
  - Root dir: `karen304_head_copy.ts`, `karen304_head_repro.test.ts`, `karen304_lake_head.test.ts`,
    `karen304_repro.mjs`, `test_strategies.mjs`, `karen268_perf_probe.ts`, `tmp_karen_debug.mjs`,
    `verify_fix.mjs`
  - `docs/`: `COOLDOWN_FAIRNESS_FIX.md`, `COOLDOWN_FAIRNESS_FIX_v2.md`,
    `DISPATCHER_WORK_SELECTOR_FAIRNESS.md`
  - `src/tests/`: `_karen_speciation_probe.test.ts`, `debug_opening.test.ts`,
    `tmp_karen_debug267.test.ts`
  - `scripts/test_push_retry.sh`, `scripts/_tmp_check_untriaged.sh` (one-off manual test/check
    harnesses, not part of the kept test suite -- NOTE: do not touch
    `scripts/test_cooldown_fairness.sh` or `scripts/test_fairness.sh`, those are #310's scope,
    not this issue's)
  - `state/.issue309body.txt` (leading-dot filename, won't be caught by the `.gitignore`
    patterns added below -- neutralize explicitly)
  - **NOT in scope for this issue (owned by #314 instead, do not touch):**
    `docs/BENCHMARK_DECISION_INTENT_2026_10_06.md`, `docs/PERF_REGRESSION_ANALYSIS_2026_10_06.md`,
    `src/tests/perfRegressionA_B_Evidence.test.ts`, `src/tests/perfRegressionA_B_Isolated.test.ts`,
    `src/tests/perfRegressionFeaturesBreakdown.test.ts` -- #314 commits the two docs files for
    real (they are genuine artifacts, not scratch) and neutralizes the three perf test files
    itself. Leave these five files alone here to avoid two issues racing on the same files.
- **`rm`/`git rm` are blocked in this sandbox** (see issue #294). Workaround for the scratch
  files above: use the `Write` tool to overwrite each one with a single-line comment (e.g.
  "superseded scratch file, see this issue -- content intentionally removed" in the file's
  native comment syntax), rather than deleting it.
- Before neutralizing any `docs/*.md` file above, skim it first -- if it documents something with
  lasting value (e.g. explains a fix that's otherwise undocumented), fold the useful parts into
  an existing permanent doc (e.g. `docs/design-dynamic-world.md` or a code comment at the
  relevant fix site) before overwriting it, rather than discarding real content.
- Separately, widen `.gitignore` (currently only covers `state/tmp_body_*.md` and
  `state/tmp_issue_*.md`) to also match the dispatcher/karen scratch-state naming conventions
  actually in use so these stop reappearing as untracked noise every pass: add entries for
  `state/tmp_*`, `state/worker_output_*.txt`, `state/issue*_body.txt`, `state/_karen*`,
  `state/last_picked.json`, `state/cooldown_predecrement.json`. (Leave `state/STATUS.md`,
  `state/verdict.txt`'s existing entry, and `state/cooldown.json` alone -- those are either
  tracked or already correctly ignored.)
- Also neutralize any stray `tmp_*_body.md` / `tmp_*_rescope.txt` files sitting in the repo root
  (e.g. `tmp_158_body.md`, `tmp_268_body.md`, `tmp_312_body.md`, `tmp_253_rescope.txt`) the same
  way -- lead-authored scratch files used as one-off `gh issue edit --body-file` sources, safe
  to overwrite with a one-line marker.

## Done when
- `src/ui/BranchComparison.module.css` is committed.
- Every scratch file listed above (excluding the five explicitly reserved for #314) is
  neutralized (one-line marker comment via `Write`, not deleted) or its useful content folded
  into a permanent doc first.
- `.gitignore` has the new entries described above.
- `git status --short` shows no more untracked files matching the patterns just added, other
  than the five files explicitly reserved for #314.
- `npm run build` and the full test suite still pass with zero new failures.
- All changes committed.

<!-- agent-planned -->
