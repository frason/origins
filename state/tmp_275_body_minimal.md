## Goal
Fix the single remaining build-breaking TypeScript error on `HEAD` so `npx tsc --noEmit -p .`
passes with zero errors, then close this issue.

## Context
This issue previously covered a larger file-reconciliation audit. **That audit work is already
100% done and committed** (confirmed by karen across multiple passes — do not redo any file
cleanup, do not touch `.gitignore`, do not look for other "orphaned files"). Exactly one gap
remains, and it is small:

```
src/simulation/engine.ts(1141,36): error TS2345: Argument of type '"dehydration"' is not
assignable to parameter of type 'DeathCause'.
```

`src/simulation/events.ts` (around line 5) defines:
```ts
export type DeathCause =
  | 'predation'
  | 'starvation'
  | 'age'
  | 'monoculture-pressure'
  | 'overcrowding'
  | 'environmental-stress'
  | 'dispersal-exhaustion'
  | 'unknown';
```
It is missing `'dehydration'`, which `src/simulation/engine.ts` line 1141 already tries to use.

## Do exactly this — nothing else
1. Open `src/simulation/events.ts`. Add `| 'dehydration'` as a new member of the `DeathCause`
   union type (anywhere in the list, e.g. right after `'dispersal-exhaustion'`).
2. Run `npx tsc --noEmit -p .` — confirm it now prints zero errors.
3. Run `npx vitest run` (full suite) — confirm no *new* failures were introduced by this
   one-line type change (pre-existing unrelated failures in other files are not your concern —
   do not attempt to fix any test file, only verify nothing new broke).
4. `git add src/simulation/events.ts` and commit with a message like
   `fix(types): add 'dehydration' to DeathCause union (closes #275)`.

Do NOT edit any other file. Do NOT search for or touch untracked/orphaned files — that work is
finished. This is a 1-line type-union fix plus verification, nothing more.

## Done when
- `npx tsc --noEmit -p .` returns zero errors.
- The one-line fix above is committed.

<!-- agent-planned -->
