# Frozen prototype fixture

`default-world-t100.json` is generated from default world seed `12345` at tick `100` by
`scripts/generate-prototype-snapshot.ts`. It is a renderer-neutral, read-only visual fixture:
terrain, producer biomass, toxicity, creatures, and the most recent bounded event sample.

It is not a save format, does not drive Zustand or the simulation loop, and intentionally has no
camera, interaction, or Three.js dependency. Regenerate it after deliberate authoritative world
changes with `npx vite-node scripts/generate-prototype-snapshot.ts`.
