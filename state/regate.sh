#!/bin/bash
set -e
cd /Users/frason/Developer/origins-cron
REPO="frason/origins"
NOTE=$(cat state/regate_note.txt)
for n in 116 119 160 161 162 163 164 165 166 167 168 169 170 171 172 173 174 175 176 177 178 179 180 200 223; do
  body=$(gh issue view "$n" --repo "$REPO" --json body --jq '.body' 2>/dev/null)
  if [ -z "$body" ]; then
    echo "SKIP $n: could not fetch body"
    continue
  fi
  newbody="${body}${NOTE}"
  gh issue edit "$n" --repo "$REPO" --body "$newbody" \
    --remove-label "agent-todo" --add-label "agent-backlog" >/dev/null 2>&1 \
    && echo "regated #$n" || echo "FAILED #$n"
done
