import subprocess, re, sys

REPO = "frason/origins"
ISSUES = [116, 119, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170,
          171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 200, 223]

NEW_DEP_LINE = "depends_on: #247"

NOTE = """
---
**Re-gated (pass #58):** paused behind Phase A per SPEC.md's "Legacy roadmap note." Confirmed this pass that dispatcher worker-selection is oldest-issue-number-first (scripts/dispatcher.sh), which was letting this lower-numbered legacy issue win worker+karen cycles ahead of the higher-numbered Phase A issues (#248/#249/#252) every pass since Phase A opened (pass #55) -- concretely confirmed by a fresh karen FAILED verdict on #116 this pass while #248/#249/#252 still show zero worker attempts. Re-gating behind #247 (Phase A epic), same treatment as the 6 epics re-gated pass #56, so Phase A actually gets worked next. Re-evaluate once #247 closes.

""" + NEW_DEP_LINE + "\n"

DEP_LINE_RE = re.compile(r'^depends_on:.*$', re.IGNORECASE | re.MULTILINE)

for n in ISSUES:
    r = subprocess.run(
        ["gh", "issue", "view", str(n), "--repo", REPO, "--json", "body", "--jq", ".body"],
        capture_output=True, text=True
    )
    if r.returncode != 0:
        print(f"SKIP {n}: fetch failed: {r.stderr.strip()}")
        continue
    body = r.stdout

    # Remove any existing depends_on: lines (stale, e.g. pointing at already-closed #233)
    body = DEP_LINE_RE.sub("", body)
    # Collapse resulting multiple blank lines
    body = re.sub(r'\n{3,}', "\n\n", body)

    # Remove any accidental stray "TESTNOTE" leftover from manual testing
    body = body.replace("\n\nTESTNOTE\n", "\n")

    if "Re-gated (pass #58)" in body:
        print(f"SKIP {n}: already re-gated")
        continue

    new_body = body.rstrip() + "\n" + NOTE

    r2 = subprocess.run(
        ["gh", "issue", "edit", str(n), "--repo", REPO, "--body", new_body,
         "--remove-label", "agent-todo", "--add-label", "agent-backlog"],
        capture_output=True, text=True
    )
    if r2.returncode == 0:
        print(f"regated #{n}")
    else:
        print(f"FAILED #{n}: {r2.stderr.strip()}")
