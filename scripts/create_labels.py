#!/usr/bin/env python3
"""Create GitHub workflow labels for the agent team."""
import subprocess
import json

REPO = "frason/origins"
LABELS = [
    {"name": "agent-todo",    "color": "0075ca", "description": "Ready for a worker to pick up"},
    {"name": "agent-backlog", "color": "e4e669", "description": "Waiting on dependencies"},
    {"name": "agent-doing",   "color": "d93f0b", "description": "Worker currently in progress"},
    {"name": "agent-review",  "color": "0e8a16", "description": "Awaiting karen verification"},
    {"name": "agent-done",    "color": "6f42c1", "description": "Karen verified complete"},
]

for label in LABELS:
    result = subprocess.run(
        ["gh", "api", f"repos/{REPO}/labels", "-X", "POST",
         "-f", f"name={label['name']}",
         "-f", f"color={label['color']}",
         "-f", f"description={label['description']}"],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        print(f"✓ Created label: {label['name']}")
    else:
        err = result.stderr.strip()
        if "already_exists" in result.stdout or "already exists" in err.lower():
            print(f"~ Already exists: {label['name']}")
        else:
            print(f"✗ Failed {label['name']}: {err}")
