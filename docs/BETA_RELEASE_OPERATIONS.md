# Private beta release operations

This is the release-owner checklist for issue #152. It complements the deployment,
data-foundation, and diagnostic-export documents that land with #154, #151, and
#153. Do not mark the beta ready merely because this file is complete: every unchecked
live-system item needs dated evidence.

## Selected beta access and feedback route

Origins must not put a shared password in browser code or a `VITE_` variable.

| Chosen access model | What it protects | Release condition |
| --- | --- | --- |
| **Selected: Vercel Hobby authentication** | Preview deployment URL; testers sign in with approved Vercel accounts | Use the protected preview URL as the beta URL. Do not describe the production domain as private. |
| Not selected: paid deployment protection | Preview and production URLs, with the provider-managed method configured in Vercel | Required only if the beta moves to a password-protected production URL. |

Before inviting anyone, record the selected model, the beta URL, the release owner,
and the backup release owner below. A production URL on Vercel Hobby cannot satisfy a
password-protected release requirement by itself.

**Replay decision:** the end-of-run replay menu offers only retained deterministic
checkpoints. It must not offer arbitrary typed ticks, because replaying an unavailable
tick would require a hidden reconstruction cost and would make the UI promise a restore
point that does not exist.

**Feedback decision:** the private, non-production feedback route is the protected
preview's Supabase `beta_feedback` submission path, optionally linked to the tester's
diagnostic bundle. The beta owner reviews submissions from the Supabase project dashboard.
Never route diagnostic bundles through a public GitHub issue.

## Tester-facing privacy and support copy

Use this copy in the invitation and before a tester exports a diagnostic bundle:

> Origins saves the current world in this browser so it can resume after a refresh.
> Clearing browser site data, using private browsing, or changing devices can remove
> that local save. Export a world file before clearing browser data or when you want
> a manual backup. A diagnostic export contains simulation data such as the world
> seed, tick, settings, events, and recent world state; it may include any custom
> species names you entered. Do not put private information in names, and send a
> diagnostic bundle only through the designated beta support route.

When the anonymous Supabase backup work is deployed, add one sentence naming the
storage duration and confirming that the browser's anonymous identity owns only its
own backups. Do not promise cloud backup before that path is live and tested.

## Release checklist

### Before invitation

- [ ] Selected an access model above and tested it in a signed-out browser.
- [ ] Recorded the beta URL, deployment URL, commit, release date, and owners.
- [ ] Confirmed no password, service-role key, database password, or other secret is
      present in client assets, repository history, or `VITE_` variables.
- [ ] Recorded the deployed database migration version and verified that RLS prevents
      one anonymous browser from reading another browser's rows.
- [ ] Named a private feedback route and tested it with a diagnostic bundle. The
      route must not require publishing the bundle in a public issue.
- [ ] Passed production build, deterministic suite, and the mobile smoke test.

### Tester smoke test

- [ ] Open the protected beta URL on desktop and at 390px-wide mobile viewport.
- [ ] Start a world, play, pause, refresh, and confirm the same world resumes.
- [ ] Export a world, import it in a clean browser profile, and confirm the tick and
      world identity match.
- [ ] Export a diagnostic bundle and submit it through the selected private route.
- [ ] If cloud backup is enabled, verify anonymous backup/restore and confirm a
      second browser identity cannot read the first browser's data.

### Failure drills

- [ ] Corrupt-save drill: put an invalid local save in storage, reload, confirm a
      clear recovery notice appears, then use **Import world** to recover from an
      exported backup.
- [ ] Supabase-outage drill: disconnect or revoke the public test configuration;
      confirm local play and export still work, with a clear non-blocking backup or
      feedback failure message.
- [ ] Vercel rollback drill: restore the previous known-good deployment, retest the
      protected beta URL and health endpoint, and record the restored commit.
- [ ] Database drill: use an additive forward migration to repair a test schema
      mistake. Do not rollback a shared beta database destructively.

## Evidence ledger

| Item | Value | Owner | Verified at |
| --- | --- | --- | --- |
| Access model |  |  |  |
| Beta URL |  |  |  |
| Production/deployment URL |  |  |  |
| Release commit |  |  |  |
| Database migration version |  |  |  |
| Diagnostic bundle version |  |  |  |
| Release owner |  |  |  |
| Backup owner |  |  |  |
| Private feedback route |  |  |  |
| Rollback deployment and commit |  |  |  |

## Release-owner responsibilities

The release owner approves invitations, rotates or revokes access, keeps the evidence
ledger current, and pauses invitations during an incident. The backup owner can carry
out the documented Vercel rollback and preserve diagnostic evidence. Neither role
should request a tester's Vercel, Supabase, or browser credentials.

If a report includes a diagnostic bundle, save the original file, note the deployment
commit and browser/device context, reproduce from the exported state where possible,
and then redact or delete the bundle according to the agreed beta retention period.
