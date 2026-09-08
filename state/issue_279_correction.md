Correction to the pass-86 comment just above: a parallel issue-creation error produced a
duplicate watchdog issue instead of the intended "verified but not committed" fix issue.
Corrected numbering (closed the duplicate, created the missing issue, fixed the dependency
chain):

- **#280** (`agent-todo`) — label-write verification/retry helper. Unchanged.
- **#283** (`agent-backlog`, depends_on #280) — this is now the `commit_verified_issue()` git-log
  fix (previously mislabeled #281 in error).
- **#282** (`agent-backlog`, depends_on #280, #283) — stale-issue watchdog. `depends_on` line
  corrected to point at #283, not the closed duplicate.
- **#281** — closed as a duplicate, not planned.

No change to the underlying plan or scope, just the issue numbers.
