## Goal
Build the client-side-only BYOK integration: API key entry, self-set daily spend limit
(rolling 24h window, hard-blocked at limit), and a provider adapter that sends requests
directly from the browser to the LLM provider — never storing the key server-side.

## Context
- **Provider scope is a lead-set default (2026-08-25, pass 25), not a direct client answer.**
  #250 (the original scoping question) has been open with zero direct client response across
  many verification passes; the lead posted a concrete proposed default on #250 and this issue
  proceeds against it rather than continue idling the rest of Phase A. If the client corrects
  this later via a comment on #250, treat that as authoritative and adjust.
- **Confirmed scope to build against:**
  1. **API shape:** generic OpenAI-compatible chat-completions HTTP endpoint (base URL + API
     key + model name) — do not build against a vendor-specific SDK.
  2. **Provider picker (v1):** "OpenAI", "Anthropic", "Custom endpoint".
  3. **Testing:** mocked HTTP responses only, no live provider calls in automated tests.
- Full requirements: `/Users/frason/.claude/plans/swift-hopping-codd.md` → "LLM Cost Model" and
  "LLM Call Failure Handling".
- This issue is the key/limit/adapter plumbing only — wiring it into the actual Tier 2/3
  crisis-response flow is a separate follow-up issue (#253).

## Status: 5 attempts in, converged to 7 failing unit tests — everything else PASSES
Karen's last verdict (2026-08-25 22:22) confirmed ALL of the following now PASS and should
**not be touched or re-derived**: jest-dom installed, `global`→`globalThis` fix, vitest
`environmentMatchGlobs` correctly maps both `*.test.ts` and `*.test.tsx` under `src/tests/**`
to jsdom (confirmed genuinely active — real localStorage bugs now surface instead of a Node
no-op), `LLMSettingsPanel` wired into `App.tsx`/`SettingsPanel`, no key leakage to any
backend/Supabase call, `npm run build` clean (0 TS errors). **Do not rework any of that.**

The ONLY remaining work is fixing 7 failing tests (of 108) across 2 files, all with a known
cause per karen's diagnosis:

1. **`src/tests/spendTracker.test.ts` — 4 failures:**
   - `getBudgetSummary`'s `percentUsed` is not capped — add `Math.min(100, ...)` in
     `src/services/spendTracker.ts`.
   - Rolling-24h window boundary/cleanup logic in `recordSpend`/`getTotalSpendInWindow`
     disagrees with test expectations at exact-24h-boundary edge cases.
   - **One test in the file is self-contradictory**: the "caps percent used at 100%" test
     asserts `percentUsed <= 100` AND `> 100` in the same assertion — fix the test itself, not
     just the implementation.
   - The "includes spends at exact 24h boundary" test and the "cleans old entries" /
     "transitions across window boundary" tests currently assume opposite boundary semantics
     (inclusive vs exclusive at exactly 24h). Pick ONE consistent semantic (recommend:
     inclusive — a spend exactly 24h old still counts against the window) and make both the
     implementation and all boundary tests agree with it.

2. **`src/tests/LLMSettingsPanel.test.tsx` — 3 failures:**
   - Ambiguous `/openai/i` text match — the component renders "OpenAI" in 3+ places; scope the
     test query (e.g. `getByRole` with a specific role/label, or `getAllByText` + index) rather
     than a bare regex text match.
   - Masked API key display — test expects a `•••••key`-style masked pattern in rendered
     output after a key is saved; confirm `LLMSettingsPanel.tsx` actually renders a masked
     version of the stored key (not the raw key, not nothing).
   - Missing "must be a positive number" validation message on zero/negative daily-limit save —
     either add this validation + message to the component, or fix the test's selector if the
     message already renders under different text/markup.

3. **Re-run and confirm clean before claiming done:**
   `npx vitest run src/tests/llmProviderAdapter.test.ts src/tests/llmProviderConfig.test.ts src/tests/spendTracker.test.ts src/tests/LLMSettingsPanel.test.tsx`
   must show 0 failures (currently 7 failed / 108 total — the other 2 files already pass in
   full, don't touch them).

## Output — REQUIRED, has been skipped on all 5 attempts so far
Every previous attempt on this issue completed without writing `state/worker_output.txt` (the
dispatcher logged "Worker completed issue #251 but did not write its output file" all 5
times). Before finishing, actually write a concise summary (≤40 lines) to
`state/worker_output.txt` — this is a Done-when criterion, not optional busywork.

## Done when
- The 7 named test failures above are fixed (implementation and/or test corrections as
  specified) with no regressions to the other 101 currently-passing tests.
- `npx vitest run` on the 4 listed test files shows 0 failures.
- `npm run build` still passes clean (0 TS errors) — do not break the already-passing build.
- `state/worker_output.txt` is actually written with a real summary of what changed.

<!-- agent-planned -->
