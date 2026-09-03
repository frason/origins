#!/usr/bin/env python3
"""Strip stale 'Paused pending pivot' / 'Re-gated (pass #58) depends_on: #247'
footer from a legacy issue body now that #247 (Phase A epic) is closed, and
replace it with a short unblocked note. Usage: fix_stale_gate.py <issue_number>
"""
import subprocess
import sys

REPO = "frason/origins"
MARKER = "\n\n---\n**Paused pending pivot decision"

UNBLOCKED_NOTE = (
    "\n\n---\n**Unblocked (pass 49):** Phase A epic #247 closed; legacy backlog "
    "resumed per SPEC.md's \"Legacy roadmap note\" and client disposition #234. "
    "No remaining dependency — proceed with implementation.\n\n<!-- agent-planned -->\n"
)


def main():
    num = sys.argv[1]
    body = subprocess.run(
        ["gh", "issue", "view", num, "--repo", REPO, "--json", "body", "--jq", ".body"],
        capture_output=True, text=True, check=True,
    ).stdout
    if MARKER not in body:
        print(f"#{num}: marker not found, skipping (already clean or different shape)")
        return
    core = body.split(MARKER, 1)[0].rstrip()
    new_body = core + UNBLOCKED_NOTE
    subprocess.run(
        ["gh", "issue", "edit", num, "--repo", REPO, "--body", new_body],
        check=True,
    )
    print(f"#{num}: stale gate stripped, body updated")


if __name__ == "__main__":
    main()
