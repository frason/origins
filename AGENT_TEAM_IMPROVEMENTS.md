# Agent Team Skill — Suggested Improvements

## Summary

The current agent-team skill requires several manual terminal steps after the PM runs. These improvements will make the system **fully executable from Claude Code** with zero manual CLI work.

---

## Improvement 1: Automated Token Extraction & .env Setup

### Current Flow (Manual)
1. User runs `claude setup-token` in separate terminal
2. User manually edits `.env` file
3. Cron gets token from `.env`

### Improved Flow (Automated in Claude Code)
- **PM agent** (or setup step) detects missing `CLAUDE_CODE_OAUTH_TOKEN` in `.env`
- **Prompts user:** "I need to set up your subscription token. Run `claude setup-token` in a terminal, paste the result, and I'll configure it"
- **User pastes token** in a single line (PM receives it as input)
- **PM agent automatically:**
  - Updates `.env` with token securely
  - Validates token works (runs a dummy `claude` command with `--dry-run` or minimal API call)
  - Reports success/failure

### Implementation Notes
```bash
# In PM or setup agent
if ! grep -q "CLAUDE_CODE_OAUTH_TOKEN=sk-ant" .env; then
  # Prompt user for token
  # Write to .env: CLAUDE_CODE_OAUTH_TOKEN=<user_input>
  # Test: claude --version with that token in env
fi
```

---

## Improvement 2: Automated Cron Setup (No Manual crontab -e)

### Current Flow (Manual)
1. User runs `pwd`
2. User runs `crontab -e`
3. User manually pastes the line
4. User exits editor

### Improved Flow (Automated)
- **PM or worker agent** detects `scheduler.sh` exists but is not in crontab
- **Checks crontab:** `crontab -l | grep dispatcher.sh`
- **If missing, automatically adds it** with the correct absolute path
- **Implementation:**
  ```bash
  CRON_LINE="*/10 * * * * /ABS/PATH/scripts/dispatcher.sh >> /ABS/PATH/logs/dispatcher.log 2>&1"
  (crontab -l 2>/dev/null | grep -v dispatcher.sh; echo "$CRON_LINE") | crontab -
  ```
- **Reports:** "Cron heartbeat installed and running. First worker tick in ≤10 minutes."
- **Validates:** Runs `dispatcher.sh` once manually to confirm it works

### Notes
- macOS + Linux compatible (pure bash)
- Works even if crontab is empty
- Handles both new and existing crontabs safely
- Runs dispatcher once immediately for validation

---

## Improvement 3: GitHub Authentication Auto-Setup

### Current Flow (Manual)
1. User runs `gh auth login` separately
2. User pastes GitHub token or authenticates via browser
3. Relies on `~/.config/gh/hosts.yml`

### Improved Flow (Automated if GitHub enabled)
- **PM or lead agent** detects `github.enabled: true` in `schedule.json`
- **Checks:** `gh auth status` (if gh is installed)
- **If not authenticated:**
  - **Option A (Recommended):** Prompts user to run `gh auth login` once (links to browser, minimal interaction)
  - **Option B (If PAT available):** Asks user to paste a GitHub PAT (generates token URL for user, walks through it)
- **Validates:** `gh repo view` to confirm access to the configured repo
- **Stores:** Token in `~/.config/gh/hosts.yml` (gh handles this)

---

## Improvement 4: One-Step Verification After Setup

### Current Flow
- User manually runs `./scripts/dispatcher.sh`
- User manually checks logs

### Improved Flow
- **After all setup complete**, PM or worker runs dispatcher once
- **Captures output:** checks `logs/dispatcher.log` and `logs/usage.jsonl`
- **Reports:**
  ```
  ✅ Setup Complete
  - Token: ✓ Working
  - Cron: ✓ Installed (next run in ~10 min)
  - GitHub: ✓ Authenticated
  - First dispatcher run: ✓ Successful
  
  Lead agent will run at :00 and :30 every 10 minutes.
  Check back in ~10 min or run: claude --agent pm
  ```

---

## Improvement 5: PM Setup Wizard (Greenfield Kickoff)

### Current Flow
User opens PM; PM immediately asks discovery questions. If `.env` is broken, nothing works.

### Improved Flow
**PM detects new project** (empty `SPEC.md`, no tokens, etc.) and runs **setup wizard first:**

1. **Welcome + requirements check**
   - Confirm project path is correct
   - Check `jq` installed
   - Check `claude` CLI available
   
2. **Token setup** (Improvement 1)
   - Prompts for subscription token
   - Validates it
   - Writes `.env`

3. **GitHub setup (optional)** (Improvement 3)
   - "Enable GitHub integration for this project?" (yes/no)
   - If yes, authenticates gh or stores PAT

4. **Cron setup** (Improvement 2)
   - Adds to crontab
   - Runs dispatcher once to validate
   - Shows success

