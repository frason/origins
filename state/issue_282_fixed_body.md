depends_on: #280, #283

## Goal
Give scripts/dispatcher.sh a lightweight self-healing watchdog so an issue can never again get
silently stuck in agent-doing or agent-review for days with no automatic recovery, even if a
future label-write bug slips past the read-back/retry fix in #280.

## Context
Two confirmed real incidents (issue #279, planning-passes 82 and 84): #165 and #167 both sat in
agent-doing for 4-5 days because a label change the dispatcher's internal log believed had
happened never actually applied on GitHub, and there was no mechanism to notice or correct this
automatically -- a human had to manually diff dispatcher.log against GitHub's actual label state
and fix it by hand. #280 and #283 fix the two specific root causes found so far (label-write
verification, and the post-karen commit-check false negative); this issue adds a backstop that
catches any future instance of the same "internal state disagrees with GitHub ground truth"
shape, not just these two specific bugs.

## Done when
- scripts/dispatcher.sh gains a watchdog step that runs once per dispatcher invocation, early
  in the script (before the existing "RULE 1 -- karen verification" section, so it can free up
  stuck issues before the normal pass runs).
- The watchdog lists all open issues currently labeled agent-doing or agent-review (via
  gh issue list --label agent-doing,agent-review --state open --json number,updatedAt,labels)
  and, for any whose updatedAt is older than a configurable threshold (default 6 hours -- add a
  STALE_HOURS constant near the top of the script, or read from schedule.json if that fits the
  existing config pattern better), reconciles it against ground truth:
  - If git log shows a commit already referencing that issue number as closed/landed (same
    check style as #283), relabel to agent-done and close the issue (reusing the same commit/
    close logic already used elsewhere in the script where possible).
  - Otherwise, relabel back to agent-todo and post a comment explaining the reset (e.g. a
    warning that no dispatcher activity was seen on this issue in over STALE_HOURS hours while
    labeled the stale label, so it is being reset to agent-todo for a fresh attempt).
- Every watchdog action is logged with a clearly-greppable prefix, e.g. a WATCHDOG: line noting
  the issue number, old label, new label, and hours since last activity.
- Use the label-write helper from #280 (set_issue_label or equivalent) for the actual relabel
  calls so the watchdog itself can't produce a new orphaned-label instance.
- bash -n scripts/dispatcher.sh passes.
- Add a short comment block near the watchdog function describing how to manually exercise it for
  testing (e.g., temporarily lowering STALE_HOURS and pointing it at a fixture issue) since full
  end-to-end verification requires live GitHub state that karen can't easily fake.

## Output
Write a concise summary (<=40 lines) to state/worker_output.txt, including the exact Changed
files manifest line.

<!-- agent-planned -->
