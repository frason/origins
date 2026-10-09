#!/bin/bash
set -e
cd /Users/frason/Developer/origins-cron/state
rm -f _karen_cooldown_test.json
echo '{}' > _karen_cooldown_test.json

for i in $(seq 1 10); do
  cooldown_map=$(cat _karen_cooldown_test.json)
  pre_existing=$(printf '%s' "$cooldown_map" | jq -c 'keys')
  updated_cooldown=$(printf '%s' "$cooldown_map" | jq --argjson pre "$pre_existing" \
    'with_entries(if (.key as $k | $pre | index($k) != null) then .value -= 1 else .value end)')
  todo_all='[100,150,200,250]'
  picked=$(printf '%s' "$todo_all" | jq --argjson cd "$cooldown_map" '(map(select((.|tostring) as $n | ($cd|has($n)) | not)) | first) // (first) // empty')
  printf '%s' "$updated_cooldown" > _karen_cooldown_test.json
  echo "pass$i: cooldown_before=$cooldown_map picked=$picked cooldown_after=$updated_cooldown"
  if [ "$picked" = "100" ]; then
    prev=$(printf '%s' "$cooldown_map" | jq -r '.["100"] // 0')
    next=$((prev+1))
    cd_now=$(cat _karen_cooldown_test.json)
    new=$(printf '%s' "$cd_now" | jq --argjson v "$next" '.["100"]=$v')
    printf '%s' "$new" > _karen_cooldown_test.json
    echo "   #100 crashed -> cooldown now $new"
  fi
done
