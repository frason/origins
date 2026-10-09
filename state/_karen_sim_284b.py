cooldown = {}
candidates = [100, 150, 200, 250]  # 100 = crash-looping (always fails), others succeed once then close

for i in range(1, 11):
    if not candidates:
        print(f"pass{i}: no candidates left, done")
        break
    pre_existing = set(cooldown.keys())
    updated = dict(cooldown)
    for k in pre_existing:
        updated[k] = updated[k] - 1
    picked = None
    for c in candidates:
        if c not in cooldown:
            picked = c
            break
    before = dict(cooldown)
    cooldown = updated
    if picked is None:
        print(f"pass{i}: ALL candidates in cooldown, nothing picked (or fallback to first) candidates={candidates}")
        continue
    outcome = "crash" if picked == 100 else "success+closed"
    print(f"pass{i}: cooldown_before={before} picked={picked} ({outcome}) cooldown_after={cooldown} remaining_candidates(before removal)={candidates}")
    if picked == 100:
        prev = before.get(100, 0)
        nxt = prev + 1
        cooldown[100] = nxt
        print(f"   #100 crashed -> cooldown now {cooldown}")
    else:
        candidates.remove(picked)
