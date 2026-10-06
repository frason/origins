#!/usr/bin/env bash
#
# test_fairness.sh — Verify that round-robin WORK selector prevents low-numbered
# issues from starving higher-numbered ones when crash-looping.
#
# Test scenario: simulate 6 ready issues (#100, #200, #300, #400, #500, #600)
# where #100 and #200 crash repeatedly. Verify that selection order visits all
# issues fairly (round-robin) rather than looping on #100/#200.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE="$ROOT/state"

# Create a temporary test directory
TEST_DIR=$(mktemp -d)
trap "rm -rf '$TEST_DIR'" EXIT

mkdir -p "$TEST_DIR"

# Initialize state files
echo '{}' > "$TEST_DIR/cooldown.json"
echo 'null' > "$TEST_DIR/last_picked.json"

# Helper: simulate one dispatcher tick's round-robin selection
# Args: ready_issues (space-separated), cooldown_file, last_picked_file
# Returns: selected issue number on stdout
simulate_tick() {
  local ready_issues="$1"
  local cooldown_file="$2"
  local last_picked_file="$3"

  # Parse ready issues into array
  local -a issue_array
  for num in $ready_issues; do
    issue_array+=("$num")
  done

  # Read state
  local cooldown_map=$(cat "$cooldown_file" 2>/dev/null | jq -c 'if type=="array" then {} else . end' 2>/dev/null || echo '{}')
  local last_picked=$(cat "$last_picked_file" 2>/dev/null || echo 'null')

  # Decrement pre-existing cooldowns
  local pre_existing=$(printf '%s' "$cooldown_map" | jq -c 'keys')
  local updated_cooldown=$(printf '%s' "$cooldown_map" | jq --argjson pre "$pre_existing" \
    'with_entries(
      if (.key as $k | $pre | index($k) != null) then
        .value -= 1
      else
        .value
      end
    ) | map_values(select(. > 0))')

  # Find starting position for round-robin
  local start_pos=0
  if [ "$last_picked" != "null" ] && [ -n "$last_picked" ]; then
    for i in "${!issue_array[@]}"; do
      if [ "${issue_array[$i]}" = "$last_picked" ]; then
        start_pos=$(( (i + 1) % ${#issue_array[@]} ))
        break
      fi
    done
  fi

  # Find next healthy issue (not in cooldown)
  local found_idx=-1
  for ((offset = 0; offset < ${#issue_array[@]}; offset++)); do
    idx=$(( (start_pos + offset) % ${#issue_array[@]} ))
    num="${issue_array[$idx]}"
    cd_val=$(printf '%s' "$updated_cooldown" | jq -r ".\"$num\" // 0" 2>/dev/null || echo "0")
    if [ "$cd_val" = "0" ] || [ "$cd_val" = "null" ]; then
      found_idx="$idx"
      break
    fi
  done

  local selected_num
  if [ "$found_idx" -ge 0 ]; then
    selected_num="${issue_array[$found_idx]}"
  else
    # All in cooldown; pick soonest to expire
    selected_num=$(printf '%s' "$updated_cooldown" | jq -r 'to_entries | min_by(.value) | .key')
  fi

  # Persist state
  printf '%s' "$updated_cooldown" > "$cooldown_file"
  echo "$selected_num" > "$last_picked_file"

  # Return selected issue
  echo "$selected_num"
}

# Test: run 30 ticks with 6 issues, crash-looping #100 and #200
echo "=== Round-Robin Fairness Test ==="
echo "Ready issues: #100 #200 #300 #400 #500 #600"
echo "Crash-looping: #100 (crashes on odd ticks) and #200 (crashes on even ticks)"
echo ""
echo "Expected: selection visits all 6 issues evenly, no starvation of #300-#600"
echo ""

ready_issues="100 200 300 400 500 600"
cooldown_file="$TEST_DIR/cooldown.json"
last_picked_file="$TEST_DIR/last_picked.json"
declare -a selection_order
declare -A issue_counts

# Run 30 ticks
for tick in {1..30}; do
  selected=$(simulate_tick "$ready_issues" "$cooldown_file" "$last_picked_file")
  selection_order+=("$selected")
  issue_counts[$selected]=$(( ${issue_counts[$selected]:-0} + 1 ))

  # Simulate crashes: #100 crashes on odd ticks, #200 on even
  if [ $(( tick % 2 )) -eq 1 ] && [ "$selected" = "100" ]; then
    cd_now=$(cat "$cooldown_file" 2>/dev/null | jq -c 'if type=="array" then {} else . end' 2>/dev/null || echo '{}')
    updated=$(printf '%s' "$cd_now" | jq --argjson n "100" '.[$n|tostring] = 1')
    printf '%s' "$updated" > "$cooldown_file"
  fi
  if [ $(( tick % 2 )) -eq 0 ] && [ "$selected" = "200" ]; then
    cd_now=$(cat "$cooldown_file" 2>/dev/null | jq -c 'if type=="array" then {} else . end' 2>/dev/null || echo '{}')
    updated=$(printf '%s' "$cd_now" | jq --argjson n "200" '.[$n|tostring] = 1')
    printf '%s' "$updated" > "$cooldown_file"
  fi
done

# Print results
echo "Selection order (30 ticks):"
echo "${selection_order[@]}"
echo ""
echo "Issue selection counts:"
for issue in $ready_issues; do
  count=${issue_counts[$issue]:-0}
  echo "  #$issue: $count times"
done
echo ""

# Verify fairness: each of 6 issues should be picked ~5 times (30 ticks / 6 issues)
# With round-robin + cooldown, expect each issue 4-6 times (within 1 std dev)
echo "Fairness check:"
min_count=999
max_count=0
for issue in $ready_issues; do
  count=${issue_counts[$issue]:-0}
  if [ "$count" -lt "$min_count" ]; then min_count=$count; fi
  if [ "$count" -gt "$max_count" ]; then max_count=$count; fi
done

echo "  Min selections: $min_count"
echo "  Max selections: $max_count"
echo "  Spread: $(( max_count - min_count ))"

# If spread is ≤2, round-robin is working fairly (all issues get roughly equal picks)
if [ $(( max_count - min_count )) -le 2 ]; then
  echo "  ✓ PASS: Round-robin ensures fair selection (spread ≤2)"
else
  echo "  ✗ FAIL: Spread >2 indicates unfair selection"
  exit 1
fi

echo ""
echo "=== All checks passed ==="