5. **Then proceeds to project kickoff**
   - Now runs the full `/plan` intake

### Pseudocode
```markdown
# .claude/agents/pm.md enhancement

## Setup Wizard Flow
IF (SPEC.md is empty OR .env is missing tokens) THEN
  RUN setup wizard:
    1. Check requirements
    2. Prompt for token → write .env → validate
    3. Ask about GitHub → auth or skip
    4. Add cron → test dispatcher
  
  THEN run normal project intake (/plan)
ELSE
  Run normal PM duties (check status, hand off work)
```

---

## Improvement 6: Recovery / Repair Commands

### New PM Capabilities
- **`repair`** — Checks all setup, fixes broken .env, re-adds cron, tests dispatcher
- **`restart-dispatcher`** — Manually runs one heartbeat tick (testing)
- **`check-cron`** — Shows current crontab entry, last run time from logs
- **`test-token`** — Validates subscription token is still valid

---

## Implementation Checklist

### Phase 1 (High Priority)
- [ ] **Improvement 1:** PM prompts for token, writes .env, validates
- [ ] **Improvement 2:** PM detects missing cron, adds it safely, runs dispatcher once
- [ ] **Improvement 4:** Post-setup verification & user-friendly report

### Phase 2 (Medium Priority)
- [ ] **Improvement 3:** GitHub auth detection & prompting
- [ ] **Improvement 5:** Setup wizard for greenfield projects
- [ ] **Improvement 6:** Recovery commands in PM

---

## Files to Update

### `.claude/agents/pm.md` 
- Add setup wizard logic
- Add token extraction & .env writing
- Add cron setup
- Add validation/verification steps
- Add repair/debug commands

### `assets/schedule.json`
- No changes needed (already good)

### `assets/env.example`
- Update comments: "Will be auto-populated by PM if missing"

### `scripts/dispatcher.sh`
- No changes needed (already portable)

### New: `scripts/setup.sh`
- Standalone setup script (optional, for manual runs)
- Called by PM or run independently
- Handles: token validation, cron setup, github auth, dispatcher test

---

## UX Flow After Improvements

### User's Experience (Start to Finish)

```
$ cd /Users/frason/Developer/origins
$ claude --agent pm

[PM opens]
🚀 Setting up Origins for the first time...

1️⃣ Checking requirements...
   ✓ jq installed
   ✓ claude CLI found
   ✓ Project root confirmed

2️⃣ Subscription token...
   Run this command in another terminal and paste the result:
   $ claude setup-token
   
   [User runs command, pastes: sk-ant-oat01-...]
   
   ✓ Token saved to .env
   ✓ Token validated (works!)

3️⃣ GitHub integration...
   Enable GitHub for frason/origins? (y/n) y
   
   [Runs: gh auth login]
   ✓ Authenticated to GitHub
   ✓ Confirmed access to frason/origins

4️⃣ Starting cron heartbeat...
   ✓ Cron entry added (runs every 10 min)
   ✓ First dispatcher run: SUCCESS
   ✓ Next lead run: in ~10 minutes

✨ Setup complete! Now let's plan the project...

[Proceeds to /plan intake for SPEC.md]
```

### Thereafter (Every Session)
```
$ claude --agent pm

[PM opens, reads STATUS.md, shows current state]

Project Origins — discovery phase
Lead inbox: 2 pending tasks
Questions for you: 1 (architecture decision)
Last activity: 5 minutes ago

What would you like to do?
```

---

## Benefits Summary

| Benefit | Impact |
|---------|--------|
| **No manual .env editing** | Users can't paste tokens wrong; atomic validation |
| **No crontab -e** | Works on all machines; safer, auditable |
| **One-step setup** | From PM agent; no scattered instructions |
| **Automated validation** | Catches issues before background runs fail |
| **GitHub auto-auth** | If enabled, "just works" after one browser login |
| **Recovery commands** | Users can diagnose & fix without support |
| **Greenfield wizard** | New projects guided through setup, not confused |

---

## Backward Compatibility

- **Existing projects:** PM detects tokens present, skips wizard, runs normally
- **Manual setup:** Users can still run setup scripts standalone if preferred
- **crontab:** If already present, PM validates & preserves it

---

## Risk Mitigation

1. **Token security:**
   - Never echo token in logs
   - Store in `.env` (already .gitignored)
   - Validate immediately after writing
   - Option to rotate if needed

2. **Cron safety:**
   - Check crontab before adding (avoid duplicates)
   - Use absolute paths only
   - Test dispatcher before relying on cron

3. **GitHub:**
   - Respect existing authentication
   - Don't force PAT if `gh auth login` works
   - Validate repo access, don't just assume

---

**Ready to integrate?** This keeps the system "just works" from Claude Code, with no CLI friction for users.
