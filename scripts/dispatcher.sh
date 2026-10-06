#!/usr/bin/env bash
#
# dispatcher.sh — GitHub Issues-backed cron heartbeat for the agent team.
#
# Task state is managed via GitHub Issue labels:
#   agent-todo     → queued, not yet claimed
#   agent-doing    → dispatcher claimed it (prevents double-dispatch)
#   agent-review   → worker done; awaiting karen verification
#   agent-done     → karen passed; issue closed
#   agent-backlog  → sequenced task waiting on dependencies (created by lead)
#   agent-triage   → user-entered issue awaiting lead priority/timing triage
#   agent-question → lead needs client input; client answers by commenting
#   agent-blocked  → exceeded max_worker_attempts; needs manual intervention or lead attention
#
# Add ONE line to your crontab (absolute paths required):
#   */10 * * * * /ABS/PATH/scripts/dispatcher.sh >> /ABS/PATH/logs/dispatcher.log 2>&1
#
# Each tick does AT MOST ONE thing (priority order):
#   1. LEAD pass  — at lead_windows minutes, or when untriaged issues exist, or --force-lead
#   2. KAREN pass — oldest agent-review issue (always before new work)
#   3. WORKER run — round-robin agent-todo issue (skips untriaged, prevents low-numbered issues from starving higher ones)
#
# Manual override flags (bypass active_hours + budgets; still respect paused):
#   dispatcher.sh --force-lead                  run the lead agent right now
#   dispatcher.sh --force-worker               run on the oldest agent-todo issue
#   dispatcher.sh --force-worker <issue-num>   run on a specific issue
#
# Global budget: ~/.claude/agent-team-budget.json caps spend across ALL projects and
# reserves headroom for PM interactions. See check_global_budget() below.
#
# Portable across macOS (bash 3.2, BSD date/grep) and Linux.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

# load cron environment (PATH + CLAUDE_CODE_OAUTH_TOKEN / GH_TOKEN)
if [ -f "$ROOT/.env" ]; then set -a; . "$ROOT/.env"; set +a; fi

# ---- parse manual force flags ----
force_lead=false
force_issue=""
while [ $# -gt 0 ]; do
  case "$1" in
    --force-lead)
      force_lead=true; shift ;;
    --force-worker)
      if [ -n "${2:-}" ] && printf '%s' "${2:-}" | grep -qE '^[0-9]+$'; then
        force_issue="$2"; shift 2
      else
        force_issue="next"; shift
      fi ;;
    *)
      echo "$(date +%Y-%m-%dT%H:%M:%S) unknown flag: $1"
      echo "usage: dispatcher.sh [--force-lead] [--force-worker [<issue-number>]]"
      exit 1 ;;
  esac
done

# ---- paths ----
SCHEDULE="$ROOT/schedule.json"
STATE="$ROOT/state"
USAGE="$ROOT/logs/usage.jsonl"
ACTIVITY="$ROOT/logs/activity.log"
LOCKDIR="$ROOT/.dispatcher.lock.d"
INBOX="$ROOT/lead-inbox"
GLOBAL_BUDGET_FILE="${HOME}/.claude/agent-team-budget.json"

mkdir -p "$STATE" "$ROOT/logs" "$INBOX/done"

TS()  { date +%Y-%m-%dT%H:%M:%S; }
log() { echo "$(TS) $*" | tee -a "$ACTIVITY"; }

# Helper: set issue labels with verification and retry on GitHub mismatch.
# Runs gh issue edit, then verifies the labels actually changed on GitHub.
# Retries up to 2 additional times if verification fails.
# Usage: set_issue_label <issue_num> <remove_label> <add_label>
set_issue_label() {
  local iss_num="$1" remove_label="$2" add_label="$3"
  local max_retries=2 attempt=0

  while [ $attempt -le $max_retries ]; do
    # Execute the label change
    gh issue edit "$iss_num" --repo "$REPO" \
      --remove-label "$remove_label" --add-label "$add_label" >/dev/null 2>&1

    # Re-read actual labels from GitHub to verify the change landed
    local actual_labels=$(gh issue view "$iss_num" --repo "$REPO" \
      --json labels --jq '.labels[].name' 2>/dev/null || echo "")

    # Verify expected state:
    # - add_label must be present
    # - remove_label must be absent
    local has_add=false has_remove=false
    while IFS= read -r lbl; do
      [ -z "$lbl" ] && continue
      if [ "$lbl" = "$add_label" ]; then
        has_add=true
      fi
      if [ "$lbl" = "$remove_label" ]; then
        has_remove=true
      fi
    done <<< "$actual_labels"

    if [ "$has_add" = "true" ] && [ "$has_remove" = "false" ]; then
      # Verification passed — label state matches expected
      return 0
    fi

    # Mismatch detected; prepare for retry
    attempt=$(( attempt + 1 ))
    if [ $attempt -le $max_retries ]; then
      sleep 1
    fi
  done

  # All retries exhausted; log mismatch and return failure
  local actual_labels=$(gh issue view "$iss_num" --repo "$REPO" \
    --json labels --jq '.labels[].name' 2>/dev/null | paste -sd ',' - 2>/dev/null || echo "unknown")
  log "LABEL-MISMATCH: issue #$iss_num expected add [$add_label] remove [$remove_label], got [$actual_labels] after retries"
  return 1
}

# Helper: push with automatic non-fast-forward reconciliation.
# Fetches latest from origin, attempts ff-only merge (fallback to auto-merge on conflicts),
# and retries push. On merge conflicts, aborts and returns failure with a clear log message.
# Usage: push_with_retry <base_branch>
# Returns: 0 on success, 1 on failure (fetch, merge, or push failure)
push_with_retry() {
  local base_branch="$1"

  # Fetch latest from origin
  if ! git fetch origin "$base_branch" 2>/dev/null; then
    log "  fetch origin/$base_branch failed; cannot reconcile"
    return 1
  fi

  # Attempt fast-forward merge (preferred: no merge commit)
  if ! git merge --ff-only "origin/${base_branch}" 2>/dev/null; then
    # ff-only failed; try auto-merge with merge commit as fallback
    if ! git merge --no-edit "origin/${base_branch}" 2>/dev/null; then
      # Real merge conflict detected; abort and fail
      git merge --abort 2>/dev/null || true
      log "  merge conflict detected during non-ff reconciliation — cannot auto-merge, push failed"
      return 1
    fi
  fi

  # Merge succeeded (or was unnecessary); attempt push
  git push origin HEAD
}

