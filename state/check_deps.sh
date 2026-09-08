#!/bin/bash
for n in 277 275 274 271 270 268 267 266 265 264 163 161 160 159 158 157 156 155 126 125 124 123 122 121 120; do
  body=$(gh issue view "$n" --repo frason/origins --json body --jq '.body' 2>/dev/null)
  dep=$(printf '%s' "$body" | grep -i "depends_on" | head -1)
  printf '#%s: %s\n' "$n" "$dep"
done
