Lead update (pass 86): the three harness-reliability bugs documented across passes 82-84 on this
thread (orphaned label relabel, post-karen "verified but not committed" false negative, plus
this issue's original crash-rate finding) are now well enough root-caused — exact file/line
citations in `scripts/dispatcher.sh` for the first two — that they don't need further client
input to act on; they're plain bug fixes, not judgment calls. Queued three sequenced fix issues
against `scripts/dispatcher.sh` rather than waiting further:

- **#280** (`agent-todo`) — add a label-write verification/retry helper (`set_issue_label()`),
  refactor the two highest-impact call sites (worker `agent-doing`→`agent-review` handoff,
  karen `agent-review`→`agent-done`/`agent-todo` handoff) to use it. Fixes the #165/#167
  orphaned-relabel pattern from pass 82.
- **#281** (`agent-backlog`, depends_on #280) — fix `commit_verified_issue()` to check git log
  for an already-landed commit referencing the issue before declaring "not committed", instead of
  only trusting the current pass's `worker_output_<N>.txt` manifest. Fixes the #167 false-negative
  gate pattern from pass 84.
- **#282** (`agent-backlog`, depends_on #280, #281) — add a stale `agent-doing`/`agent-review`
  watchdog that reconciles against git/GitHub ground truth if an issue has had no dispatcher
  activity for 6+ hours, as a backstop against any future instance of this bug shape.

Sequenced (not parallel) since all three touch `scripts/dispatcher.sh` and #281/#282 build on the
helper #280 introduces. This is regular board work now — not blocking on a client answer to this
thread. Leaving this issue open for now since the original crash-rate question (CLI version /
subscription / rate-limit visibility) is still genuinely unanswered, but it's non-blocking per its
own framing and the actionable parts of it have a path forward regardless.
