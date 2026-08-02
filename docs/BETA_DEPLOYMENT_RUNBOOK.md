# Private-beta deployment runbook

This runbook is the operational half of issue #154. It intentionally uses
Vercel Deployment Protection for the beta gate; Origins must never implement a
shared password in browser code.

## One-time project setup

1. In the Vercel Pro team, import `frason/origins` from GitHub.
2. Set `main` as the production branch. Vercel will create previews for pull
   requests and a production deployment after merges to `main`.
3. Vercel detects the Vite project from `vercel.json`. Confirm the build command
   is `npm run build` and the output directory is `dist`.
4. In **Settings → Deployment Protection**, enable password protection for both
   production and preview URLs. Store and rotate the shared beta password only
   in Vercel; do not add it to this repository or to `VITE_` variables.
5. Add environment variables only after the related integrations are ready:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   Never add an `sb_secret_` key, service-role key, database password, GitHub
   token, or Claude token to Vercel browser variables.
6. Turn on Vercel access for the release owner and one backup owner. Do not
   share a Vercel account among testers.

## What the repository enforces

- GitHub Actions runs the full test suite, production build, and release smoke
  check on every pull request and `main` push.
- Vercel builds with the same `npm run build` command and serves `dist`.
- `GET /health.json` returns a small static health contract. It is deliberately
  cache-disabled so it confirms the selected deployment's build output.
- Basic browser security headers are configured in `vercel.json`.

The repository currently has no committed npm lockfile. Before the public beta
cut, commit a reviewed lockfile and change both CI and Vercel to `npm ci`; that
makes dependency resolution reproducible rather than accepting future matching
minor versions.

## Release checklist

Record the date, production URL, Git commit, Vercel deployment URL, engine save
version, diagnostic bundle version, and database migration version in the beta
release note.

1. Confirm the required pull requests are merged and GitHub Actions is green.
2. Open the password-protected Vercel preview on desktop and a 390px-wide mobile
   browser.
3. Start a world, play for several ticks, refresh, and verify the local save
   restores.
4. Export and re-import a world; export a diagnostic bundle.
5. Verify `GET /health.json` returns `status: ok` and browser console has no
   errors.
6. After Supabase is connected, repeat the anonymous identity, ownership, cloud
   backup, outage, and feedback checks in `BETA_DATA_FOUNDATION.md`.
7. Merge to `main`, confirm the protected production URL and health endpoint,
   then send the shared password through a private channel.

## Incident and rollback

1. Pause invitations and confirm the current production deployment is actually
   failing through the Vercel dashboard or production logs.
2. In Vercel, use **Instant Rollback** to return the production domain to the
   prior known-good deployment. Pro teams may select an older eligible
   production deployment; the CLI equivalent is `vercel rollback <deployment>`.
3. Re-check the password-protected production URL and `/health.json`, then
   record the rollback time and restored commit.
4. A Vercel rollback changes routing; it does not rewrite Supabase data or
   environment variables. Keep beta schema migrations additive and correct
   database mistakes with a new forward migration rather than destructive
   rollback SQL.
5. Before the next release, validate the fix on a protected preview. Promoting
   a deployment re-enables normal production assignment after a rollback.

Vercel documents that Git-connected projects create preview deployments for
branches and production deployments from the production branch. Its Instant
Rollback restores routing without rebuilding, while environment variables stay
with their deployment configuration. See the official deployment and rollback
guides when operating an incident.
