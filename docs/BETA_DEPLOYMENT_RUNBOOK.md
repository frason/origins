# Private-beta deployment runbook

This runbook is the operational half of issue #154. The selected beta gate is
Vercel Authentication on a protected preview deployment. Origins must never
implement a shared password in browser code.

## One-time project setup

1. In the Vercel Hobby team, import `frason/origins` from GitHub.
2. Set `main` as the production branch. Vercel will create previews for pull
   requests and a production deployment after merges to `main`.
3. Vercel detects the Vite project from `vercel.json`. Confirm the build command
   is `npm run build` and the output directory is `dist`.
4. In **Settings → Deployment Protection**, enable **Vercel Authentication**
   with Standard Protection for preview deployments. Invite only the approved
   beta testers to Vercel, then use the protected preview URL as the beta URL.
   The public production domain is not the beta entry point on the Hobby plan.
   Do not add a shared password to this repository or to `VITE_` variables.
   Hobby permits one external user, so this supports the owner plus one friend
   without upgrading the plan.
5. Add environment variables only after the related integrations are ready:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   Never add an `sb_secret_` key, service-role key, database password, GitHub
   token, or Claude token to Vercel browser variables.
6. Turn on Vercel access for the release owner and one backup owner. Do not
   share a Vercel account among testers.

## What the repository enforces

- GitHub Actions installs the committed dependency lock with `npm ci`, then runs
  the full test suite, production build, and release smoke check on every pull
  request and `main` push.
- Vercel uses the same lockfile through `npm ci` before building with `npm run build`
  and serving `dist`.
- `GET /health.json` returns a small static health contract. It is deliberately
  cache-disabled so it confirms the selected deployment's build output.
- Basic browser security headers are configured in `vercel.json`.

The repository commits a reviewed npm lockfile and uses `npm ci` in CI and Vercel.
Regenerate and review it whenever dependencies change; do not use an unreviewed
floating dependency resolution for a beta deployment.

## Release checklist

Record the date, production URL, Git commit, Vercel deployment URL, engine save
version, diagnostic bundle version, and database migration version in the beta
release note.

1. Confirm the required pull requests are merged and GitHub Actions is green.
2. In a signed-out browser, open the Vercel-authenticated preview on desktop
   and a 390px-wide mobile browser. Confirm an unapproved visitor cannot reach
   the game and an invited tester can.
3. Start a world, play for several ticks, refresh, and verify the local save
   restores.
4. Export and re-import a world; export a diagnostic bundle.
5. Verify `GET /health.json` returns `status: ok` and browser console has no
   errors.
6. After Supabase is connected, repeat the anonymous identity, ownership, cloud
   backup, outage, and feedback checks in `BETA_DATA_FOUNDATION.md`.
7. Keep the protected preview URL as the beta URL. A merge to `main` may update
   the public production deployment, but it must not be presented as private on
   the Hobby plan. Record the preview deployment URL and health endpoint in the
   release note instead.

## Incident and recovery

1. Pause invitations and confirm the protected preview is actually failing
   through the Vercel dashboard or browser evidence.
2. Preview deployments are not eligible for Vercel Instant Rollback. Instead,
   locate the last known-good commit, create or re-open a branch at that commit,
   and use the resulting protected preview URL as the beta URL.
3. Re-check that replacement preview and `/health.json`, then record the
   recovery time, deployment URL, and restored commit.
4. A deployment recovery does not rewrite Supabase data or environment
   variables. Keep beta schema migrations additive and correct database
   mistakes with a new forward migration rather than destructive rollback SQL.
5. Before resuming invitations, run the release checklist against the
   replacement preview. If a later public production deployment is ever used,
   Hobby Instant Rollback can restore only the immediately previous production
   deployment; it is not the beta recovery mechanism.

Vercel documents that Git-connected projects create preview deployments for
branches and production deployments from the production branch. On the Hobby
plan, Standard Protection can use Vercel Authentication for protected previews,
while production domains remain public. Instant Rollback applies only to a
production-aliased deployment, not most previews. See the official deployment,
protection, and rollback guides when operating an incident.
