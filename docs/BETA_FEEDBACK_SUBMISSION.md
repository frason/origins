# Beta feedback submission

Issue #153 (advanced by #202's data foundation and #203's local diagnostic
export) adds the browser-side path for a tester to submit private feedback
using the `beta_feedback` table from
`supabase/migrations/202608010001_beta_data_foundation.sql`.

## What this adds

- `src/services/betaFeedbackClient.ts`: payload validation, diagnostic-bundle
  parsing, submission orchestration, and the Supabase-backed implementation.
- `src/ui/BetaFeedbackPanel.tsx`: a small modal form (category, summary,
  optional detail, optional diagnostic-file attachment) mounted from
  `src/App.tsx` behind a new "Feedback" header button.

## How a tester submits feedback

1. Click **Feedback** in the header. A modal opens with a category select
   (Bug / Confusing / Balance / Accessibility / Other), a required one-line
   summary (1-160 chars), and an optional detail field (up to 4000 chars).
2. Optionally attach a previously exported diagnostic file (see
   `docs/BETA_DIAGNOSTIC_EXPORT.md`) with the file input. Nothing is uploaded
   until Submit is pressed.
3. On submit, the browser:
   - establishes (or reuses) an anonymous Supabase Auth session,
   - if a diagnostic file was attached, uploads it to `beta_diagnostic_bundles`
     to get an owner-scoped id,
   - inserts the feedback row into `beta_feedback`, linking `diagnostic_id`
     when the upload succeeded.
4. The modal reports one of: success (noting whether the diagnostic attached),
   a retryable error, or an "unavailable" notice if Supabase isn't configured
   for this build.

## How the diagnostic link works

`beta_feedback.diagnostic_id` is a nullable foreign key to
`beta_diagnostic_bundles(id)`, and RLS on `beta_feedback` insert additionally
requires that the referenced diagnostic bundle is owned by the same
`auth.uid()`. To satisfy that without a hidden race, this feature uploads the
attached diagnostic file itself (creating a fresh, owner-scoped
`beta_diagnostic_bundles` row) in the same submission, then references the id
Postgres assigns. The client never sends its own id or `owner_id` for either
row — both default to `auth.uid()` server-side, exactly as the migration
requires.

`parseDiagnosticBundleForUpload` duck-types the uploaded file (`kind ===
'origins-diagnostic'`, a numeric `version`, and `application.version`) rather
than importing `src/simulation/diagnosticBundle.ts`, so this feature has no
build dependency on the (separately shipped) diagnostic-export feature. A
tester can attach any file matching that shape.

If the attached file is invalid, too large (over the migration's 8 MiB cap),
or the upload itself fails, the diagnostic is dropped and feedback is still
submitted — with a warning shown in the result, not a blocked submission.

## What happens during a Supabase outage or missing configuration

- If `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` are absent,
  `loadBetaFeedbackBackend()` returns `null` and the panel shows a static
  notice ("Beta cloud feedback is not configured for this build. Local play
  and diagnostic export still work normally.") instead of hiding the form.
- If the configuration is present but malformed, `loadBetaFeedbackBackend()`
  catches the error and also returns `null` — the app never crashes on a bad
  `.env`.
- If Supabase is configured but unreachable (or anonymous sign-in fails, or
  either insert fails) at submit time, `submitBetaFeedback` never throws: it
  resolves to a typed `{ status: 'error', message, retryable: true }` result,
  the entered form values are preserved, and the tester can retry. Nothing
  about local play, world save/load, or diagnostic export depends on this
  path succeeding.

## Anonymous identity

Uses the same anonymous-auth model documented in
`docs/BETA_DATA_FOUNDATION.md`: identity lives in the browser session: a
session is created lazily on first submission and reused after that. Signing
out or clearing site data creates a new identity with no access to
previously submitted feedback, matching the documented recovery limitation.

## Related cloud world backup

World controls expose explicit **Cloud backup** and **Restore cloud** actions
against the same owner-scoped anonymous session. They never upload every tick;
the browser save remains the default. A saved cloud world is limited to 8 MiB,
and the UI reminds a tester that clearing browser site data loses access to its
anonymous cloud records. Uploading standalone diagnostics remains intentionally
out of scope; diagnostics are attached only when a tester submits feedback.
