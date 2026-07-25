# Issue #149 — frozen world-view comparison

Both disposable prototypes are available at `/prototype/world-views`. They lazy-load from a
separate production chunk and consume `default-world-t100.json` directly; neither imports the
simulation engine, Zustand, replay, or God Mode.

## Shared interaction

- The 2D navigator, tile inspector, and active Three.js direction share one authoritative `(x, y)`
  selection.
- The navigator supports click/tap and keyboard arrows.
- Both views support orbit, pan/zoom, direct geometry selection, and the same seed/tick label.
- The notable mutation is visible, but the fixture has no event coordinates. The prototype states
  this explicitly rather than inventing a location.
- Desktop and 390×844 mobile browser checks rendered two canvases with no console errors or
  horizontal overflow. Live first-frame build time, draw calls, and triangles are shown in the UI
  because exact costs vary by device.

## Direction A — isometric tile world

Strongest at preserving the authoritative 100×100 coordinate model. Biomes, elevation, organism
locations, hazards, and the selected tile remain spatially comparable to the 2D map. It supports
regional inspection and the observe → inspect → intervene loop with the least mental translation.

Its weakness is scale: all 10,000 cells cannot remain equally detailed. A production direction
would need semantic zoom, regional level-of-detail, and denser organism clustering.

## Direction B — globe

Strongest at making the world feel like a place. Rotation is emotionally appealing and regional
patterns read well on the visible hemisphere.

Its information costs are substantial: the far side is hidden, polar rows compress, selection
precision changes with latitude, and moving between flat `(x, y)` coordinates and a curved surface
adds cognitive work. The fixture also has no wraparound or spherical climate model, so the globe is
presentational rather than ecologically authoritative.

## Recommendation

Choose **isometric as the primary 3D direction**, retaining the compact 2D navigator as the stable
orientation and keyboard-access surface. It better supports inspectable ecology and intervention
consequences while preserving tile identity. Keep the globe as a possible world-overview or
storytelling mode only after event coordinates and spherical world rules exist; do not adopt a
hybrid primary view yet.

## Prototype limits

- This spike intentionally renders all cells and is not production performance architecture.
- Touch was validated at mobile viewport size, but physical-device gesture ergonomics still need a
  later test.
- Event focus cannot move the camera until snapshots carry authoritative event coordinates.
- No simulation behavior or save/snapshot format changed.
