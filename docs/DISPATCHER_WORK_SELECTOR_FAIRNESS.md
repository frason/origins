# Dispatcher WORK Selector: Round-Robin + Escalating Cooldown (Issue #284)

## Problem Solved
The original WORK selector always picked the **lowest-numbered** `agent-todo` issue not in cooldown, allowing low-numbered crash-looping issues to monopolize the queue indefinitely. Higher-numbered ready issues (including build-breaking fixes like #269, #272) were starved for days.

## Solution: Round-Robin Selection with Escalating Cooldown

### Design Overview
The dispatcher's WORK selector combines two mechanisms:

1. **Round-Robin Ordering** (`last_picked.json`): Selection advances past the last-picked issue each tick, visiting all ready issues in sequence, independent of issue number. Prevents any single issue from monopolizing the queue.

2. **Escalating Cooldown** (`cooldown.json`): Crash-looping issues receive progressively longer cooldowns (1→2→3→4→5 passes), forcing them to wait while other issues get turns.

### State Files

#### `state/cooldown.json` (object format)
Maps issue numbers to remaining cooldown passes:
```json
{"100": 2, "150": 1, "200": 0}
```
- **Key**: issue number (string)
- **Value**: passes remaining (integer, 1-5; 0 or absent = eligible)
- Format: Object (not array) for efficient lookups

#### `state/last_picked.json`
Contains the issue number selected in the previous tick (or `null` on startup):
```
150
```
The selector starts its round-robin search from the next issue **after** this number.

#### `state/cooldown_predecrement.json` (internal tracking)
Holds the cooldown state **before** this tick's decrement, used by crash-handling to detect if an issue was already cooling:
```json
{"100": 2, "150": 1}
```
This allows proper escalation: if an issue crashes while already in cooldown, its counter increments from the pre-decrement value (not from 0).

### Selection Algorithm (lines 877-990 in dispatcher.sh)

**Each WORK tick:**

1. **Decrement pre-existing cooldowns**
   - Load `cooldown.json` (with defensive array→object conversion for legacy format)
   - Decrement ONLY keys that existed before this tick (via `jq --argjson pre`)
   - Remove entries with value ≤ 0 (expired cooldowns)
   - Save pre-decrement state to `cooldown_predecrement.json`
   - Persist decremented cooldown to `cooldown.json`

2. **Round-robin selection**
   - Load `last_picked` (or start at position 0 if null)
   - Fetch all open `agent-todo` issues (sorted by number)
   - Starting from the next position after `last_picked`, iterate through issues
   - Pick the first issue with cooldown value = 0 (healthy)

3. **Fallback (all in cooldown)**
   - If every ready issue is in cooldown, pick the one with smallest cooldown value
   - This ensures the queue never stalls completely

4. **Persist for next round**
   - Save the picked issue number to `last_picked.json`
   - Re-fetch and extract the full issue details for the worker

### Crash Handling (lines 1099-1121 in dispatcher.sh)

**When a worker crashes:**

1. Read current `cooldown.json` and `cooldown_predecrement.json`
2. Check the pre-decrement state: was this issue already cooling?
   - If yes: `next_value = old_value + 1`
   - If no: `next_value = 1`
3. Cap at 5 (prevent unbounded growth)
4. Update `cooldown.json` with the new value
5. Log: `issue #100 crashed — added to worker-selection cooldown for 3 pass(es)`

**Example: Issue #100 crash-looping**
```
Pass 1: #100 selected → crashes → cooldown set to 1, last_picked = #100
Pass 2: cooldown decremented (1→0, removed), #100 now eligible
        Round-robin starts from #100+1 → selects #150 (healthy)
        #150 succeeds, last_picked = #150
Pass 3: #100 eligible, but round-robin starts from #150+1 → selects #200
Pass 4: Eventually loops back to #100, picks it again if no other issues ready
        #100 crashes again → cooldown set to 2 (escalation), last_picked = #100
Pass 5: #100 in cooldown (2 passes), round-robin selects others
Pass 6: cooldown (1 pass), #100 still cooling
Pass 7: cooldown (0), #100 eligible again
```

The escalating cooldown ensures repeated failures trigger longer backoffs, while round-robin ensures every issue gets visited fairly over time.

### Fairness Properties

✓ **No starvation**: Higher-numbered issues get selected regardless of lower-numbered crashes
✓ **Escalating penalty**: Crash-looping issues face progressively longer cooldowns
✓ **Fair rotation**: All ready issues visited in round-robin order, not issue-number order
✓ **Queue doesn't stall**: Fallback to minimum-cooldown ensures at least one issue is always eligible

### Testing

Run `scripts/test_cooldown_fairness.sh` to verify fairness over 30 simulated ticks:
- Simulates 4 ready issues (2 crash-looping, 2 healthy)
- Asserts all 4 are picked (fairness: min_count > 0 and variance ≤ 3 picks)
- Demonstrates escalating cooldown and round-robin selection

### Backward Compatibility

- Old `cooldown.json` array format (`[100, 200]`) is automatically converted to object format on first read
- Existing cooldown/crash logic is preserved; only the **selection strategy** changed (ascending order → round-robin)
- No changes to issue workflow or labels

---

**Verification**: Since issue #280, #282, #283 touch the same dispatcher.sh file (label verification, commit checks, stale-issue watchdog), this fix is sequenced to apply cleanly without conflicts.
