#!/usr/bin/env bash
set -euo pipefail
cooldown_file="state/_karen284_cooldown.json"
last_picked_file="state/_karen284_last_picked.json"
ready_set="100 150 200 250"
selections=()

for i in $(seq 1 30); do
  tick=$i
  if [ "$tick" -le 7 ]; then
    crashes="100"
  else
    crashes="100 250"
  fi

  cooldown_map=$(cat "$cooldown_file" | jq -c 'if type=="array" then {} else . end')
  last_picked=$(cat "$last_picked_file")
  pre_existing=$(printf '%s' "$cooldown_map" | jq -c 'keys')
  updated_cooldown=$(printf '%s' "$cooldown_map" | jq -c --argjson pre "$pre_existing" \
    'with_entries(if (.key as $k | $pre | index($k) != null) then .value -= 1 else .value end) | map_values(select(. > 0))')

  issue_array=($ready_set)
  start_idx=0
  if [ "$last_picked" != "null" ] && [ -n "$last_picked" ]; then
    for j in "${!issue_array[@]}"; do
      if [ "${issue_array[$j]}" = "$last_picked" ]; then
        start_idx=$(( (j+1) % ${#issue_array[@]} ))
        break
      fi
    done
  fi

  selected=""
  for ((offset=0; offset<${#issue_array[@]}; offset++)); do
    idx=$(( (start_idx+offset) % ${#issue_array[@]} ))
    num="${issue_array[$idx]}"
    cd_value=$(printf '%s' "$updated_cooldown" | jq -r ".\"$num\" // 0")
    if [ "$cd_value" = "0" ] || [ "$cd_value" = "null" ]; then
      selected="$num"
      break
    fi
  done

  if [ -z "$selected" ]; then
    selected=$(printf '%s' "$updated_cooldown" | jq -r 'to_entries | min_by(.value) | .key')
  fi

  if printf '%s' "$crashes" | grep -q "\\b$selected\\b"; then
    prev=$(printf '%s' "$cooldown_map" | jq -r ".\"$selected\" // 0")
    nextv=$((prev+1))
    if [ "$nextv" -gt 5 ]; then nextv=5; fi
    updated_cooldown=$(printf '%s' "$updated_cooldown" | jq -c --argjson n "$selected" --argjson v "$nextv" '.[$n|tostring] = $v')
  fi

  printf '%s' "$updated_cooldown" > "$cooldown_file"
  echo "$selected" > "$last_picked_file"
  selections+=("$selected")
done

echo "SELECTIONS: ${selections[*]}"
for issue in $ready_set; do
  count=0
  for s in "${selections[@]}"; do
    if [ "$s" = "$issue" ]; then count=$((count+1)); fi
  done
  echo "Issue #$issue selected $count times"
done
