#!/usr/bin/env python3
"""Reimplementation (in Python, for verification only) of the exact selection
algorithm found in scripts/dispatcher.sh's WORK selector after the uncommitted
#284 diff, to independently confirm round-robin fairness behavior."""

ready = [100, 150, 200, 250]
cooldown = {}  # issue -> remaining passes
last_picked = None
selections = []

for tick in range(1, 31):
    crashes = {100} if tick <= 7 else {100, 250}

    pre_existing = set(cooldown.keys())
    # decrement pre-existing entries
    updated = {}
    for k, v in cooldown.items():
        if k in pre_existing:
            nv = v - 1
        else:
            nv = v
        if nv > 0:
            updated[k] = nv
    cooldown_before_crash_check = dict(cooldown)  # pre-decrement, for escalation base

    # round robin starting after last_picked
    start_idx = 0
    if last_picked in ready:
        start_idx = (ready.index(last_picked) + 1) % len(ready)

    selected = None
    for offset in range(len(ready)):
        idx = (start_idx + offset) % len(ready)
        num = ready[idx]
        if updated.get(num, 0) == 0:
            selected = num
            break
    if selected is None:
        selected = min(updated, key=lambda k: updated[k])

    if selected in crashes:
        prev = cooldown_before_crash_check.get(selected, 0)
        nextv = min(prev + 1, 5)
        updated[selected] = nextv

    cooldown = updated
    last_picked = selected
    selections.append(selected)

print("Selections:", selections)
for issue in ready:
    print(f"#{issue}: picked {selections.count(issue)} times")
