#!/bin/bash
for n in 116 118 119 155 156 157 158 159 160 161 162 163 164 165 166 167 168 169 170 171 172 173 174 175 176 177 178 179 180 200 223; do
  b=$(gh issue view "$n" --repo frason/origins --json body --jq '.body')
  if printf '%s' "$b" | grep -q "depends_on:"; then
    line=$(printf '%s' "$b" | grep "depends_on:")
    printf '%s HAS: %s\n' "$n" "$line"
  else
    printf '%s MISSING\n' "$n"
  fi
done
