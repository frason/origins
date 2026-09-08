#!/bin/bash
for n in 274 275 277 271 270 268 267 266 265 264 163 161 160 159 158 157 156 155 126 125 124 123 122 121 120; do
  echo "=== $n ==="
  gh issue view "$n" --repo frason/origins --json body -q '.body' | head -3
  echo ""
done
