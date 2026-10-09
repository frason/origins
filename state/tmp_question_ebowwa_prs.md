## What I need to know
Found this pass while auditing open PRs: a real external GitHub contributor, **@ebowwa** (not a bot, own GH login), opened **7 PRs** on 2026-09-21 (8 days ago as of this pass), all still open, all reported `MERGEABLE`, zero review activity since:

- **#301** "evidence-threshold adaptation labels" — claims closes #276 (currently `agent-review`, mid-cycle with the automated worker/karen loop working the *same* issue independently)
- **#300** "wire the 2D map fallback toggle" — claims closes #274 (already **closed** by the lead manually, pass ~104, via a different fix landed directly on `main`)
- **#299** "direct-mode snapshots report real isRunning/isPaused" — claims closes #287 (currently `agent-todo`, unresolved, still queued for a worker)
- **#298** "wire trait-frequency tracking into the tick loop" — claims closes #278 (currently `agent-todo`, has cycled multiple genuine karen FAILs this week)
- **#297** "verify GitHub label edits via re-read + retry" — claims closes #280 (already **closed**, resolved directly on `main`)
- **#296** "document canonical creature ordering / re-pin #285 baselines" — targets #285 (currently `agent-todo`, unresolved)
- **#295** "remove dangling disaster-feature imports" — targets #293 (currently `agent-todo`, unresolved)

## Why it matters
The automated dispatcher pipeline (running under this same GitHub identity) has been independently working several of these exact same issues via its own worker/karen loop and direct-to-`main` commits, with no awareness these PRs exist — real dollars have likely already been spent re-solving #280 and #274 from scratch after @ebowwa's PRs for them had been sitting ready and mergeable the whole time. For the still-open targets (#285, #287, #293, #278, #276), merging the relevant PR now (if it's still good) could resolve them immediately for free instead of costing more automated worker/karen cycles this week.

I have no authority to merge to `main` or to close someone else's PR unilaterally, so this needs your call either way:
1. Are these @ebowwa PRs something you (or someone on your side) already know about / requested, and do you want me to route future automated work around them (e.g., pause dispatcher attempts on an issue once I see a mergeable PR already targets it)?
2. Should I flag the still-relevant ones (#295/#296/#298/#299/#301) to you for review/merge, and close the now-redundant ones (#297/#300) as superseded once you confirm?

## What I'll do once answered
Not blocking other work — the rest of the board keeps cycling normally in the meantime. Once you tell me how to treat this contributor's PRs, I'll either queue a "check for an existing mergeable PR before dispatching a worker" convention in future issue bodies, or close out the superseded PRs with a comment pointing at wherever the equivalent fix actually landed, per your direction.

<!-- agent-planned -->
