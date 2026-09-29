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
#   3. WORKER run — oldest agent-todo issue (skips untriaged issues)
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
        # Unpushed commits exist — push them.
        git push origin HEAD || return 1
      else
        # No staged changes and no unpushed commits — fail.
        return 1
      fi
    else
      # Staged changes exist — commit and push as normal.
      git commit -m "chore(issue): ${title} (closes #${number})" || return 1
      git push origin HEAD
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
          # Unpushed commits exist — push them.
          git push origin HEAD || return 1
        else
          # No staged changes and no unpushed commits — fail.
          return 1
        fi
      else
        # Staged changes exist — commit and push as normal.
        git commit -m "chore(issue): ${title} (closes #${number})" || return 1
        git push origin HEAD
      fi
    else
      # No changes from either path — check for unpushed commits as last resort
      base_branch=$(git rev-parse --abbrev-ref HEAD)
      if [ -n "$(git rev-list -n1 "origin/${base_branch}..HEAD" 2>/dev/null)" ]; then
        # Local commits exist but are not on origin — push them.
        git push origin HEAD || return 1
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

echo "syntax check placeholder end"