# A verified issue may commit only the explicit worker manifest; never stage the
# whole worktree because client files and a later issue may already be present.
#
# MANIFEST RESOLUTION (in priority order):
# 1. Primary: worker leaves changes uncommitted with numbered manifest file
#    (state/worker_output_<N>.txt with "Changed files:" line)
# 2. Fallback 1: if numbered manifest missing/malformed, check for generic
#    worker_output.txt (no number) — if found and relatively recent, derive
#    manifest from git diff and stage/commit those changes.
# 3. Fallback 2: if generic file also missing, derive manifest directly from
#    git diff --name-only (all uncommitted tracked changes).
#
# Fallback paths exist to prevent livelock when workers incorrectly write to
# state/worker_output.txt (generic) instead of state/worker_output_<N>.txt
# (numbered), or omit the "Changed files:" line entirely. Seen in issues #229
# and #231; these fallbacks harden against recurrence.
commit_verified_issue() {
  local number="$1" title="$2" manifest paths path base_branch changed_files fallback_used
  manifest=$(grep '^Changed files:' "$STATE/worker_output_${number}.txt" 2>/dev/null | tail -1 | sed 's/^Changed files:[[:space:]]*//')

  # Check if a qualifying commit for this issue already exists and is pushed.
  # This handles the case where work was completed in a prior pass (no current
  # worker_output file, but commit already landed and pushed to origin).
  base_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
  if [ -n "$base_branch" ]; then
    matching_commit=$(git rev-list --all --grep="(closes #${number})" --oneline 2>/dev/null | head -1)
    if [ -n "$matching_commit" ]; then
      commit_hash=$(printf '%s' "$matching_commit" | cut -d' ' -f1)
      if git rev-list "origin/${base_branch}" 2>/dev/null | grep -qF "$commit_hash"; then
        # Commit already exists and is pushed to origin — treat as success
        return 0
      fi
    fi
  fi

  if [ -n "$manifest" ]; then
    # Primary path: worker left changes uncommitted with manifest.
    # Do not absorb an operator's already-staged work into an issue commit.
    git diff --cached --quiet || return 1
    paths=$(printf '%s' "$manifest" | tr ',' '\n')
    while IFS= read -r path; do
      path=$(printf '%s' "$path" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
      case "$path" in ''|/*|*'..'* ) return 1 ;; esac
      [ -e "$path" ] || return 1
      git add -- "$path"
    done <<EOF
$paths
EOF
    # After staging manifest files, check if anything was actually staged.
    if git diff --cached --quiet; then
      # Nothing new staged (already committed) — check if there are unpushed commits.
      base_branch=$(git rev-parse --abbrev-ref HEAD)
      if [ -n "$(git rev-list -n1 "origin/${base_branch}..HEAD" 2>/dev/null)" ]; then
        # Unpushed commits exist — push them (with non-ff reconciliation).
        push_with_retry "$base_branch" || return 1
      else
        # No staged changes and no unpushed commits — fail.
        return 1
      fi
    else
      # Staged changes exist — commit and push as normal.
      git commit -m "chore(issue): ${title} (closes #${number})" || return 1
      push_with_retry "$base_branch" || return 1
    fi
  else
    # Numbered manifest missing/malformed — try fallback paths.
    git diff --cached --quiet || return 1

    fallback_used=0
    changed_files=""

    # FALLBACK 1: check for generic worker_output.txt (worker wrote to wrong file)
    if [ -f "$STATE/worker_output.txt" ]; then
      # Verify file is recent (modified within last 60 min) to avoid using stale output.
      if find "$STATE/worker_output.txt" -mmin -60 -type f >/dev/null 2>&1; then
        changed_files=$(git diff --name-only -- . ':!state/*' 2>/dev/null)
        if [ -n "$changed_files" ]; then
          log "  issue #$number PASSED — committed via fallback manifest (generic worker_output.txt found, deriving from git diff)"
          fallback_used=1
        fi
      fi
    fi

    # FALLBACK 2: if generic file missing/stale, derive from git diff directly
    if [ "$fallback_used" -eq 0 ]; then
      changed_files=$(git diff --name-only -- . ':!state/*' 2>/dev/null)
      if [ -n "$changed_files" ]; then
        log "  issue #$number PASSED — committed via fallback manifest (no worker output file or file stale, deriving from git diff)"
      fi
    fi

    # If we found changes to commit, stage and commit them
    if [ -n "$changed_files" ]; then
      paths=$(printf '%s' "$changed_files" | tr '\n' ',')
      # Convert back to newline-separated for processing
      changed_files=$(printf '%s' "$paths" | tr ',' '\n')

      while IFS= read -r path; do
        path=$(printf '%s' "$path" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        [ -z "$path" ] && continue
        case "$path" in ''|/*|*'..'* ) return 1 ;; esac
        [ -e "$path" ] || return 1
        git add -- "$path"
      done <<EOF
$changed_files
EOF

      if git diff --cached --quiet; then
        # Nothing new staged (already committed) — check if there are unpushed commits.
        base_branch=$(git rev-parse --abbrev-ref HEAD)
        if [ -n "$(git rev-list -n1 "origin/${base_branch}..HEAD" 2>/dev/null)" ]; then
          # Unpushed commits exist — push them (with non-ff reconciliation).
          push_with_retry "$base_branch" || return 1
        else
          # No staged changes and no unpushed commits — fail.
          return 1
        fi
      else
        # Staged changes exist — commit and push as normal.
        git commit -m "chore(issue): ${title} (closes #${number})" || return 1
        push_with_retry "$base_branch" || return 1
      fi
    else
      # No changes from either path — check for unpushed commits as last resort
      base_branch=$(git rev-parse --abbrev-ref HEAD)
      if [ -n "$(git rev-list -n1 "origin/${base_branch}..HEAD" 2>/dev/null)" ]; then
        # Local commits exist but are not on origin — push them (with non-ff reconciliation).
        push_with_retry "$base_branch" || return 1
      else
        # No manifest, no git diff changes, and no unpushed commits — fail.
        return 1
      fi
    fi
  fi
}

# ---- preflight: required tools ----
command -v jq     >/dev/null 2>&1 || { log "ERROR: jq not found in PATH";                exit 1; }
command -v gh     >/dev/null 2>&1 || { log "ERROR: gh CLI not found in PATH";             exit 1; }
command -v claude >/dev/null 2>&1 || { log "ERROR: claude CLI not in PATH (set in .env)"; exit 1; }

# ---- preflight: git repository with a github.com remote ----
git rev-parse --git-dir >/dev/null 2>&1 \
  || { log "ERROR: must be run inside a git repository"; exit 1; }
origin_url=$(git remote get-url origin 2>/dev/null || true)
case "$origin_url" in
  *github.com*) : ;;
  *) log "ERROR: remote 'origin' must point to github.com (found: '${origin_url:-none}')"; exit 1 ;;
esac
gh api user --jq '.login' >/dev/null 2>&1 \
  || { log "ERROR: gh not authenticated — run 'gh auth login' or set GH_TOKEN in .env"; exit 1; }

# ---- read policy ----
[ -f "$SCHEDULE" ] || { log "ERROR: schedule.json not found at $SCHEDULE"; exit 1; }
[ "$(jq -r '.paused // false' "$SCHEDULE")" = "true" ] && { log "globally paused — nothing to do"; exit 0; }

REPO=$(jq -r '.github.repo // ""' "$SCHEDULE")
[ -n "$REPO" ] || { log "ERROR: github.repo not set in schedule.json"; exit 1; }

if ! git diff --quiet -- "$SCHEDULE" 2>/dev/null; then
  log "WARNING: schedule.json has uncommitted changes — commit them (git add schedule.json && git commit) or a git operation (pull/checkout/reset) may silently discard your edits"
fi

now_epoch=$(date +%s)
STALE_HOURS=6  # Watchdog: reset agent-doing/agent-review issues stale for this many hours
hour=$(( 10#$(date +%H) ))
minute=$(( 10#$(date +%M) ))
max_turns=$(        jq -r '.max_turns               // 25'      "$SCHEDULE")
worker_model=$(     jq -r '.worker_model            // "haiku"' "$SCHEDULE")
karen_model=$(      jq -r '.karen_model             // "sonnet"' "$SCHEDULE")
lead_model=$(       jq -r '.lead_model              // "sonnet"' "$SCHEDULE")
lead_max_turns=$(   jq -r '.lead_max_turns          // 50'      "$SCHEDULE")
karen_max_turns=$(  jq -r '.karen_max_turns         // 50'      "$SCHEDULE")
lead_paused=$(      jq -r '.lead_paused             // false'   "$SCHEDULE")
soft_budget=$(      jq -r '.soft_budget_usd_per_5h  // 0'       "$SCHEDULE")
max_worker_attempts=$(jq -r '.max_worker_attempts   // 3'       "$SCHEDULE")
worker_escalation_model=$(jq -r '.worker_escalation_model // ""' "$SCHEDULE")
worker_escalation_after=$(jq -r '.worker_escalation_after // 1'  "$SCHEDULE")
project_num=$(      jq -r '.github.project_number  // ""'       "$SCHEDULE")

# ---- refresh the rolling-budget summary in STATUS.md (token-free, gated) ----
if [ "$(jq -r '.telemetry.show_rolling_budget_in_status // false' "$SCHEDULE")" = "true" ]; then
  bash "$SCRIPT_DIR/budget_check.sh" || true
fi

# ---- active_hours (skipped for any --force flag) ----
if [ -z "$force_issue" ] && [ "$force_lead" != "true" ]; then
  ah_start=$(jq -r '.active_hours.start // 0'  "$SCHEDULE")
  ah_end=$(  jq -r '.active_hours.end   // 24' "$SCHEDULE")
  if (( hour < ah_start || hour >= ah_end )); then
    echo "$(TS) outside active hours (${ah_start}–${ah_end}); skipping"; exit 0
  fi
fi

# ---- per-project soft budget throttle (skipped for any --force flag) ----
if [ -f "$USAGE" ] && [ "$soft_budget" != "0" ] && [ -z "$force_issue" ] && [ "$force_lead" != "true" ]; then
  cutoff=$(( now_epoch - 5*3600 ))
  spent=$(jq -s --argjson c "$cutoff" \
    '[.[] | select(.ts >= $c) | .cost] | add // 0' "$USAGE" 2>/dev/null || echo 0)
  if [ "$(jq -n --argjson s "$spent" --argjson b "$soft_budget" '$s >= $b')" = "true" ]; then
    log "throttled: \$$spent in last 5h >= per-project soft budget \$$soft_budget"; exit 0
  fi
fi

# ---- global budget helpers ----
# ~/.claude/agent-team-budget.json tracks spend across ALL projects and reserves
# headroom for PM interactions. Format:
#   { "budget_usd_per_5h": 10, "pm_reserve_usd": 0.5, "entries": [...] }
# budget_usd_per_5h = 0 disables the global cap.

check_global_budget() {
  # Force flags bypass the global cap (same as per-project soft budget).
  if [ -n "$force_issue" ] || [ "$force_lead" = "true" ]; then return 0; fi
  [ -f "$GLOBAL_BUDGET_FILE" ] || return 0
  local g_budget g_reserve cutoff g_spent g_remaining
  g_budget=$(jq -r '.budget_usd_per_5h // 0' "$GLOBAL_BUDGET_FILE" 2>/dev/null || echo 0)
  [ "$g_budget" = "0" ] || [ -z "${g_budget:-}" ] && return 0
  g_reserve=$(jq -r '.pm_reserve_usd // 0.5' "$GLOBAL_BUDGET_FILE" 2>/dev/null || echo 0.5)
  cutoff=$(( now_epoch - 18000 ))
  g_spent=$(jq --argjson c "$cutoff" \
    '[.entries[] | select(.ts >= $c) | .cost] | add // 0' \
    "$GLOBAL_BUDGET_FILE" 2>/dev/null || echo 0)
  g_remaining=$(jq -n --argjson s "$g_spent" --argjson b "$g_budget" '$b - $s')
  if [ "$(jq -n --argjson r "$g_remaining" --argjson res "$g_reserve" '$r <= $res')" = "true" ]; then
    log "global budget: \$$g_spent spent (all projects, last 5h) — \$$g_remaining remaining <= PM reserve \$$g_reserve — pausing cron"
    exit 0
  fi
}

record_global_spend() {
  [ -f "$GLOBAL_BUDGET_FILE" ] || return 0
  [ -f "$USAGE" ] || return 0
  local last_entry last_ts cost agent_name cutoff tmp
  last_entry=$(tail -1 "$USAGE" 2>/dev/null || true)
  [ -z "${last_entry:-}" ] && return 0
  last_ts=$(printf '%s' "$last_entry" | jq -r '.ts // 0' 2>/dev/null || echo 0)
  # Only record entries written in this tick (within 120s)
  [ "$(( now_epoch - last_ts ))" -gt 120 ] && return 0
  cost=$(printf '%s' "$last_entry" | jq -r '.cost // 0' 2>/dev/null || echo 0)
  agent_name=$(printf '%s' "$last_entry" | jq -r '.agent // "unknown"' 2>/dev/null || echo "unknown")
  cutoff=$(( now_epoch - 18000 ))
  tmp=$(mktemp)
  jq --arg repo "$REPO" --argjson ts "$now_epoch" --arg agent "$agent_name" \
     --argjson cost "$cost" --argjson cutoff "$cutoff" \
    '.entries = ([.entries[] | select(.ts >= $cutoff)] +
                 [{ts: $ts, project: $repo, agent: $agent, cost: $cost}])' \
    "$GLOBAL_BUDGET_FILE" > "$tmp" && mv "$tmp" "$GLOBAL_BUDGET_FILE" || rm -f "$tmp"
}

# ---- single-flight lock (atomic mkdir; auto-clears stale locks >25m) ----
if [ -d "$LOCKDIR" ] && [ -n "$(find "$LOCKDIR" -maxdepth 0 -mmin +25 2>/dev/null)" ]; then
  rmdir "$LOCKDIR" 2>/dev/null || true
fi
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  echo "$(TS) previous tick still running; skipping"; exit 0
fi
trap 'rmdir "$LOCKDIR" 2>/dev/null || true' EXIT INT TERM

# ---- helper: run a claude agent headless, log cost ----
# Usage: run_agent <agent> <model> <prompt-file> [<max-turns>]
run_agent() {
  local agent="$1" model="$2" pf="$3" mt="${4:-$max_turns}" out rc cost subtype
  out=$(claude -p \
          --agent "$agent" \
          --model "$model" \
          --max-turns "$mt" \
          --output-format json < "$pf" 2>>"$ROOT/logs/dispatcher.log") && rc=0 || rc=$?

  if echo "$out" | jq -e . >/dev/null 2>&1; then
    cost=$(echo "$out" | jq -r '.total_cost_usd // 0')
    echo "$out" | jq -c --arg a "$agent" --argjson ts "$now_epoch" \
        '{ts:$ts, agent:$a, cost:(.total_cost_usd // 0), usage:(.usage // {})}' >> "$USAGE"
    subtype=$(echo "$out" | jq -r '.subtype // ""')
  else
    cost=0; subtype=""
  fi
  LAST_RUN_COST="$cost"

  if [ "$rc" -ne 0 ]; then
    if [ "$subtype" = "error_max_turns" ]; then
      log "MAX-TURNS-EXHAUSTED: ran $agent ($model) cost=\$$cost subtype=error_max_turns — treating as complete (verify output before trusting this run; \$0 cost or missing artifacts usually means it did nothing useful)"
      return 0
    fi
    log "ERROR: claude run failed for agent=$agent rc=$rc (see logs/dispatcher.log)"
    # stderr already lands in dispatcher.log via 2>>; stdout is where claude's own
    # error text (auth/session/rate-limit) usually shows up, so surface it too.
    [ -n "$out" ] && log "claude stdout (truncated): ${out:0:500}"
    return 1
  fi

  log "ran $agent ($model) cost=\$$cost"
  return 0
}

# ---- helper: promote backlog issues whose declared dependencies are all closed ----
promote_backlog() {
  local issues num body deps all_closed dep dep_state
  issues=$(gh issue list --repo "$REPO" --label "agent-backlog" --state open \
    --json number,body 2>/dev/null || true)
  [ -z "${issues:-}" ] || [ "$issues" = "[]" ] && return 0

  while IFS= read -r iss; do
    num=$(printf '%s' "$iss" | jq -r '.number')
    body=$(printf '%s' "$iss" | jq -r '.body // ""')
    deps=$(printf '%s' "$body" | grep -iE '^depends_on:' | head -1 \
           | sed 's/[^:]*:[[:space:]]*//' | grep -oE '[0-9]+' || true)

    if [ -z "${deps:-}" ]; then
      set_issue_label "$num" "agent-backlog" "agent-todo" || true
      log "  promoted backlog #$num → agent-todo (no dependencies declared)"
      continue
    fi

    all_closed=true
    for dep in $deps; do
      dep_state=$(gh issue view "$dep" --repo "$REPO" --json state \
        --jq '.state' 2>/dev/null || echo "OPEN")
      [ "$dep_state" = "CLOSED" ] || { all_closed=false; break; }
    done

    if [ "$all_closed" = "true" ]; then
      set_issue_label "$num" "agent-backlog" "agent-todo" || true
      log "  promoted backlog #$num → agent-todo (all dependencies closed)"
    fi
  done < <(printf '%s' "$issues" | jq -c '.[]' 2>/dev/null)
}

# ============================================================
# WATCHDOG — reconcile agent-doing/agent-review against ground truth
# ============================================================
# This function runs once per dispatcher invocation to detect issues that have been
# stuck in agent-doing or agent-review for longer than STALE_HOURS. For stuck issues:
# - If a commit landing the issue exists in git log, relabel to agent-done and close it
# - Otherwise, relabel to agent-todo and post a comment explaining the reset
#
# This catches any "internal state disagrees with GitHub ground truth" instances that
# slip past the read-back/retry fix in #280 or other label-write bugs, providing a
# self-healing backstop that prevents silent multi-day stalls.
#
# Testing: To manually exercise the watchdog with a shorter stale threshold:
#   1. Temporarily set STALE_HOURS=0 in this script (for immediate stale detection)
#   2. Label a test issue with agent-doing or agent-review (leave it for a few minutes)
#   3. Run: scripts/dispatcher.sh --force-lead
#   (The watchdog runs before LEAD PASS, so --force-lead lets you trigger it cleanly)
#   4. Observe the "WATCHDOG:" log line and verify the relabel happened
#   5. Check the GitHub issue to confirm the comment was posted (if reset) or it was closed (if committed)
#   6. Restore the original STALE_HOURS=6 value
watchdog_reconcile_stale_issues() {
  local stale_json issue old_label issue_num issue_updated_at issue_epoch
  local base_branch matching_commit commit_hash hours_stale stale_cutoff

  # Fetch all open issues with agent-doing or agent-review labels
  stale_json=$(gh issue list --repo "$REPO" --label "agent-doing,agent-review" \
    --state open --json number,updatedAt,labels 2>/dev/null || echo "[]")

  # Exit early if no results
  [ -z "${stale_json:-}" ] || [ "$stale_json" = "[]" ] && return 0

  stale_cutoff=$(( now_epoch - STALE_HOURS * 3600 ))

  # Process each stale issue
  while IFS= read -r issue; do
    issue_num=$(printf '%s' "$issue" | jq -r '.number')
    issue_updated_at=$(printf '%s' "$issue" | jq -r '.updatedAt')

    # Convert ISO 8601 updatedAt to epoch seconds
    # Try macOS date -j first, then Linux date -d, then fall back to current epoch
    issue_epoch=$(
      date -j -f "%Y-%m-%dT%H:%M:%SZ" "$issue_updated_at" "+%s" 2>/dev/null ||
      date -d "$issue_updated_at" "+%s" 2>/dev/null ||
      echo "$now_epoch"
    )

    # Only process if stale (older than cutoff)
    if [ "$issue_epoch" -lt "$stale_cutoff" ]; then
      hours_stale=$(( (now_epoch - issue_epoch) / 3600 ))

      # Extract the current stale label (should be one of agent-doing or agent-review)
      old_label=$(printf '%s' "$issue" | jq -r '.labels[] | select(.name == "agent-doing" or .name == "agent-review") | .name' | head -1)
      [ -z "$old_label" ] && continue  # Safety: skip if no stale label found

      # Check if a commit landing this issue exists in git
      base_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
      matching_commit=$(git rev-list --all --grep="(closes #${issue_num})" --oneline 2>/dev/null | head -1)

      if [ -n "$matching_commit" ]; then
        commit_hash=$(printf '%s' "$matching_commit" | cut -d' ' -f1)
        # Verify commit is pushed to origin
        if git rev-list "origin/${base_branch}" 2>/dev/null | grep -qF "$commit_hash"; then
          # Commit exists in origin — relabel to agent-done and close
          set_issue_label "$issue_num" "$old_label" "agent-done" || true
          gh issue close "$issue_num" --repo "$REPO" >/dev/null 2>&1 || true
          log "WATCHDOG: issue #$issue_num stale ${hours_stale}h (found commit $(printf '%s' "$commit_hash" | cut -c1-7)) — $old_label → agent-done, closed"
          continue
        fi
      fi

      # No landing commit found; reset to agent-todo and post explanatory comment
      set_issue_label "$issue_num" "$old_label" "agent-todo" || true
      gh issue comment "$issue_num" --repo "$REPO" \
        --body "⚠️ **Watchdog reset:** This issue was labeled \`$old_label\` for ${hours_stale} hours with no dispatcher activity. Resetting to \`agent-todo\` for a fresh attempt. (If the issue was actually completed, add a commit with message '(closes #${issue_num})' to re-close automatically.)" \
        >/dev/null 2>&1 || true
      log "WATCHDOG: issue #$issue_num stale ${hours_stale}h (no commit found) — $old_label → agent-todo, comment posted"
    fi
  done < <(printf '%s' "$stale_json" | jq -c '.[]' 2>/dev/null)
}

# Run watchdog early, before any main dispatch passes
watchdog_reconcile_stale_issues

# ============================================================
# LEAD PASS — at configured lead_windows minute values, when untriaged issues
# exist, or --force-lead. Always exits after this block.
# ============================================================
is_lead_window=$(jq -r --argjson m "$minute" \
  '(.lead_windows // [0]) | index($m) != null' "$SCHEDULE")

# Also trigger a lead pass if user-entered (untriaged) agent-todo issues exist.
# These lack the <!-- agent-planned --> marker that lead-created issues carry.
# Check every tick so the worker never claims an untriaged issue first.
if [ "$is_lead_window" = "false" ] && [ "$lead_paused" != "true" ] \
   && [ -z "$force_issue" ] && [ "$force_lead" != "true" ]; then
  untriaged_quick=$(gh issue list --repo "$REPO" --label "agent-todo" --state open \
    --json number,body --jq \
    '[.[] | select(.body | (. == null or (contains("<!-- agent-planned -->") | not)))] | length' \
    2>/dev/null || echo 0)
  if [ "${untriaged_quick:-0}" -gt 0 ]; then
    log "detected ${untriaged_quick} untriaged user-entered issue(s) — triggering lead pass"
    is_lead_window=true
  fi
fi

if [ "$is_lead_window" = "true" ] || [ "$force_lead" = "true" ]; then

  if [ "$lead_paused" = "true" ]; then
    log "lead paused (lead_paused: true) — skipping lead pass"
    exit 0
  fi

  check_global_budget

  # Promote backlog issues with satisfied dependencies (token-free).
  promote_backlog

  # Collect inbox items.
  fed_items=()
  for f in "$INBOX"/*.md; do
    [ -e "$f" ] || continue
    fed_items+=("$f")
  done
  inbox_count=${#fed_items[@]}

  # Count remaining backlog issues (after promotion above).
  backlog_count=$(gh issue list --repo "$REPO" --label "agent-backlog" --state open \
    --json number --jq 'length' 2>/dev/null || echo 0)

  # Untriaged user-entered issues (agent-todo without <!-- agent-planned -->).
  untriaged_json=$(gh issue list --repo "$REPO" --label "agent-todo" --state open \
    --json number,title,body --jq \
    '[.[] | select(.body | (. == null or (contains("<!-- agent-planned -->") | not)))]' \
    2>/dev/null || echo "[]")
  untriaged_count=$(printf '%s' "$untriaged_json" | jq 'length' 2>/dev/null || echo 0)

  # Agent-triage issues (awaiting client priority/timing response).
  triage_json=$(gh issue list --repo "$REPO" --label "agent-triage" --state open \
    --json number,title,body,comments 2>/dev/null || echo "[]")
  triage_answered_count=$(printf '%s' "$triage_json" \
    | jq '[.[] | select((.comments | length) > 0)] | length' 2>/dev/null || echo 0)
  triage_total=$(printf '%s' "$triage_json" | jq 'length' 2>/dev/null || echo 0)

  # Client questions (agent-question issues).
  question_json=$(gh issue list --repo "$REPO" --label "agent-question" --state open \
    --json number,title,body,comments 2>/dev/null || echo "[]")
  question_answered_count=$(printf '%s' "$question_json" \
    | jq '[.[] | select((.comments | length) > 0)] | length' 2>/dev/null || echo 0)
  question_total=$(printf '%s' "$question_json" | jq 'length' 2>/dev/null || echo 0)

  if [ "$inbox_count" -eq 0 ] && [ "${backlog_count:-0}" -eq 0 ] \
     && [ "${question_answered_count:-0}" -eq 0 ] \
     && [ "${untriaged_count:-0}" -eq 0 ] \
     && [ "${triage_answered_count:-0}" -eq 0 ] \
     && [ "$force_lead" != "true" ]; then
    log "lead window: nothing to do (empty inbox, no backlog, no answered questions, no untriaged issues)"
    exit 0
  fi

  log "LEAD PASS inbox=${inbox_count} backlog=${backlog_count:-0} untriaged=${untriaged_count:-0} triage=${triage_total:-0}(${triage_answered_count:-0} answered) questions=${question_total:-0}(${question_answered_count:-0} answered)"

  # Fetch current board state.
  todo_list=$(gh issue list --repo "$REPO" --label "agent-todo" --state open \
    --json number,title --jq '[.[] | "  #\(.number) \(.title)"] | join("\n")' 2>/dev/null \
    || echo "  (none)")
  doing_list=$(gh issue list --repo "$REPO" --label "agent-doing" --state open \
    --json number,title --jq '[.[] | "  #\(.number) \(.title)"] | join("\n")' 2>/dev/null \
    || echo "  (none)")
  review_list=$(gh issue list --repo "$REPO" --label "agent-review" --state open \
    --json number,title --jq '[.[] | "  #\(.number) \(.title)"] | join("\n")' 2>/dev/null \
    || echo "  (none)")
  backlog_list=$(gh issue list --repo "$REPO" --label "agent-backlog" --state open \
    --json number,title --jq '[.[] | "  #\(.number) \(.title)"] | join("\n")' 2>/dev/null \
    || echo "  (none)")

  tmp=$(mktemp)
  {
    printf 'This is your scheduled lead planning pass. Repo: %s\n\n' "$REPO"

    if [ -n "${project_num:-}" ]; then
      printf 'GitHub Project number: %s\n' "$project_num"
      printf 'Add new issues to this project: gh project item-add %s --owner OWNER --url ISSUE_URL\n\n' "$project_num"
    fi

    printf '## GitHub Issues board\n\n'
    printf 'agent-todo (ready for workers):\n%s\n\n'              "$todo_list"
    printf 'agent-doing (in flight):\n%s\n\n'                     "$doing_list"
    printf 'agent-review (awaiting karen verification):\n%s\n\n'  "$review_list"
    printf 'agent-backlog (waiting on dependencies):\n%s\n\n'     "$backlog_list"

    # Untriaged user-entered issues.
    if [ "${untriaged_count:-0}" -gt 0 ]; then
      printf '## Untriaged issues (user-entered — missing agent-planned marker)\n\n'
      printf 'These were created directly by the client. For EACH issue:\n\n'
      printf 'Case A — body contains "### Priority" (submitted via Issue Form):\n'
      printf '  Read priority, timing, and dependencies from the form fields.\n'
      printf '  Sequence immediately (relabel to agent-todo or agent-backlog).\n'
      printf '  Add <!-- agent-planned --> to the body: gh issue edit NUMBER --repo REPO --body "EXISTING_BODY\n\n<!-- agent-planned -->"\n\n'
      printf 'Case B — no structured fields (typed manually):\n'
      printf '  Comment on the issue asking:\n'
      printf '    1. Priority? (urgent / high / normal / low)\n'
      printf '    2. Timing? (before issue #N, this week, whenever)\n'
      printf '    3. Dependencies on other issues? (or none)\n'
      printf '    4. Any additional context?\n'
      printf '  Relabel: remove agent-todo, add agent-triage.\n\n'
      printf '%s' "$untriaged_json" | jq -r \
        '.[] | "### #\(.number) \(.title)\n\n\(.body // "(no body)")\n"' 2>/dev/null || true
      printf '\n'
    fi

    # Triage responses from client.
    if [ "${triage_total:-0}" -gt 0 ]; then
      printf '## Triage responses (agent-triage issues)\n\n'
      printf '%s' "$triage_json" | jq -r '.[] |
        "### #\(.number) \(.title)\n\n" +
        "Body:\n\(.body // "(no body)")\n\n" +
        if ((.comments // []) | length) > 0 then
          "Client responses:\n" +
          ([.comments[] | "- \(.author.login): \(.body)"] | join("\n")) + "\n\n" +
          "ACTION: Incorporate answers. Relabel to agent-todo or agent-backlog.\n" +
          "Add <!-- agent-planned --> to the issue body.\n"
        else
          "(awaiting client response — leave as agent-triage, proceed with other work)\n"
        end + "\n"' 2>/dev/null || true
    fi

    # Client questions.
    if [ "${question_total:-0}" -gt 0 ]; then
      printf '## Client questions (agent-question issues)\n\n'
      printf '%s' "$question_json" | jq -r '.[] |
        "### #\(.number) \(.title)\n\n" +
        "Question body:\n\(.body // "(no body)")\n\n" +
        if ((.comments // []) | length) > 0 then
          "Client response(s):\n" +
          ([.comments[] | "- \(.author.login): \(.body)"] | join("\n")) + "\n"
        else
          "(awaiting client response — do not block other work on this)\n"
        end + "\n"' 2>/dev/null || true
    fi

    if [ "$inbox_count" -gt 0 ]; then
      printf '## Inbox (%d item(s))\n\n' "$inbox_count"
      for f in "${fed_items[@]+"${fed_items[@]}"}"; do
        printf '### %s\n\n' "$(basename "$f")"
        cat "$f"
        printf '\n\n'
      done
    else
      printf '## Inbox\n\n(empty — check board state, triage, and questions above)\n\n'
    fi
  } > "$tmp"

  run_agent lead "$lead_model" "$tmp" "$lead_max_turns" || true
  record_global_spend
  rm -f "$tmp"

  # Archive inbox items fed on this pass.
  for f in "${fed_items[@]+"${fed_items[@]}"}"; do
    [ -e "$f" ] && mv "$f" "$INBOX/done/" 2>/dev/null || true
  done

  exit 0
fi

# ============================================================
# RULE 1 — Priority: karen verification always runs before new work.
# ============================================================
review_json=$(gh issue list --repo "$REPO" --label "agent-review" --state open \
  --json number,title,body --jq 'sort_by(.number) | first // empty' 2>/dev/null || true)

if [ -n "${review_json:-}" ]; then
  iss_num=$(  echo "$review_json" | jq -r '.number')
  iss_title=$(echo "$review_json" | jq -r '.title')
  iss_body=$( echo "$review_json" | jq -r '.body // ""')
  log "VERIFY issue #$iss_num: $iss_title"

  verdict_file="$STATE/verdict.txt"
  rm -f "$verdict_file"

  check_global_budget

  tmp=$(mktemp)
  cat > "$tmp" <<PROMPT
You are karen, the verifier. Audit the repository for the work claimed in GitHub issue #${iss_num}.

Issue title: ${iss_title}
Issue description:
${iss_body}

Instructions:
1. Establish what was CLAIMED — read the issue body, any referenced artifacts, and task files.
2. Establish what ACTUALLY EXISTS — read source files; run build/tests where possible to prove
   function rather than assume it. Use read-only commands only; do NOT edit source.
3. For each item, decide: PASS (works), FAIL (broken/missing — cite exact evidence), or
   OVER-ENGINEERED (exceeds requirement).
4. Write your complete verdict to state/verdict.txt.
   - The VERY FIRST LINE must be exactly the word PASSED or FAILED (nothing else on that line).
   - Leave a blank line, then list bulleted findings (one per item with evidence).
   - End with a "## Gaps to close" section listing any required remediation (FAIL items only).
5. Return a 2–3 line log summary: counts, overall verdict, and the most critical gap.
PROMPT

  karen_ok=true
  run_agent karen "$karen_model" "$tmp" "$karen_max_turns" || karen_ok=false
  record_global_spend
  rm -f "$tmp"

  # Guard: if karen produced no verdict (crash or silent failure), retry verification
  # next tick instead of relabeling back to agent-todo — the worker already finished;
  # only the verifier failed, so bouncing to agent-todo would force a wasteful full
  # worker redo of already-completed work.
  if [ ! -f "$verdict_file" ]; then
    if [ "$(jq -n --argjson c "${LAST_RUN_COST:-0}" '$c == 0')" = "true" ]; then
      # $0 crash = CLI/subscription outage (same pattern as worker outages) —
      # don't post a comment, just retry karen next tick.
      log "  karen crashed at \$0 cost (outage) — retrying verification for #$iss_num next tick, not counted as an attempt"
    elif [ "$karen_ok" = "false" ]; then
      log "  karen run failed (rc non-zero) — retrying verification for #$iss_num next tick"
      gh issue comment "$iss_num" --repo "$REPO" \
        --body "⚠️ **Verifier run failed** (claude exited non-zero). Worker output is unaffected — retrying verification next tick, check \`logs/dispatcher.log\` for the error." \
        >/dev/null 2>&1 || true
    else
      log "  karen did not write verdict.txt — retrying verification for #$iss_num next tick"
      gh issue comment "$iss_num" --repo "$REPO" \
        --body "⚠️ **Verifier did not produce a verdict.** Worker output is unaffected — retrying verification next tick." \
        >/dev/null 2>&1 || true
    fi
    exit 0
  fi

  verdict_text=$(cat "$verdict_file")
  first_word=$(head -1 "$verdict_file" | tr '[:lower:]' '[:upper:]' | tr -d '[:space:]')

  gh issue comment "$iss_num" --repo "$REPO" \
    --body "## Karen's Verdict

\`\`\`
${verdict_text}
\`\`\`" >/dev/null 2>&1 || true

  if [ "$first_word" = "PASSED" ]; then
    if ! commit_verified_issue "$iss_num" "$iss_title"; then
      msg="⚠️ **Verified but not committed.** The worker summary needs a valid \`Changed files: path, path\` manifest, or the commit failed. Keeping this issue in \`agent-review\`."
      gh issue comment "$iss_num" --repo "$REPO" --body "$msg" >/dev/null 2>&1 || true
      log "  issue #$iss_num PASSED but commit gate failed — left in review"
      exit 0
    fi
    set_issue_label "$iss_num" "agent-review" "agent-done" || true
    gh issue close "$iss_num" --repo "$REPO" >/dev/null 2>&1 || true
    rm -f "$STATE/worker_output_${iss_num}.txt"
    log "  issue #$iss_num PASSED — labelled agent-done, closed"
  else
    set_issue_label "$iss_num" "agent-review" "agent-todo" || true
    # Fairness cooldown: escalating penalty for FAILed issues.
    # Increment its cooldown count (or set to 1 if not already cooling).
    # To properly escalate on repeated failures, use the pre-decrement state to check if
    # this issue was already in cooldown before this pass's decrement operation.
    cooldown_file="$STATE/cooldown.json"
    predecrement_file="$STATE/cooldown_predecrement.json"
    # Defensive read: handle both legacy array format and current object format.
    cd_now=$(cat "$cooldown_file" 2>/dev/null | jq -c 'if type=="array" then {} else . end' 2>/dev/null || echo '{}')
    predecrement_state=$(cat "$predecrement_file" 2>/dev/null || echo '{}')

    # Check if issue was in cooldown before decrement (pre-decrement state)
    # If so, increment from that value; otherwise start from 1
    previous_value=$(printf '%s' "$predecrement_state" | jq -r ".[$iss_num|tostring] // 0" 2>/dev/null || echo "0")
    next_value=$(( previous_value + 1 ))
    if [ "$next_value" -gt 5 ]; then next_value=5; fi

    # Increment the cooldown counter for this issue (or set to 1 if not present)
    # Cap at 5 to prevent unbounded growth
    updated_cooldown=$(printf '%s' "$cd_now" | jq --argjson n "$iss_num" --argjson v "$next_value" \
      '.[$n|tostring] = $v')
    printf '%s' "$updated_cooldown" > "$cooldown_file" 2>/dev/null || echo "{\"$iss_num\": 1}" > "$cooldown_file"
    log "  issue #$iss_num FAILED — labelled agent-todo for rework (escalating cooldown: $next_value pass(es))"
  fi
  exit 0
fi

# ============================================================
# RULE 3 — Worker: claim and execute the oldest planned agent-todo issue.
# Untriaged issues (missing <!-- agent-planned -->) are skipped here;
# they are handled by the lead pass above.
# ============================================================
if [ -n "$force_issue" ] && [ "$force_issue" != "next" ]; then
  todo_json=$(gh issue view "$force_issue" --repo "$REPO" \
    --json number,title,body,labels 2>/dev/null || true)
  if [ -z "${todo_json:-}" ]; then
    log "--force-worker: issue #$force_issue not found in $REPO"; exit 1
  fi
  has_label=$(echo "$todo_json" | jq -r '[.labels[].name] | index("agent-todo") != null')
  if [ "$has_label" != "true" ]; then
    log "--force-worker: issue #$force_issue does not have the agent-todo label"; exit 1
  fi
else
  # Fairness: round-robin selection prevents single low-numbered issues from starving higher ones.
  # Optional cooldown on crash adds a brief grace period before retry.
  #
  # Design:
  # - Round-robin: pick next issue after last_picked, wrapping around. Guarantees every
  #   ready issue gets a turn before any issue repeats (core starvation prevention).
  # - cooldown.json: {issue_number: remaining_passes} for issues skipped due to crash
  # - last_picked.json: last issue number picked (for round-robin ordering)
  # - On crash: issue gets cooldown = 1 pass (brief grace period before reselection)
  # - At start of WORK: pre-existing cooldowns are decremented by 1
  # - Stale keys (value <= 0) are cleaned immediately after decrement
  # - Selection: round-robin from last_picked, skip issues with active cooldown (value > 0)
  # - Fallback: if all in cooldown, pick the one with lowest cooldown value (soonest to expire)

  cooldown_file="$STATE/cooldown.json"
  last_picked_file="$STATE/last_picked.json"

  [ -f "$cooldown_file" ] || echo '{}' > "$cooldown_file"
  [ -f "$last_picked_file" ] || echo 'null' > "$last_picked_file"

  # Defensive read: handle both legacy array format and current object format.
  # If the file is an array (legacy), convert to empty object; otherwise use as-is.
  cooldown_map=$(cat "$cooldown_file" 2>/dev/null | jq -c 'if type=="array" then {} else . end' 2>/dev/null || echo '{}')
  last_picked=$(cat "$last_picked_file" 2>/dev/null || echo 'null')

  # Get the set of pre-existing entries before any modifications
  pre_existing=$(printf '%s' "$cooldown_map" | jq -c 'keys')

  todo_all=$(gh issue list --repo "$REPO" --label "agent-todo" --state open \
    --json number,title,body \
    --jq '[.[] | select(.body | (. != null and contains("<!-- agent-planned -->")))] | sort_by(.number)' \
    2>/dev/null || echo '[]')

  # Decrement only pre-existing cooldown counters, then immediately clean up stale entries.
  # New entries (added on crash this pass) are NOT decremented yet; they stay at their set value.
  # Stale entries (value <= 0) are removed to allow issues to regain eligibility.
  updated_cooldown=$(printf '%s' "$cooldown_map" | jq --argjson pre "$pre_existing" \
    'with_entries(
      if (.key as $k | $pre | index($k) != null) then
        .value -= 1
      else
        .value
      end
    ) | map_values(select(. > 0))')

  # Round-robin selection: pick the next issue after last_picked, wrapping around.
  # Skip issues with active cooldown (value > 0 in updated_cooldown).
  # If all issues are in cooldown, pick the one with smallest cooldown value (soonest to expire).

  # Extract all issue numbers
  issue_array=()
  while IFS= read -r num; do
    [ -z "$num" ] && continue
    issue_array+=("$num")
  done < <(printf '%s' "$todo_all" | jq -r '.[].number')

  # Try to find a healthy issue (not in cooldown) starting from next after last_picked
  todo_json=""
  if [ ${#issue_array[@]} -gt 0 ]; then
    # Find starting position
    start_pos=0
    if [ "$last_picked" != "null" ] && [ -n "$last_picked" ]; then
      for i in "${!issue_array[@]}"; do
        if [ "${issue_array[$i]}" = "$last_picked" ]; then
          start_pos=$(( (i + 1) % ${#issue_array[@]} ))
          break
        fi
      done
    fi

    # Try round-robin from start_pos
    found_idx=-1
    for ((offset = 0; offset < ${#issue_array[@]}; offset++)); do
      idx=$(( (start_pos + offset) % ${#issue_array[@]} ))
      num="${issue_array[$idx]}"
      cd_val=$(printf '%s' "$updated_cooldown" | jq -r ".\"$num\" // 0" 2>/dev/null || echo "0")
      if [ "$cd_val" = "0" ] || [ "$cd_val" = "null" ]; then
        found_idx="$idx"
        break
      fi
    done

    # Get the selected number (or fall back to minimum cooldown if all in cooldown)
    if [ "$found_idx" -ge 0 ]; then
      selected_num="${issue_array[$found_idx]}"
    else
      # All in cooldown, pick the one with smallest cooldown value
      selected_num=$(printf '%s' "$updated_cooldown" | jq -r 'to_entries | min_by(.value) | .key')
    fi

    # Get the full todo item
    if [ -n "$selected_num" ]; then
      todo_json=$(printf '%s' "$todo_all" | jq --arg n "$selected_num" '.[] | select(.number == ($n | tonumber))')
    fi
  fi

  # Persist updated (decremented and cleaned) cooldown
  printf '%s' "$updated_cooldown" > "$cooldown_file"

  # If we found an issue, save its number as last_picked for next round-robin iteration
  if [ -n "${todo_json:-}" ]; then
    todo_num=$(echo "$todo_json" | jq -r '.number' 2>/dev/null || echo '')
    if [ -n "$todo_num" ]; then
      echo "$todo_num" > "$last_picked_file"
    fi
  fi
fi

if [ -z "${todo_json:-}" ]; then
  echo "$(TS) nothing to do (no agent-review or planned agent-todo issues open)"; exit 0
fi

iss_num=$(  echo "$todo_json" | jq -r '.number')
iss_title=$(echo "$todo_json" | jq -r '.title')
iss_body=$( echo "$todo_json" | jq -r '.body // ""')
log "WORK issue #$iss_num: $iss_title"

# ---- cycle detection: block issues that have exhausted retry attempts ----
# Count "## Worker Summary" (worker completed) + "⚠️ **Worker" (worker crashed) comments,
# but only those posted AFTER the most recent "⛔ **Blocked" marker comment (if any). A
# plain unbounded count across the issue's entire history means a manual
# agent-blocked -> agent-todo requeue insta-re-blocks on the very next tick with zero new
# attempts dispatched; anchoring to the last block comment lets a requeue earn fresh tries.
attempt_json=$(gh issue view "$iss_num" --repo "$REPO" --json comments \
  --jq '[.comments[] | {body: .body, createdAt: .createdAt}]' 2>/dev/null || echo '[]')
attempt_count=$(printf '%s' "$attempt_json" | jq '
  ( [ .[] | select(.body | startswith("⛔ **Blocked")) | .createdAt ] | sort | last ) as $reset
  | [ .[] | select(.body | startswith("## Worker Summary") or startswith("⚠️ **Worker"))
           | select($reset == null or .createdAt > $reset) ] | length
' 2>/dev/null || echo 0)
if [ "$(jq -n --argjson a "${attempt_count:-0}" --argjson m "$max_worker_attempts" '$a >= $m')" = "true" ]; then
  log "  issue #$iss_num: ${attempt_count} attempt(s) since last reset >= limit ${max_worker_attempts} — blocking"
  set_issue_label "$iss_num" "agent-todo" "agent-blocked" || true
  gh issue comment "$iss_num" --repo "$REPO" \
    --body "⛔ **Blocked after ${attempt_count} failed attempt(s)** (limit: ${max_worker_attempts}).

The lead will review this on its next pass. It may need to be:
- Decomposed into smaller subtasks with clearer acceptance criteria
- Unblocked by completing a dependency first
- Assigned additional context or examples

To retry manually: remove the \`agent-blocked\` label and add \`agent-todo\` — this comment marks the reset point, so attempts start counting fresh from here." \
    >/dev/null 2>&1 || true
  rm -f "$STATE/worker_output_${iss_num}.txt"
  exit 0
fi

# ---- optional escalation: bump to a stronger model after N failed attempts ----
effective_worker_model="$worker_model"
if [ -n "$worker_escalation_model" ] && [ "$(jq -n --argjson a "${attempt_count:-0}" --argjson n "$worker_escalation_after" '$a >= $n')" = "true" ]; then
  effective_worker_model="$worker_escalation_model"
  log "  issue #$iss_num: attempt ${attempt_count} >= escalation threshold ${worker_escalation_after} — using $effective_worker_model instead of $worker_model"
fi

check_global_budget

# Atomic label swap — prevents a concurrent tick from claiming the same issue.
set_issue_label "$iss_num" "agent-todo" "agent-doing" || true

# Per-issue output path — NOT a shared file. The dispatcher only runs one worker at a
# time, but karen may still be retrying verification on an older issue (e.g. crashing
# repeatedly) while a newer issue's worker runs in the meantime. A shared path would let
# that newer worker overwrite the file karen is about to read for the older issue,
# producing a false "wrong output" FAIL unrelated to the older issue's actual code.
output_file="$STATE/worker_output_${iss_num}.txt"
rm -f "$output_file"

# Surface karen's most recent verdict, if this issue already failed verification once —
# otherwise a retry is built from the original issue body only, with zero memory of what
# was already tried or why it was rejected, so it often repeats the same rejected fix.
karen_verdict=$(gh issue view "$iss_num" --repo "$REPO" --json comments \
  --jq '[.comments[] | select(.body | startswith("## Karen"))] | sort_by(.createdAt) | last.body // empty' \
  2>/dev/null || true)

tmp=$(mktemp)
{
cat <<PROMPT
You are a worker on a background agent team. Complete the task described in GitHub issue #${iss_num}.

Title: ${iss_title}

Description:
${iss_body}

Instructions:
1. Read only the files you actually need — do not explore the entire repository.
2. Do the work described. Stay strictly in scope; do not expand requirements.
3. When finished, write a concise technical markdown summary to state/worker_output_${iss_num}.txt.
   Include: what you did, any caveats, and exactly one manifest line formatted
   \`Changed files: path/to/file, path/to/other-file\`. List every changed or created source/test file.
   Keep it under 40 lines — this will be posted as a GitHub issue comment.
4. If the task is ambiguous or blocked, write what you found to state/worker_output_${iss_num}.txt,
   state the blocker clearly, and stop — do not guess or broaden scope.

Your summary will be posted to the issue and then independently verified by karen.
PROMPT
if [ -n "$karen_verdict" ]; then
cat <<VERDICT

## Your previous attempt failed verification

${karen_verdict}

Address every gap listed above before re-submitting — do not repeat the same rejected approach.
VERDICT
fi
} > "$tmp"

if ! run_agent worker "$effective_worker_model" "$tmp"; then
  rm -f "$tmp"
  log "  worker failed — cycling #$iss_num back to agent-todo"
  gh issue comment "$iss_num" --repo "$REPO" \
    --body "⚠️ **Worker run failed** (claude exited non-zero). Cycling back to \`agent-todo\` — check \`logs/dispatcher.log\` for the error." \
    >/dev/null 2>&1 || true
  set_issue_label "$iss_num" "agent-doing" "agent-todo" || true
  # Fairness cooldown: brief grace period before reselecting crashed issues.
  # Set issue to cooldown for 1 pass (gives time for error to stabilize/be investigated).
  # Round-robin selection ensures even with cooldown, all other ready issues get fair turns.
  cooldown_file="$STATE/cooldown.json"
  # Defensive read: handle both legacy array format and current object format.
  cd_now=$(cat "$cooldown_file" 2>/dev/null | jq -c 'if type=="array" then {} else . end' 2>/dev/null || echo '{}')

  # Set cooldown to 1 pass for this issue
  updated_cooldown=$(printf '%s' "$cd_now" | jq --argjson n "$iss_num" \
    '.[$n|tostring] = 1')
  printf '%s' "$updated_cooldown" > "$cooldown_file" 2>/dev/null || echo "{\"$iss_num\": 1}" > "$cooldown_file"
  log "  issue #$iss_num crashed — added to worker-selection cooldown for 1 pass"
  exit 0
fi
record_global_spend
rm -f "$tmp"

if [ -f "$output_file" ]; then
  summary=$(cat "$output_file")
else
  summary="_Worker completed issue #${iss_num} but did not write its output file._"
fi

gh issue comment "$iss_num" --repo "$REPO" \
  --body "## Worker Summary

${summary}" >/dev/null 2>&1 || true

set_issue_label "$iss_num" "agent-doing" "agent-review" || true
log "  issue #$iss_num complete — moved to agent-review"

# keep the activity log bounded
if [ -f "$ACTIVITY" ] && [ "$(wc -l < "$ACTIVITY" | tr -d ' ')" -gt 500 ]; then
  tail -n 500 "$ACTIVITY" > "$ACTIVITY.tmp" && mv "$ACTIVITY.tmp" "$ACTIVITY"
fi
