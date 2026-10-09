#!/usr/bin/env bash
set -euo pipefail

cooldown='{}'
last_picked='null'
issues="100 150 200 250"
n_issues=4

for tick in 1 2 3 4 5 6 7 8 9 10 11 12; do
  pre_existing=$(printf '%s' "$cooldown" | jq -c 'keys')
  pre_decrement_state=$cooldown
  updated=$(printf '%s' "$cooldown" | jq --argjson pre "$pre_existing" 'with_entries(if (.key as $k | $pre | index($k) != null) then .value -= 1 else .value end) | map_values(select(. > 0))')
  cooldown=$updated

  start_pos=0
  if [ "$last_picked" != "null" ]; then
    li=$(echo "$issues" | tr ' ' '\n' | grep -n -x "$last_picked" | cut -d: -f1)
    li=$((li-1))
    start_pos=$(( (li+1) % n_issues ))
  fi

  found=-1
  off=0
  while [ "$off" -lt "$n_issues" ]; do
    idx=$(( (start_pos+off) % n_issues ))
    n=$(echo "$issues" | awk -v i=$((idx+1)) '{print $i}')
    cd=$(printf '%s' "$cooldown" | jq --arg k "$n" -r '.[$k] // 0')
    if [ "$cd" = "0" ]; then
      found=$idx
      break
    fi
    off=$((off+1))
  done

  sel=$(echo "$issues" | awk -v i=$((found+1)) '{print $i}')
  last_picked=$sel
  crashstr=no
  if [ "$sel" = "100" ]; then
    crashstr=YES
    prev=$(printf '%s' "$pre_decrement_state" | jq --arg k "100" -r '.[$k] // 0')
    nextv=$((prev+1))
    if [ "$nextv" -gt 5 ]; then nextv=5; fi
    cooldown=$(printf '%s' "$cooldown" | jq --argjson v "$nextv" --arg k "100" '.[$k]=$v')
  fi
  echo "tick=$tick sel=$sel crash=$crashstr cooldown_after=$cooldown"
done
