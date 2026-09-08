depends_on: #280

## Goal
Stop scripts/dispatcher.sh from reporting "Verified but not committed" on an issue that karen
just PASSED, when the work was actually already committed and pushed in an earlier pass (just
not by the current run).

## Context
Confirmed real incident (documented on issue #279, planning-pass 84): karen posted a clean
PASSED verdict for #167 citing commit 090d442, but the post-karen gate in scripts/dispatcher.sh
(the block starting `if [ "$first_word" = "PASSED" ]; then if ! commit_verified_issue ...` around
line 646, calling commit_verified_issue() defined around line 92) still reported "Verified but
not committed" both immediately before and after that PASS. Root cause: commit_verified_issue()
only looks at state/worker_output_<N>.txt's "Changed files:" manifest for the current pass
(line ~94: manifest is read via a grep on that file); when a cycle has no new worker-output file
because the work already landed in a prior pass, there's nothing to match, and every fallback
path in that function also requires currently-staged/uncommitted changes (a
`git diff --cached --quiet || return 1` guard appears in both the primary and fallback branches)
-- so it can never succeed for already-landed work. The client independently re-verified and
closed #167 manually rather than let it cycle again.

## Done when
- Before (or as part of) commit_verified_issue()'s existing manifest/staged-changes checks, add
  a check for whether a qualifying commit for this issue already exists and is pushed -- e.g.
  search git log for a commit message referencing this issue number as closed (match whatever
  convention commit_verified_issue() itself already uses when it writes commits, around line 122:
  `git commit -m "chore(issue): ${title} (closes #${number})"`).
- If a matching commit is found and already pushed to origin/<base_branch> (or the current branch
  is already in sync with origin), treat this as success -- return 0 immediately -- instead of
  requiring a fresh manifest or staged diff.
- The existing "genuinely nothing committed" failure path is unchanged: if no matching commit
  exists anywhere in history and there's no staged/manifest diff either, still return 1 and let
  the "Verified but not committed" comment fire as today.
- bash -n scripts/dispatcher.sh passes.

## Output
Write a concise summary (<=40 lines) to state/worker_output.txt, including the exact Changed
files manifest line.

<!-- agent-planned -->
