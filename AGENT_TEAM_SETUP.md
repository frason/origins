# Agent Team Setup for Origins

The CS-agent-team system is configured and ready to run. Here's what you need to do to activate it.

## ✅ Already Set Up

- **Directories created:** `scripts/`, `queue/`, `artifacts/`, `logs/`, `lead-inbox/`, `questions/`, `.claude/agents/`
- **Files copied:** dispatcher.sh, gh_sync.sh, agent definitions (pm.md, lead.md, worker.md, karen.md)
- **Configuration:**
  - `schedule.json` — Worker lanes: simulation, frontend, backend, tests
  - `SPEC.md` — Template (will be filled by PM during kickoff)
  - `STATUS.md` — Status board template
  - `.claude/settings.json` — Permission allowlist for headless runs
  - `.env` — Template (needs your tokens)

## 🔧 Next Steps

### 1. Get your Claude subscription token

Run this command:
```bash
claude setup-token
```

Copy the token it outputs (starts with `sk-ant-oat01-...`) and paste it into `.env`:
```bash
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-YOUR_TOKEN_HERE
```

### 2. Authenticate GitHub (optional but recommended for this setup)

Since the agent team is configured to sync with GitHub (enabled in `schedule.json`), you should authenticate:
```bash
gh auth login
```

Follow the prompts. This stores your token securely. If you prefer a PAT instead, generate one at https://github.com/settings/tokens and paste it into `.env`:
```bash
GH_TOKEN=ghp_YOUR_TOKEN_HERE
```

### 3. Test the setup

Run the dispatcher manually once to verify everything works:
```bash
./scripts/dispatcher.sh
```

Check for errors:
```bash
cat logs/dispatcher.log
cat logs/usage.jsonl
```

### 4. Add the heartbeat to cron (optional, but needed for background runs)

The agent team needs a cron job to tick every 10 minutes. Get the absolute path:
```bash
pwd  # copy this
```

Edit crontab:
```bash
crontab -e
```

Add this line (replace `/ABS/PATH` with your `pwd` output):
```
*/10 * * * * /ABS/PATH/origins/scripts/dispatcher.sh >> /ABS/PATH/origins/logs/dispatcher.log 2>&1
```

**Important:** Use absolute paths. The dispatcher reads `.env` to get your token and PATH.

## 🚀 Kick Off the Project

Once `.env` is configured, start the PM agent:

```bash
claude --agent pm
```

The PM will:
1. Run a **`/plan` intake** (asks ~10 questions about the project)
2. Fill `SPEC.md` with your answers
3. Seed the lead-inbox for the lead agent to start planning
4. Show you the initial STATUS

That's it! The lead and workers will start running on the cron heartbeat every 10 minutes, and you'll see:
- **Questions** from the lead appear in GitHub issues (if enabled) or in `questions/`
- **Work** as PRs or tracked in STATUS.md
- **Progress** logged in `logs/activity.log`

## How to Work With the Team

Once running, interact with the PM:

```bash
# Check status
claude --agent pm
# Then ask: "what's going on?"

# Hand off ideas
# Tell the PM about feature requests or fixes

# Check the lead's questions
# The PM will relay them; answer via GitHub issue comments or the PM

# Monitor progress
# The PM reports claimed vs verified work
```

## Quick Reference

| Command | What it does |
|---------|-------------|
| `claude --agent pm` | Open PM (check status, hand off work, adjust schedule) |
| `./scripts/dispatcher.sh` | Run one tick manually (for testing) |
| `cat logs/activity.log` | See what agents ran |
| `cat logs/usage.jsonl` | See token spend per run |
| `/usage` in PM agent | Check rolling 5-hour and weekly consumption |

## Next: Open the PM

Once you've set up `.env`, open the PM:

```bash
claude --agent pm
```

It will ask the project kickoff questions. Your answers become the SPEC, and the lead will use that to plan the build.

---

For detailed docs on the agent-team system, see `/Users/frason/Developer/CS-agent-team/SKILL.md`.
