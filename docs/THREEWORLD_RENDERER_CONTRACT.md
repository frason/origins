# Three.js Living World Renderer Contract

**Status:** Production Contract (Issue #162)  
**Owner:** @frason  
**Created:** 2026-08-26  
**Depends on:** #148 (renderer-neutral snapshots), #149 (visual comparison)

---

## Executive Summary

This document locks the production contract for the Three.js Living World renderer. It formalizes the relationship between the simulation engine and the 3D visualization layer, ensuring clear data ownership, coordinate mapping rules, and interaction patterns.

**Key decisions:**
- **Isometric view** is the primary playable 3D interface
- **Globe view** is an overview + storytelling view (not a main control surface)
- **Renderer is read-only** to simulation state; all mutations originate in the engine
- **Selection and navigation** synchronize bidirectionally between Three.js and Canvas 2D
- **Semantic zoom** operates deterministically within well-defined zoom levels

---

## 1. Renderer Architecture

### 1.1 Rendering Modes

The renderer implements two complementary camera modes:

#### Isometric (Primary Playable View)
- **Purpose:** Primary player interaction surface
- **Camera setup:**
  - Position: (78, 72, 78) in world space; Euclidean distance ≈ 131.7 units
  - Target: (0, 0, 0) with up vector (0, 1, 0)
  - FOV: 42° perspective, 0.1–500 near/far clip
  - Controls: OrbitControls with minDistance 20, maxDistance 180 (world units)
  - Damping: 0.05 damping factor (respects reduced-motion preference)
  - Screen-space panning enabled for intuitive multi-touch on mobile
- **Viewport:** Cells rendered as unit cubes with height scaling via elevation field
- **Interaction:** Click-to-select cells, OrbitControls for camera panning/rotation
- **Coordinates:** World grid (0,0) at center; cells positioned at `[x - width/2, height, y - height/2]` in world space
- **Initial zoom:** Distance 131.7 → 'world' zoom level (shows entire 100×100 grid + margins)

#### Globe (Overview + Storytelling)
- **Purpose:** Planetary overview, narrative framing, environmental storytelling
- **Camera setup:**
  - Position: (0, 8, 31) in world space; Euclidean distance ≈ 31.3 units
  - Target: (0, 0, 0) with up vector (0, 1, 0)
  - FOV: 42° perspective, 0.1–500 near/far clip
  - Controls: OrbitControls with minDistance 18, maxDistance 75 (world units)
  - Damping: 0.05 damping factor
  - Screen-space panning disabled (maintains global orientation)
- **Viewport:** Cells rendered as flat quadrilaterals on sphere surface (radius 12 units)
- **Interaction:** Click to select; camera rotates around sphere
- **Coordinates:** Spherical with UV wrapping; longitude and latitude derived from cell x/y position
- **Z-order:** Elevation applied as radial distance offset (~0.45 units per elevation point)
- **Initial zoom:** Distance 31.3 → 'habitat' zoom level (shows planet with focused detail)

**Key constraint:** Globe is read-only for gameplay purposes. Players may switch to globe to observe trends, but cannot execute interventions or manage gameplay while in globe view.

### 1.2 Canvas 2D Fallback

**Purpose:** Accessibility + graceful degradation when WebGL is unavailable  
**Coordinate system:** Orthographic grid projection (direct cell-to-pixel mapping)  
**Rendering:** Same overlay system as WebGL; same keyboard navigation  
**Sync:** Maintains identical selection state as WebGL view  
**Fallback trigger:** WebGL context loss or explicit `useFallbackRender` prop

---

## 2. Data Contract: What the Renderer May Consume

### 2.1 Permitted Simulation State (Read-Only)

The renderer **consumes only immutable snapshots**; it never modifies engine state directly.

**Permitted inputs from `PrototypeWorldSnapshot`:**

```typescript
// World grid state
snapshot.world: {
  width: number;
  height: number;
  seed: number;  // For deterministic rendering consistency
  cells: PrototypeCell[];
}

// Individual cell data (per grid cell)
PrototypeCell: {
  x: number;
  y: number;
  elevation: number;          // Terrain height (0–1 range, scales visually)
  biome: string;              // Visual category (ocean, desert, etc.)
  producerBiomass: number;    // Overlay: primary productivity
  energy: number;             // Overlay: available nutrients
  toxicity: number;           // Overlay: environmental contamination
}

// Living organism state
snapshot.creatures: PrototypeCreature[]

// Creature data visible to renderer
PrototypeCreature: {
  id: string;
  x: number;
  y: number;
  lifecycleState: 'alive' | 'corpse';
  strategy: 'herbivore' | 'carnivore' | 'omnivore' | 'scavenger' | 'unknown';
  lineageId: string;
  age: number;
}
```

### 2.2 Prohibited Renderer State

The renderer **must not own, compute, or persist:**

- ❌ Creature mutations or genetic drift
- ❌ Energy transfers between organisms
- ❌ Reproduction decisions or offspring creation
- ❌ Death events or lifespan calculations
- ❌ Pathfinding or movement logic
- ❌ Toxicity diffusion or decomposition rates
- ❌ Producer biomass growth or nutrient cycling
- ❌ Selection-triggered interventions (e.g., "selecting a creature to breed")

**Rationale:** All causal game systems originate in the engine (`src/simulation/`). The renderer is a view layer, not a control layer. UI actions (clicks) flow to the engine; the engine triggers state changes; new snapshots flow back to the renderer.

### 2.3 Determinism Contract

- **Same seed + same zoom level = identical clustering, glyph assignment, and visual layout**
- Semantic zoom uses cluster grid position (deterministic binning) derived from creature positions
- Glyph shapes and colors depend only on cluster properties, not render order or frame timing
- No random number generation in the renderer; all RNG stays in the engine

---

## 3. Information Architecture: Screen Layout and Interaction Model

### 3.1 Primary Playable View (Isometric)

```
┌─────────────────────────────────────────────────────────┐
│  Origin: Three.js Living World — Isometric View          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│                   [ISOMETRIC CANVAS]                    │
│                   (Three.js WebGL)                      │
│                                                          │
│  • Cells: unit cube grid with elevation height          │
│  • Creatures: colored spheres/capsules by strategy      │
│  • Selection: yellow ring marker (rotated -π/2)         │
│  • Overlays: biomass, toxicity, habitat, lineage       │
│  • Camera: fixed isometric angle, OrbitControls         │
│  • Zoom levels: world → region → habitat → local        │
│                                                          │
│  [Legend]    [Camera Control]    [Performance Info]    │
└─────────────────────────────────────────────────────────┘
```

**Visible at all times:**
- Terrain (cells with biome colors)
- Producer biomass (green overlay, 0–32% intensity)
- Toxicity spikes (red-to-purple overlay, presence indicator)
- Selection marker (yellow ring on currently selected cell)
- Creatures: aggregated into density glyphs or individual renders (zoom-dependent)

**Overlays (togglable):**
- `biomass`: Producer biomass visualization
- `energy`: Available nutrient concentration
- `toxicity`: Contamination hotspots
- `corpse`: Deceased organism markers
- `habitat`: Biome suitability tinting
- `mutation-pressure`: Corpse-driven mutation risk (miasma field)
- `lineage`: Highlight creatures in selected lineage

### 3.2 Secondary Overview View (Globe)

```
┌─────────────────────────────────────────────────────────┐
│  Origin: Three.js Living World — Globe View             │
├─────────────────────────────────────────────────────────┤
│                                                          │
│                    [GLOBE CANVAS]                       │
│                   (Three.js WebGL)                      │
│                                                          │
│  • Cells: flat quads on sphere surface                  │
│  • Creatures: aggregated into region-scale glyphs       │
│  • Selection: marker on selected cell (spherical coords)│
│  • Camera: centered, rotatable, non-panning             │
│  • Purpose: observe global patterns, not control        │
│                                                          │
│  [Legend]    [Camera Control]    [Performance Info]    │
└─────────────────────────────────────────────────────────┘
```

**Interaction notes:**
- Selection works (click cell to sync to isometric view)
- Cannot execute interventions from globe
- Provides narrative/environmental context
- Shows ecosystem collapse patterns at planetary scale

### 3.3 Fallback 2D Canvas

```
┌─────────────────────────────────────────────────────────┐
│  Canvas 2D Fallback (WebGL Unavailable)                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  [Orthographic grid, same overlays as Three.js]         │
│  Same keybindings, same selection sync                  │
│  Performance: O(n) cells + O(n) creatures, no instancing│
│                                                          │
│  [Legend]    [Zoom controls]    [Performance Info]      │
└─────────────────────────────────────────────────────────┘
```

**Fallback triggers:**
- WebGL context loss event (`webglcontextlost`)
- WebGL not supported (feature detection)
- Explicit `useFallbackRender` prop (for testing/debugging)

**Same contract applies:** Fallback sees identical snapshot data; all mutations originate in engine.

---

## 4. Semantic Zoom Levels and Visual Hierarchy

### 4.1 Zoom Level Definitions

**Thresholds:** Zoom levels are determined **purely by camera distance** in Three.js world units, independent of viewport pixel size. This ensures deterministic, reproducible behavior across all screen sizes and pixel densities.

**Implementation:** `getZoomLevel(worldWidth, worldHeight, cameraDistance)` in `src/prototype/semanticZoom.ts` (lines 33–46).

| Zoom Level | Camera Distance | Rendering Strategy | Use Case |
|------------|-----------------|-------------------|----------|
| **world** | > 120 units | Density glyphs only; creatures aggregated by cluster | Observe global patterns, ecosystem-wide trends |
| **region** | 60–120 units | Mix of glyphs (dense) + individual creatures (sparse) | Pan across biomes, find population centers |
| **habitat** | 30–60 units | Individual creatures rendered; sparse glyphs as organisms | Monitor specific populations, watch predator/prey interactions |
| **local** | < 30 units | 100% individual rendering with full detail | Examine lineage, trace genealogy |

**Verification:** These thresholds are production-validated against actual OrbitControls constraints:
- **Isometric:** OrbitControls configured with `minDistance: 20, maxDistance: 180` (ThreeWorldView.tsx:224–225)
  - Distance 20 → 'local' zoom ✓
  - Distance ≈ 131.7 (initial position) → 'world' zoom ✓
  - Distance 180 → 'world' zoom ✓
- **Globe:** OrbitControls configured with `minDistance: 18, maxDistance: 75` (ThreeWorldView.tsx:224–225)
  - Distance 18 → 'local' zoom ✓
  - Distance ≈ 31.3 (initial position) → 'habitat' zoom ✓
  - Distance 75 → 'region' zoom ✓

**Camera distance calculation:** Computed as Euclidean distance from camera position to world origin: `camera.position.length()`. For isometric initial position (78, 72, 78), distance ≈ 131.7 units. For globe initial position (0, 8, 31), distance ≈ 31.3 units.

**Distance examples (100×100 grid with 42° FOV):**
```
Distance  Zoom Level  Mode        Context
─────────────────────────────────────────────────────────────────────
180       world       isometric   Maximum zoom-out (isometric max)
131.7     world       isometric   Initial playable position
120       region      isometric   Boundary: world→region transition
100       region      isometric   Mid-range exploration
75        region      globe       Maximum zoom-out (globe max)
60        habitat     both        Boundary: region→habitat transition
45        habitat     both        Focused neighborhood
31.3      habitat     globe       Initial globe position
30        local       both        Boundary: habitat→local transition
20        local       isometric   Maximum zoom-in (isometric min)
18        local       globe       Maximum zoom-in (globe min)
```

**Rationale:** Distance-only thresholds ensure determinism across all viewport sizes and aspect ratios. The FOV (42°) and aspect ratio interact with viewing frustum size, but the zoom tier assignment depends solely on distance magnitude to eliminate pixel-size variation and guarantee reproducible simulation behavior across all displays.

### 4.2 Density Glyph Assignment Rules

When in world/region zoom, creatures aggregate into **density glyphs**. Assignment is deterministic:

**Cluster grid:** Divide world into regions (region size depends on zoom)
- World zoom: 25 cells/region → 4×4 regions for 100×100 grid
- Region zoom: 6 cells/region → variable regions
- Habitat zoom: 2 cells/region → 50×50 regions
- Local zoom: 1 cell/region → no clustering

**Glyph properties computed per cluster:**
- `density`: creatures / region area
- `dominantStrategy`: most common feeding strategy
- `creatureCount`: total organisms in cluster
- `diversity`: number of distinct strategies present

**Glyph shape mapping (deterministic):**
```
density < 0.2         → sparse (3 small spheres)
0.2 ≤ density < 0.5   → pyramid (tetrahedron)
0.5 ≤ density < 0.8   → cube (box)
density ≥ 0.8         → sphere (tight packing)
diversity ≥ 3 AND     → torus (mixed ecosystem)
  density > 0.6
```

**Color by dominant strategy:**
- Herbivore: 0xffdc73 (yellow)
- Carnivore: 0xe8664a (red)
- Omnivore: 0x6bb8d8 (cyan)
- Scavenger: 0xb58ad6 (purple)
- Unknown: 0xfff0b5 (pale yellow)

**Size scaling:**
- Base size: determined by glyph shape
- Scaled by: `density + log(creatureCount)`
- Max size: constrained to region area

### 4.3 Zoom Transitions

**Trigger:** Click on density glyph or use keyboard shortcuts  
**Animation:** `easeInOutCubic` over ~800ms  
**Preserves:** Spatial context (relative viewpoint maintained)  
**Example flow:**
1. User clicks cluster in world view
2. Camera animates to region center
3. Distance transitions from world (78 units) to region (30 units)
4. On arrival, glyphs are recalculated; creatures below density threshold render individually

---

## 5. Selection and Navigation Synchronization

### 5.1 Selection Sync Between Three.js and 2D

**Selection state structure:**
```typescript
SelectedLocation: {
  x: number;          // Grid X (0 to world.width - 1)
  y: number;          // Grid Y (0 to world.height - 1)
}
```

**Sync rules:**
1. Isometric click → Updates `SelectedLocation` → 2D canvas re-renders marker at same (x, y)
2. Globe click → Updates `SelectedLocation` via spherical coords → 2D canvas updates
3. 2D canvas click → Updates `SelectedLocation` → Three.js camera focuses (with smooth transition)
4. Keyboard navigation (arrow keys) → Updates `SelectedLocation` → Both views re-render

**Bidirectional props flow:**
```typescript
// Parent component holds selected state
const [selected, setSelected] = useState({ x: 50, y: 50 });

// Both renderers receive and update the same state
<ThreeWorldView selected={selected} onSelect={setSelected} />
<Canvas2DFallback selected={selected} onSelect={setSelected} />
```

**Mobile/Touch:** Tap a cell to select; two-finger pan/pinch for camera control (handled by OrbitControls)

### 5.2 Lineage Focus Sync

**Focus state structure:**
```typescript
FocusState: {
  zoom: ZoomLevel;
  lineageId?: string;           // When focusing a specific family line
  regionMinX?: number;          // When focusing a rectangular region
  regionMaxX?: number;
  regionMinY?: number;
  regionMaxY?: number;
}
```

**Sync:** Focus state flows to both renderers; they independently compute visible creatures from same snapshot.

**Example:** Player selects a creature → UI identifies its lineage → `focusLineage('lineage-42')` triggers zoom to habitat level with all creatures in lineage highlighted.

### 5.3 Fallback Behavior

**When WebGL context is lost:**
1. `ThreeWorldView` detects `webglcontextlost` event
2. Triggers `onFallback(true)` callback
3. Parent component switches to `Canvas2DFallback` with identical `selected` and `onSelect` props
4. Selection state, overlays, and focus remain synchronized
5. On `webglcontextrestored`, can switch back to Three.js

**Data consistency:** Fallback sees same snapshot; same overlays render; same selection applies.

---

## 6. Coordinate Mapping and Projection Geometry

### 6.1 Grid Coordinate System

**Origin:** World center at (width/2, height/2) in isometric space

**Cell indexing:**
```typescript
// Given cell position (x, y):
// Storage: world.cells[y * width + x]
// Isometric position: [x - width/2, height, y - height/2]
```

**Elevation scaling:**
```typescript
// cell.elevation is normalized (0–1)
// Visual height in scene = 0.15 + cell.elevation * 2.4
// Range: 0.15 (sea level) to 2.55 (peak)
```

### 6.2 Isometric Projection

**Camera:** Orthogonal fixed angle
**Position:** (78, 72, 78) in world space  
**Target:** (0, 0, 0)  
**Up vector:** (0, 1, 0)  
**FOV:** 42° (perspective camera)

**Cell rendering:**
- Geometry: BoxGeometry(0.94, height, 0.94)
- Position: `[x - width/2, height/2, y - height/2]`
- Rotation: none (axis-aligned)

**Visual result:** Isometric 3/4 view; cells appear as vertical blocks; elevation creates visible height variation.

### 6.3 Globe Projection

**Camera:** Centered on origin  
**Position:** (0, 8, 31) for initial view (rotatable via OrbitControls)  
**Target:** (0, 0, 0)  
**Radius:** 12 (inner sphere) + elevation offset

**Spherical coordinates:**
```typescript
longitude = (x + 0.5) / width * 2π - π     // Range: [-π, π]
latitude = π/2 - (y + 0.5) / height * π    // Range: [-π/2, π/2]

position = [
  radius * cos(latitude) * sin(longitude),
  radius * sin(latitude),
  radius * cos(latitude) * cos(longitude)
]

// Elevation applied as radial distance: radius += cell.elevation * 0.45
```

**Visual result:** Cells wrap around sphere; poles compress by latitude; edges wrap seamlessly.

### 6.4 Canvas 2D Fallback Projection

**Coordinate system:** Orthographic 1:1 grid mapping

```typescript
// Canvas pixel to world grid:
normalizedX = (clientX - canvasBounds.left) / canvasBounds.width
normalizedY = (clientY - canvasBounds.top) / canvasBounds.height
gridX = floor(normalizedX * worldWidth)
gridY = floor(normalizedY * worldHeight)
```

**Rendering:** Simple cell grid with overlays, no perspective transformation.

---

## 7. Interaction Targets and Raycasting

### 7.1 Click Detection (Three.js)

**Raycaster setup:**
```typescript
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// On click:
mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
raycaster.setFromCamera(mouse, camera);
```

**Intersection targets (in order of check):**
1. **Density glyphs** (if zoom > local): cluster metadata in `mesh.userData`
2. **Individual creatures** (if visible): creature ID in `mesh.userData`
3. **Cell meshes** (InstancedMesh): compute instance index from intersected face
4. **Fallback:** If no hit, ignore or show "no selection"

**Selection behavior:**
- Click glyph → Zoom to region containing cluster
- Click creature → Select tile + highlight lineage (if in lineage overlay mode)
- Click cell → Select that tile

### 7.2 Mobile/Touch Interaction

**Single tap:** Select cell (same as click)  
**Two-finger drag:** Pan camera (OrbitControls screen-space panning)  
**Pinch:** Zoom camera in/out (OrbitControls mouse wheel analog)  
**Long press:** Reserved for future context menus

**Accessibility:** All touch gestures are duplicated by keyboard shortcuts (arrow keys, Home, End, R for reset).

---

## 8. Performance Targets and Constraints

### 8.1 Performance Budgets

| Metric | Target | Notes |
|--------|--------|-------|
| Frame time | ≤ 16ms @ 60fps | Monitor via `PerformanceMonitor` |
| Creature count | 1000+ | Isometric at world zoom |
| Glyph rendering | O(grid²) | Deterministic clustering |
| Overlay computation | < 5ms | Cached between ticks |
| Build time | < 500ms | Initial scene setup + snapshot load |

### 8.2 Optimization Techniques

- **InstancedMesh:** All cells use instanced geometry (1 mesh, 10k instances)
- **Density glyphs:** Aggregate creatures into visual clusters; render ~100 glyphs instead of 1000 creatures
- **Lazy overlay computation:** Overlays recomputed only when snapshot changes or overlay set changes
- **Fallback pixel ratio:** Capped at 1.5× device pixel ratio to maintain 60fps on mobile
- **Reduced motion:** Respect `prefers-reduced-motion` media query; disable damping if set

### 8.3 Context Loss Recovery

**On `webglcontextlost`:**
1. Cancel in-flight animation frames
2. Dispose all Three.js resources (materials, geometries, textures)
3. Clear scene
4. Trigger fallback render
5. Log event to performance monitor

**On `webglcontextrestored`:**
1. Recreate WebGL resources
2. Rebuild scene from snapshot
3. Restore camera position, selection state
4. Resume normal rendering
5. Log recovery time

---

## 9. Accessibility and Fallback Behavior

### 9.1 Keyboard Navigation

| Key | Action | Works in |
|-----|--------|----------|
| Arrow Up | Move selection up 5 tiles | Both views |
| Arrow Down | Move selection down 5 tiles | Both views |
| Arrow Left | Move selection left 5 tiles | Both views |
| Arrow Right | Move selection right 5 tiles | Both views |
| Home | Jump to (0, 0) | Both views |
| End | Jump to (width-1, height-1) | Both views |
| R | Reset focus to world view | Three.js only |
| Escape | Defocus canvas | Both views |

**Rationale:** Keyboard-only users can navigate and select without mouse/touch.

### 9.2 Motion Preferences

**Detection:** `window.matchMedia('(prefers-reduced-motion: reduce)')`

**Effect:**
- Disable camera damping (instant focus)
- Disable smooth zoom transitions (snap to target)
- Disable any particle/bloom effects (future)
- Keep UI animations minimal

### 9.3 WebGL Unavailability Scenarios

**Scenario:** User's browser doesn't support WebGL

**Behavior:**
1. Render detection before mount
2. Fall back to Canvas 2D automatically
3. Display feature parity notice (if user tries to switch)
4. All functionality works in 2D (slower, less visual polish)

**Scenario:** WebGL context is lost mid-session

**Behavior:**
1. Catch `webglcontextlost` event
2. Pause rendering
3. Switch to fallback
4. Auto-recover when `webglcontextrestored` fires
5. No data loss; selection and focus preserved

---

## 10. Mobile-Specific Behavior

### 10.1 Screen Size Adaptation

| Screen Size | Behavior |
|-------------|----------|
| < 480px width | Portrait orientation; single-tap for selection; two-finger drag for pan |
| 480–800px | Portrait or landscape; same controls |
| > 800px | Landscape; optional split-view with 2D fallback side-by-side (future) |

**Pixel ratio capping:** Clamp `devicePixelRatio` to ≤ 1.5 to maintain 60fps on high-DPI screens.

### 10.2 Touch Event Handling

**Handled by OrbitControls:**
- Single touch: camera rotation (mimics mouse drag)
- Two-finger: zoom (pinch), pan (if screen-space panning enabled)

**Custom handlers (ThreeWorldView):**
- Tap detection for cell selection
- Long-press (reserved for future context menus)

### 10.3 Orientation Changes

**On `orientationchange`:**
1. Update canvas size (via ResizeObserver)
2. Update camera aspect ratio
3. Recalculate raycaster coordinates
4. Preserve selection state and focus

---

## 11. Testing and Validation

### 11.1 Determinism Tests

**Fixture:** Snapshot + seed  
**Assertion:** Rendering output is identical across:
- Browser reloads (same seed)
- Zoom level sequences (A → B → A produces same visuals)
- Overlay toggle sequences

**Example:**
```typescript
test('semantic zoom is deterministic', () => {
  const snapshot = loadSnapshot('test-seed-12345');
  const cluster1 = clusterCreaturesByZoom(snapshot, 'world');
  const cluster2 = clusterCreaturesByZoom(snapshot, 'world');
  expect(cluster1).toEqual(cluster2); // Identical clustering
});
```

### 11.2 Sync Tests

**Fixture:** Isometric + 2D canvas rendering same snapshot

**Assertions:**
- Selection click in Three.js updates 2D canvas marker
- Selection click in Canvas updates Three.js marker
- Keyboard navigation updates both synchronously
- Lineage focus highlights identical creatures in both views

### 11.3 Coordinate Mapping Tests

**Fixture:** Grid cell positions

**Assertions:**
- `isometricPosition(cellAt(snapshot, x, y))` produces expected 3D position
- `globePosition(cellAt(...))` wraps correctly at edges
- Raycasting a cell at (x, y) identifies correct grid coordinates

### 11.4 Performance Tests

**Fixture:** 1000+ creatures in snapshot

**Assertions:**
- World zoom render time < 16ms
- Glyph computation time < 5ms
- No frame drops on mobile (Pixel 4 baseline)

### 11.5 Fallback Tests

**Fixture:** Force Canvas 2D with `useFallbackRender={true}`

**Assertions:**
- All overlays render correctly
- Selection and keyboard nav work identically
- Performance is acceptable (30+ fps on low-end devices)

---

## 12. Data Ownership Matrix

| Component | Can Read | Can Write | Notes |
|-----------|----------|-----------|-------|
| **Engine** | World + creatures | ✅ Mutations, energy, reproduction | Source of truth |
| **Renderer (Three.js)** | Snapshot | ❌ Read-only | Visualization layer |
| **Renderer (Canvas 2D)** | Snapshot | ❌ Read-only | Fallback visualization |
| **Selection state** | Both | ✅ Parent component | Owned by app root |
| **Focus state** | Both | ✅ Parent component | Zoom/lineage tracking |
| **Overlay toggles** | Both | ✅ Parent component | UI preferences |

---

## 13. Migration from Legacy Render

**If upgrading from previous renderer:**

1. **Coordinate mapping:** Verify isometric/globe position functions map old grid → new grid identically
2. **Selection sync:** Ensure old 2D view and new Three.js view receive same `SelectedLocation` callbacks
3. **Snapshot structure:** Three.js expects `PrototypeWorldSnapshot`; adapt if previous format differs
4. **Overlay system:** Migrate overlay keys (if different) to align with `ThreeWorldLegend.OverlayKey` enum

---

## 14. Future Extensions (Post-Release)

**Out of scope for V1 but planned for later:**

- **Heatmaps:** Overlay ecosystem metrics (biodiversity, energy flow) as gradient
- **Lineage tree 3D:** Render genealogical graph as interactive 3D structure
- **Time-lapse:** Play forward/backward through world history with semantic zoom
- **VR mode:** WebXR support for immersive ecosystem viewing
- **Creature detail panel:** 3D model viewer for genetic traits (separate from world)
- **Species-specific glyphs:** Different glyph shapes for herbivore vs. carnivore clusters

---

## 15. Appendix: Type Definitions

### PrototypeWorldSnapshot
```typescript
interface PrototypeWorldSnapshot {
  seed: number;
  tick: number;
  world: {
    width: number;
    height: number;
    cells: PrototypeCell[];
  };
  creatures: PrototypeCreature[];
}

interface PrototypeCell {
  x: number;
  y: number;
  elevation: number;        // 0–1 normalized
  biome: string;            // 'ocean' | 'desert' | 'grassland' | 'forest' | 'wetland' | 'tundra' | 'mountain'
  producerBiomass: number;
  energy: number;
  toxicity: number;
}

interface PrototypeCreature {
  id: string;
  x: number;
  y: number;
  lifecycleState: 'alive' | 'corpse';
  strategy: 'herbivore' | 'carnivore' | 'omnivore' | 'scavenger' | 'unknown';
  lineageId: string;
  age: number;
  energy: number;           // Optional; used for visualization in future
}
```

### FocusState
```typescript
interface FocusState {
  zoom: 'world' | 'region' | 'habitat' | 'local';
  lineageId?: string;
  regionMinX?: number;
  regionMaxX?: number;
  regionMinY?: number;
  regionMaxY?: number;
}
```

### ThreeWorldViewProps
```typescript
interface ThreeWorldViewProps {
  direction: 'isometric' | 'globe';
  snapshot: PrototypeWorldSnapshot;
  selected: SelectedLocation;
  onSelect: (location: SelectedLocation) => void;
  onMetrics?: (direction, metrics) => void;
  focusNonce?: number;           // Trigger re-zoom
  activeOverlays?: Set<OverlayKey>;
  onOverlayToggle?: (key: OverlayKey) => void;
  useFallbackRender?: boolean;
  onFallback?: (enabled: boolean) => void;
}
```

---

## 16. References

- **Semantic Zoom Implementation:** `artifacts/semantic_zoom_implementation.md`
- **Three.js Renderer:** `src/prototype/ThreeWorldView.tsx`
- **Canvas 2D Fallback:** `src/prototype/Canvas2DFallback.tsx`
- **View Model:** `src/prototype/worldViewModel.ts`
- **Project Spec:** `SPEC.md`
- **Product Vision:** `CLAUDE.md`

---

**Locked by:** Issue #162  
**Verified by:** [Pending review]  
**Approved by:** [@frason / Client]

This contract supersedes any prior informal renderer design. All follow-on rendering tasks (#163+) must respect this contract; changes require explicit re-approval.
