# Project Origins private-beta handoff

This is the short operating guide for the August 6 private beta. Treat
`BETA_RELEASE_OPERATIONS.md` as the detailed evidence checklist and
`BETA_DEPLOYMENT_RUNBOOK.md` as the deployment/incident procedure.

## What testers can do

- Run a deterministic Living World, pause it, and resume after refresh from the
  browser-local save.
- Export and import a complete world file.
- Restore from retained deterministic checkpoints at the end of a session.
- Export a reproducible diagnostic bundle and submit feedback with an optional
  diagnostic attachment.
- Explicitly create or restore the single cloud backup owned by this browser.

## Before sending the beta URL

1. Publish the reviewed beta branch and merge only after GitHub Actions passes.
2. Apply `supabase/migrations/202608010001_beta_data_foundation.sql`.
3. Enable Supabase Anonymous Sign-Ins, then set only these Vercel public values:
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Enable Vercel Authentication for the selected preview deployment and invite
   the approved testers. On Hobby, use this protected preview—not the public
   production domain—as the beta URL.
5. Complete the two-browser RLS, mobile, refresh, backup, feedback, outage, and
   replacement-preview recovery checks in `BETA_RELEASE_OPERATIONS.md`.

## Known beta limits

- Browser-local saves and anonymous cloud records are not recoverable after
  site data is cleared or the tester changes browser/device. Export a world
  file for a portable backup.
- Cloud backup is manual and stores one `current` slot; it never uploads every
  simulation tick.
- Diagnostic attachments are intentionally submitted only through the private
  feedback route, not public GitHub issues.
- Replay offers retained checkpoints only, rather than arbitrary tick numbers.
- Three.js rendering, game modes, accounts, and Living Planet systems are
  post-beta work.

## Support workflow

Ask a tester for the protected-preview URL, device/browser, current tick, and
a private feedback submission with a diagnostic bundle when appropriate. Keep
the original bundle only for reproduction, then redact/delete it according to
the beta retention decision. If the deployment fails, create a protected
preview from the last known-good commit and use that replacement URL; do not
destructively roll back shared Supabase data.
