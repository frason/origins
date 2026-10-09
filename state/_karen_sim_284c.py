cooldown = {}
ready = [100, 150, 200, 250]
selections = []

for tick in range(1, 31):
    crashes = {100} if tick <= 7 else {100, 250}
    pre_existing = set(cooldown.keys())
    updated = dict(cooldown)
    for k in pre_existing:
        updated[k] = updated[k] - 1
    selected = None
    for issue in ready:
        if issue not in cooldown:  # has() check on PRE-decrement map
            selected = issue
            break
    if selected is None:
        selected = ready[0]
    crashed = selected in crashes
    if crashed:
        cur = updated.get(selected, 0)  # test script reads from already-decremented updated_cooldown
        nxt = min(cur + 1, 5)
        updated[selected] = nxt
    selections.append(selected)
    cooldown = updated
    print(f"tick{tick:2d}: selected={selected} crashed={crashed} cooldown={cooldown}")

from collections import Counter
print(Counter(selections))
