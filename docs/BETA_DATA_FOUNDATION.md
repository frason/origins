# Beta data foundation

Issue #151 establishes the secure database boundary for private beta. The game
continues to use its existing browser save by default; cloud backup wiring is a
separate integration step so a missing cloud service cannot prevent play.

## What this migration creates

The migration at
`supabase/migrations/202608010001_beta_data_foundation.sql` creates:

- `beta_world_backups`: one or more named save slots per anonymous browser owner.
- `beta_diagnostic_bundles`: immutable diagnostic payloads tied to their owner.
- `beta_feedback`: short beta reports that can reference an owned diagnostic.

World and diagnostic JSON payloads are capped at 8 MiB. A measured tick-12
diagnostic for the existing 100 by 100 world is 2,598,324 bytes, so the original
2 MiB assumption could not hold a baseline replay bundle. Text fields are bounded,
all exposed tables have row-level security enabled and forced, and the `anon`
database role receives no table access. Anonymous Auth sessions use the
`authenticated` role and can only select, create, change, or delete rows whose
`owner_id` equals `auth.uid()`.

## Supabase project setup

1. Create a Supabase project for the beta environment.
2. In Authentication settings, enable anonymous sign-ins.
3. Before inviting more than a tiny trusted group, enable Cloudflare Turnstile
   or hCaptcha for anonymous sign-in abuse protection.
4. Apply the versioned migration with the Supabase CLI or SQL editor.
5. Set these values in local development and Vercel:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`)
6. Never place an `sb_secret_...` key, service-role key, database password, or
   any other privileged credential in a `VITE_` variable. Those values are
   bundled into browser code.

The application rejects incomplete configuration, non-publishable keys, and
non-HTTPS project URLs outside local development. When both variables are
absent, it remains in local-only mode.

## Identity and recovery limitation

Anonymous identity is stored in the browser. Signing out, clearing site data,
or switching browsers/devices creates a different identity and permanently
removes access to that identity's cloud-owned saves. The beta UI must show this
warning before cloud backup is enabled. Recoverable accounts are intentionally
deferred until after private beta.

## Required live verification

Run this matrix against the beta Supabase project before cloud backup ships:

1. Browser A anonymously signs in and receives a stable user ID after refresh.
2. Browser A creates, reads, updates, and deletes its own world backup.
3. Browser A creates and reads its own diagnostic and linked feedback.
4. Browser B anonymously signs in and cannot read, update, delete, or attach
   feedback to Browser A's records, even when given their IDs.
5. A request using the unauthenticated `anon` role cannot access any beta table.
6. World and diagnostic payloads over 8 MiB are rejected.
7. Clearing Browser A's site data demonstrates the documented loss-of-access
   behavior.

This repository currently verifies the migration's structural security contract
and browser configuration boundary. Executing the matrix requires the beta
project and the approved Supabase client integration.

## Private-beta abuse and retention plan

- Keep the Vercel site behind managed password protection.
- Enable CAPTCHA for anonymous account creation and monitor Auth rate limits.
- Keep payload and text limits in the database rather than trusting the client.
- Do not automatically collect diagnostics; upload only after a tester acts.
- Review diagnostic retention after the beta cohort is known. Any cleanup job
  must use a server-only secret and must never run in browser code.
