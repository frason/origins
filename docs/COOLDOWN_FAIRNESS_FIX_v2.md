# [DEPRECATED] Use DISPATCHER_WORK_SELECTOR_FAIRNESS.md instead

This file describes an intermediate iteration of the cooldown mechanism (pre-decrement state handling) but does NOT document the round-robin selection strategy that prevents starvation.

The actual fix for issue #284 combines:
1. **Round-robin selection** via `last_picked.json` (prevents low-numbered issues from monopolizing)
2. **Escalating cooldown** via `cooldown.json` (escalates failures: 1→2→3→5 passes)
3. **Pre-decrement state tracking** via `cooldown_predecrement.json` (enables proper escalation)

See `docs/DISPATCHER_WORK_SELECTOR_FAIRNESS.md` for the complete, accurate description.
