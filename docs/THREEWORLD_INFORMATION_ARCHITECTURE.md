# Three.js Living World: Information Architecture

**Status:** Production Definition (Issue #162)  
**Owner:** @frason  
**Created:** 2026-08-26  
**Complements:** `THREEWORLD_RENDERER_CONTRACT.md`

---

## Executive Summary

This document defines the screen-level information architecture for the Three.js Living World, establishing the semantic structure, interaction patterns, and content hierarchy across isometric (primary) and globe (secondary) views.

**Key principles:**
- **Isometric dominates gameplay** — selection, intervention, local observation
- **Globe provides context** — planetary overview, storytelling, population trends
- **2D fallback mirrors 3D** — identical overlays, selection, navigation
- **Navigation is consistent** — keyboard, touch, click all update shared state
- **Information flows bidirectionally** — selection in 3D updates 2D; 2D actions sync to 3D

---

## 1. Screen Hierarchy

### 1.1 Component Tree

```
<App>
  ├── <Header>
  │   ├── Title: "Living World"
  │   ├── Mode toggle: [Isometric] [Globe] [Debug]
  │   └── Performance monitor: fps, memory, build time
  │
  ├── <MainViewport>
  │   ├── <ThreeWorldView> (primary, direction='isometric' or 'globe')
  │   │   ├── [Canvas] (WebGL renderer)
  │   │   ├── [Marker] (selection ring)
  │   │   ├── [CreatureGroup] (density glyphs + individuals)
  │   │   └── [CellMesh] (InstancedMesh, ~10k cells)
  │   │
  │   └── <Canvas2DFallback> (if WebGL unavailable or forced)
  │       ├── [Canvas] (2D context)
  │       ├── [Marker] (selection ring)
  │       └── [Overlays] (cells + creatures)
  │
  ├── <LeftSidebar>
  │   ├── <OverlayControl>
  │   │   ├── ☐ Biomass
  │   │   ├── ☐ Energy
  │   │   ├── ☐ Toxicity
  │   │   ├── ☐ Corpse
  │   │   ├── ☐ Habitat
  │   │   ├── ☐ Mutation Pressure
  │   │   └── ☐ Lineage
  │   │
  │   └── <Legend>
  │       ├── [Biome color key]
  │       ├── [Strategy color key]
  │       ├── [Overlay explanation]
  │       └── [Zoom level indicator]
  │
  ├── <RightSidebar>
  │   ├── <CellInfoPanel>
  │   │   ├── Position: (x, y)
  │   │   ├── Biome: [name]
  │   │   ├── Elevation: [0.0–1.0]
  │   │   ├── Producer biomass: [value]
  │   │   ├── Energy: [value]
  │   │   └── Toxicity: [value]
  │   │
  │   └── <CreatureListPanel> (if creatures in cell)
  │       ├── [Creature 1: herbivore, age 42, lineage X]
  │       ├── [Creature 2: carnivore, age 18, lineage Y]
  │       └── [More...]
  │
  └── <Footer>
      ├── Tick: [1234] | Seed: [12345]
      ├── Creatures: [742 / 1000] | Species: [8] | Extinct: [2]
      └── [Play/Pause] [Speed] [Save] [Load]
```

---

## 2. Primary View: Isometric

### 2.1 Content Zones

```
┌─────────────────────────────────────────────────────┐
│  Header: Mode Selector + Performance              [X]│
├─────────────────────────────────────────────────────┤
│ Overlay │                                            │
│ Control │                                            │
│ ─────── │           ISOMETRIC CANVAS               │
│ ☐Biomass│                                            │
│ ☐Energy │         (Three.js WebGL, 16:9)           │
│ ☐Toxin  │                                            │
│ ☐Corpse │         • Grid visible at world zoom    │
│ ☐Habitat│         • Creatures as glyphs/individuals│
│ ☐Mutate │         • Selection ring on target      │
│ ☐Lineage│         • Camera rotatable via OrbitCtrl │
│         │                                            │
│  Legend │                                            │
│ ─────── │                                            │
│ Herbiv: │                                            │
│   🟡    │                                            │
│ Carniv: │                                            │
│   🔴    │                                            │
│ Omniv:  │                                            │
│   🔵    │                                            │
│ Scav:   │                                            │
│   🟣    │                                            │
└─────────────────────────────────────────────────────┘
                    │
         [Cell Info Sidebar]
         Position: (45, 67)
         Biome: Grassland
         Biomass: 0.8 / 1.0
         Energy: 42
         Toxicity: 0.1
         
         Creatures (3):
         • Herbivore, age 23, lineage-5
         • Herbivore, age 18, lineage-5
         • Omnivore, age 5, lineage-12
```

### 2.2 Overlay Controls

**Location:** Left sidebar, togglable set of checkboxes

**Overlay options:**

| Overlay | Visual | Layer | Purpose |
|---------|--------|-------|---------|
| **Biomass** | Green tint | 0.32 intensity | Show producer productivity; brighter = more food available |
| **Energy** | Yellow tint | 0.25 intensity | Show available nutrient concentration |
| **Toxicity** | Red-to-purple overlay | Variable opacity | Highlight contaminated cells; mutation risk zones |
| **Corpse** | Brown octahedron marker | Floating above cell | Mark dead organisms; see decomposition locations |
| **Habitat** | Biome color tint | 0.15 intensity | Emphasize biome suitability; subtle color gradient |
| **Mutation Pressure** | Yellow miasma | 0.2 intensity | Show radius around corpses where mutation rates spike |
| **Lineage** | White glow outline | Around selected lineage | Highlight all creatures in currently focused family line |

**Default active:** `{ biomass, toxicity }`

### 2.3 Legend

**Location:** Left sidebar below overlay control

**Content:**
- **Biome color key:** All 7 biomes with RGB hex codes
- **Strategy color key:** 4 strategies + unknown
- **Zoom level indicator:** "World" / "Region" / "Habitat" / "Local"
- **Current selection:** (x, y) grid position
- **Focus state:** "No focus" or "Focused on lineage-X" or "Focused on region"

---

## 3. Secondary View: Globe

### 3.1 Content Zones

```
┌─────────────────────────────────────────────────────┐
│  Header: Mode Selector + Performance              [X]│
├─────────────────────────────────────────────────────┤
│ Overlay │                                            │
│ Control │                                            │
│ ─────── │            GLOBE CANVAS                   │
│ ☐Biomass│                                            │
│ ☐Energy │         (Three.js WebGL, spherical)      │
│ ☐Toxin  │                                            │
│ ☐Corpse │         • Entire world as sphere        │
│ ☐Habitat│         • Creatures aggregated into     │
│ ☐Mutate │           region-scale glyphs           │
│ ☐Lineage│         • Selection marker on surface  │
│         │         • Camera rotates around center │
│  Legend │                                            │
│ ─────── │                                            │
│ [same as│                                            │
│  Isometric]                                          │
│         │                                            │
│ View: Overview                                       │
│ Interact: Click to select, rotate sphere             │
│ Return to isometric to intervene                     │
└─────────────────────────────────────────────────────┘
                    │
         [Cell Info Sidebar]
         (Same as isometric)
```

### 3.2 Globe-Specific Behavior

- **Read-only for interventions:** Players may observe but not execute game actions
- **Aggregate view:** Creatures rendered as density glyphs; no individual organisms visible
- **Rotation:** Camera freely rotates around globe; no panning (maintains orientation)
- **Selection sync:** Clicking a cell in globe view highlights it in isometric view
- **Narrative framing:** Show global extinction events, biome collapse, ecosystem shifts

---

## 4. Fallback: Canvas 2D

### 4.1 Layout (When WebGL Unavailable)

```
┌─────────────────────────────────────────────────────┐
│ [WebGL Unavailable - Using 2D Canvas Fallback]      │
├─────────────────────────────────────────────────────┤
│        ⚠️ WebGL not supported. Rendering in 2D.     │
│          Performance may be reduced.                │
├─────────────────────────────────────────────────────┤
│ Overlay │                                            │
│ Control │                                            │
│ ─────── │        ORTHOGRAPHIC GRID CANVAS           │
│ ☐Biomass│                                            │
│ ☐Energy │    [Cell grid, direct 1:1 projection]    │
│ ☐Toxin  │                                            │
│ ☐Corpse │    • Same overlays as Three.js          │
│ ☐Habitat│    • Same selection & keyboard nav      │
│ ☐Mutate │    • 30+ fps on low-end devices         │
│ ☐Lineage│                                            │
│         │                                            │
│  Legend │                                            │
│ ─────── │                                            │
│ [same as                                             │
│  3D]                                                 │
└─────────────────────────────────────────────────────┘
```

### 4.2 Fallback Features

- **Feature parity:** All overlays, selection, keyboard navigation work identically
- **Performance:** ~30 fps baseline (vs. 60 fps in WebGL)
- **No animation:** Zoom transitions snap rather than animate
- **Recovery:** Auto-switches back to WebGL if context is restored
- **Testing:** Toggleable via `useFallbackRender` prop for regression testing

---

## 5. Right Sidebar: Cell Information Panel

### 5.1 Structure

```
┌─────────────────────────────┐
│ SELECTED LOCATION           │
├─────────────────────────────┤
│ Position: (45, 67)          │
│ Grid: 100×100               │
├─────────────────────────────┤
│ BIOME & TERRAIN             │
├─────────────────────────────┤
│ Biome: Grassland 🌾         │
│ Elevation: 0.42             │
│ Visual height: 1.19         │
├─────────────────────────────┤
│ RESOURCES                   │
├─────────────────────────────┤
│ Producer biomass: 0.82/1.0  │
│ ▓▓▓▓▓▓▓░ [━━━━━━━░]         │
│                             │
│ Available energy: 45 units  │
│ ▓▓▓▓▓░░░ [━━━━░░░░]         │
│                             │
│ Toxicity: 0.15              │
│ ▓▓░░░░░░ [━░░░░░░░]         │
├─────────────────────────────┤
│ ORGANISMS (3)               │
├─────────────────────────────┤
│ 🟡 Herbivore #1001          │
│    Age: 23 ticks            │
│    Energy: 85               │
│    Lineage: lineage-5       │
│    [View lineage]           │
│                             │
│ 🟡 Herbivore #1042          │
│    Age: 18 ticks            │
│    Energy: 62               │
│    Lineage: lineage-5       │
│    [View lineage]           │
│                             │
│ 🔵 Omnivore #1087           │
│    Age: 5 ticks             │
│    Energy: 41               │
│    Lineage: lineage-12      │
│    [View lineage]           │
│                             │
│ [Next] [Prev]               │
├─────────────────────────────┤
│ [Zoom to lineage-5]         │
│ [Zoom to lineage-12]        │
└─────────────────────────────┘
```

### 5.2 Interactions

**Click "View lineage":** Triggers `focusLineage(lineageId)` → camera zooms to habitat level, highlights all creatures in lineage

**Click "Zoom to lineage-X":** Same as above; quick access for multiple lineages in one cell

**Scroll/pagination:** If cell contains >5 creatures, paginate through them

**Hide on mobile:** On screens < 480px, sidebar slides in/out on tap

---

## 6. Bottom Status Bar

### 6.1 Content

```
┌──────────────────────────────────────────────────────┐
│ Tick: 1234 | Seed: 12345                             │
│ Population: 742/1000 | Species: 8 | Extinct: 2      │
│ FPS: 60 | Memory: 145MB | Build: 320ms               │
│                                                       │
│ [▶ Play] [⏸ Pause] [Speed ▼] [⟲ Reset]             │
│ [💾 Save] [📂 Load] [⚙ Settings]                    │
└──────────────────────────────────────────────────────┘
```

### 6.2 Sections

**Simulation Status:**
- Current tick count
- World seed (for reproducibility)
- Creature population (current/max)
- Species count (alive + extinct)

**Performance (Debug View):**
- FPS (target 60)
- Memory usage (MB)
- Build time (ms for last frame)
- Glyph count (if density glyphs active)

**Controls:**
- Play/Pause toggle
- Speed selector (1x, 2x, 5x, 10x)
- Reset world (reload snapshot)
- Save/Load (persist world state)
- Settings (audio, motion preference, etc.)

---

## 7. Interaction Flows

### 7.1 Selecting a Cell

**User action:** Click cell in isometric view

**Flow:**
```
1. Mouse click detected in canvas
2. Raycaster fires from camera through click point
3. Intersection computed for InstancedMesh or creature mesh
4. Extract grid coordinates (x, y) from intersection
5. Update SelectedLocation: { x, y }
6. Render selection marker at new position
7. Update right sidebar with cell/creature info
8. If overlays include 'lineage', re-render highlights
```

**Result:** Selection ring appears on cell; sidebar populates with info

### 7.2 Focusing on a Lineage

**User action:** Click "Zoom to lineage-5" button in cell sidebar

**Flow:**
```
1. User clicks [Zoom to lineage-5]
2. App calls focusLineage('lineage-5')
3. FocusState updates: { zoom: 'habitat', lineageId: 'lineage-5' }
4. Renderer computes camera target (center of lineage positions)
5. Animate camera from current position to region center
6. Zoom from current distance to 'habitat' level (~15 units)
7. Creatures in lineage rendered individually; others dimmed
8. Duration: ~800ms with easeInOutCubic easing
```

**Result:** Smooth zoom to family line; camera settles on habitat view

### 7.3 Switching Between Isometric and Globe

**User action:** Click "Globe" button in header

**Flow:**
```
1. User clicks [Globe] mode button
2. App updates direction prop: 'isometric' → 'globe'
3. ThreeWorldView teardown (isometric scene, camera)
4. ThreeWorldView setup (globe scene, camera at spherical position)
5. Re-render snapshot with globe coordinate transform
6. Creatures aggregate into region glyphs
7. Camera positioned at (0, 8, 31) looking at origin
8. Selection marker positioned at globe surface coords
9. Overlays recomputed for spherical cells
```

**Result:** Viewport smoothly transitions to globe; selection maintained

### 7.4 Keyboard Navigation

**User action:** Press arrow keys

**Flow:**
```
1. Window captures keydown event
2. Extract current selected position (x, y)
3. Compute new position based on key:
   - ArrowUp: y -= 5
   - ArrowDown: y += 5
   - ArrowLeft: x -= 5
   - ArrowRight: x += 5
4. Clamp to grid bounds
5. Update SelectedLocation
6. Both Three.js and Canvas render selection marker at new position
7. Sidebar updates with cell info
```

**Result:** Selection moves; no animation (instant)

### 7.5 Overlay Toggle

**User action:** Check/uncheck overlay in sidebar

**Flow:**
```
1. User clicks overlay checkbox (e.g., "Toxicity")
2. App adds/removes overlay key from activeOverlays Set
3. Renderer recomputes overlay graphics:
   - If adding: compute toxicity field, create overlay mesh
   - If removing: dispose overlay mesh, update cell colors
4. Render update on next frame
```

**Result:** Overlay appears/disappears over world

### 7.6 WebGL Context Loss

**Trigger:** Browser loses WebGL context (OS sleep, tab backgrounding, etc.)

**Flow:**
```
1. renderer fires webglcontextlost event
2. ThreeWorldView catches event
3. Call onFallback(true)
4. Parent component switches to Canvas2DFallback
5. Pass same snapshot, selected, onSelect props
6. 2D canvas renders immediately
7. Selection state, overlays, and focus preserved
8. If webglcontextrestored fires later:
   - Call onFallback(false)
   - Switch back to Three.js
   - Resume at previous camera position
```

**Result:** Seamless fallback to 2D; no data loss

---

## 8. Navigation Patterns

### 8.1 Breadcrumb-Style Focus Levels

**Conceptual model:** User navigates between zoom contexts

```
World View
  └── Click cluster glyph
    └── Region View (specific biome hotspot)
      └── Click creature
        └── Habitat View (family line)
          └── Click "View details"
            └── Local View (individual organism)

Back at any level:
  └── Press R (reset) → World View
```

### 8.2 Selection Persistence

**Invariant:** Selection coordinate (x, y) is valid across all zoom levels

**Example:**
```
1. Select cell (45, 67) at world zoom
2. Zoom to region around (40–50, 60–70)
3. Cell (45, 67) still selected within region
4. Zoom to lineage (all creatures in region)
5. Cell (45, 67) still selected
6. Can zoom to local (individual creature at 45, 67)
```

**Benefit:** Players can drill down into a specific location while maintaining continuity

### 8.3 Return-to-Start Gesture

**Keyboard:** Press R (reset focus)

**Effect:** Immediately snaps to world zoom; no animation; clears lineage focus

**Rationale:** Quick escape from deep zoom back to overview

---

## 9. Mobile Adaptations

### 9.1 Portrait Mode (< 480px width)

```
┌──────────────────────────┐
│ Header (compact)         │
├──────────────────────────┤
│                          │
│  VIEWPORT (full width)   │
│  (Three.js or 2D Canvas) │
│  [No sidebars]           │
│                          │
├──────────────────────────┤
│ [☰] Bottom drawer        │
│  Overlays | Info | Stats │
└──────────────────────────┘
```

**Drawer behavior:**
- Tap [☰] icon → Overlay drawer slides up
- Tap cell → Cell info drawer slides up
- Tap overlay icon → Toggle that overlay (no drawer)
- Swipe down → Drawer collapses

**Two-finger gesture:** Pinch to zoom camera; drag to pan

### 9.2 Landscape Mode (≥ 480px width)

```
┌────────────────────────────────────┐
│ Header (full width)                │
├─────────────────────────────────────┤
│ Overlay │                    │ Cell  │
│ Control │    VIEWPORT        │ Info  │
│         │  (Three.js)        │ Panel │
│ Legend  │                    │       │
│         │                    │       │
└─────────────────────────────────────┘
```

**Sidebars:** Visible by default; can be collapsed on smaller tablets

### 9.3 Touch Interactions

| Gesture | Action |
|---------|--------|
| Single tap | Select cell; open drawer (if needed) |
| Two-finger drag | Pan camera (OrbitControls) |
| Pinch | Zoom camera in/out |
| Long press | (Reserved for future context menu) |
| Tap + hold on overlay icon | Show tooltip |

---

## 10. Accessibility Considerations

### 10.1 Screen Reader Support

**ARIA labels:**
```html
<canvas
  role="application"
  aria-label="Living world grid with creatures. Use arrow keys to navigate, Enter to select, R to reset."
/>
```

**Landmark structure:**
- `<header>` with navigation
- `<main>` with canvas
- `<aside role="region" aria-label="Selected cell information">` for sidebar
- `<footer>` with stats

### 10.2 Color Contrast

**Ratios (WCAG AA minimum 4.5:1 for small text):**
- Yellow (herbivore) on dark background: ~3.8:1 (fails; consider border)
- Red (carnivore) on dark background: ~2.5:1 (fails; consider larger icon)
- Cyan (omnivore) on dark background: ~2.0:1 (fails; consider icon)

**Recommendation:** Use icons in addition to colors to distinguish strategies

### 10.3 Motion & Animations

**Reduced-motion support:**
- Check `prefers-reduced-motion: reduce` media query
- Disable zoom animations (snap instead)
- Disable damping (instant focus)
- Disable particle effects (if any)

---

## 11. Information Density by Zoom Level

### 11.1 World Zoom

**Visible info:**
- Entire 100×100 grid
- Biome colors (subtle)
- 1–2 active overlays (biomass, toxicity)
- Population hotspots (density glyphs)
- Extinction zones (sparse or empty clusters)

**Hidden info:**
- Individual creatures
- Specific lineages
- Detailed cell stats
- Creature age/energy

### 11.2 Region Zoom

**Visible info:**
- ~25×25 visible area
- Biome colors (clear)
- 2–3 overlays
- Density glyphs for dense clusters
- Individual creatures for sparse areas
- Some lineage information if focused

**Hidden info:**
- Creatures outside region
- Fine genetic details
- Historical lineage tree

### 11.3 Habitat Zoom

**Visible info:**
- ~10×10 visible area
- Individual creatures (all)
- Biome details (clear)
- All overlays readable
- Lineage highlights (if focused)
- Creature age, energy (in sidebar)

**Hidden info:**
- Global population trends
- Distant biomes
- Long-term lineage genealogy

### 11.4 Local Zoom

**Visible info:**
- 1–5 cells
- Every creature rendered individually
- Full sidebar with detailed stats
- Mutation pressure field
- Movement predictions (future)

**Hidden info:**
- Global ecosystem state
- Other populations

---

## 12. Error States and Warnings

### 12.1 Common Scenarios

**No creatures visible:**
- Message: "No organisms in this region. (Extinction event?)"
- Action: Reset focus to world view to find populated areas

**WebGL context lost:**
- Alert: "WebGL context lost. Switching to 2D rendering."
- Fallback: Immediate switch to Canvas 2D
- Auto-recovery: If context restored, offer to switch back

**Performance degradation:**
- Warning badge: "⚠️ Low FPS" if < 30 fps
- Message: "Enable 'reduced motion' or close other apps"
- Fallback: Automatically disable expensive overlays

**Mobile out of memory:**
- Error: "Out of memory. Try reducing world size or disabling overlays."
- Action: Reset app (reload page)

---

## 13. Consistency Rules

### 13.1 Data Consistency

**Rule:** Every cell's visual appearance derives deterministically from snapshot + active overlays

**Verification:**
```typescript
// Same snapshot + overlays = same rendering
render(snapshot, overlays) === render(snapshot, overlays)  // Always true
```

### 13.2 Selection Consistency

**Rule:** Selection state is owned by parent; both renderers receive identical props

```typescript
<App>
  <ThreeWorldView selected={selected} onSelect={setSelected} />
  <Canvas2DFallback selected={selected} onSelect={setSelected} />
</App>
```

**Consequence:** If parent's state is synchronized, visual selection is synchronized.

### 13.3 Overlay Consistency

**Rule:** Active overlays are a Set held in state; both renderers apply same overlays

```typescript
const [activeOverlays, setActiveOverlays] = useState(new Set(['biomass', 'toxicity']));
// Both views render biomass and toxicity overlays identically
```

---

## 14. Future Enhancements

### 14.1 Planned Information Layers (Post-V1)

- **Heatmaps:** Gradient overlay of biodiversity, energy flow, or mutation density
- **Prediction layer:** Show expected population changes based on current conditions
- **Timeline scrubber:** Drag to rewind/fast-forward world history
- **Comparative view:** Side-by-side snapshot comparison
- **Creature detail panel:** 3D model viewer for genetic trait visualization

### 14.2 Interaction Enhancements

- **Context menu:** Long-press on creature for actions (isolate, export DNA, etc.)
- **Creature search:** Find specific lineage or strategy by name
- **Region filters:** Show only herbivores, or creatures from specific lineage
- **Intervention UI:** Place buildings, modify biome, introduce species (Phase A+)

### 14.3 Mobile Enhancements

- **Gesture customization:** Remap pinch/drag to player preference
- **Haptic feedback:** Vibration on selection, intervention, extinction
- **Dark mode toggle:** Respect system theme preference
- **Offline mode:** Save snapshot locally, replay without server

---

## 15. Testing Checklist

### 15.1 Interaction Testing

- [ ] Click cell in Three.js → Selection updates both views
- [ ] Click cell in Canvas 2D → Selection updates both views
- [ ] Press arrow keys → Selection moves smoothly; clamps at grid edge
- [ ] Click glyph → Camera zooms to region; glyphs recalculate
- [ ] Press R → Zoom resets to world; lineage focus cleared
- [ ] Toggle overlay → Appears/disappears without lag
- [ ] Switch mode (isometric → globe) → Seamless transition; selection maintained
- [ ] Fallback triggered → 2D canvas renders; all overlays visible
- [ ] WebGL context restored → Switch back to Three.js; camera position restored

### 15.2 Accessibility Testing

- [ ] Keyboard-only navigation (no mouse)
  - [ ] Arrow keys move selection
  - [ ] Enter to select (if applicable)
  - [ ] Tab through interactive elements
  - [ ] Escape defocuses
- [ ] Screen reader (e.g., NVDA, JAWS)
  - [ ] Canvas labeled with ARIA
  - [ ] Sidebar announced correctly
  - [ ] Overlay toggles announced
- [ ] Reduced motion
  - [ ] Zoom transitions snap (no animation)
  - [ ] Camera damping disabled
  - [ ] Particle effects hidden

### 15.3 Mobile Testing

- [ ] Portrait mode
  - [ ] Tap to select
  - [ ] Drawer opens/closes
  - [ ] Two-finger gesture works
- [ ] Landscape mode
  - [ ] Sidebars visible
  - [ ] Viewport not cramped
- [ ] Orientation change
  - [ ] Canvas resizes correctly
  - [ ] Selection preserved
  - [ ] Overlays remain valid
- [ ] Touch events
  - [ ] Pinch zoom works
  - [ ] Drag pan works
  - [ ] Tap selects cell

### 15.4 Performance Testing

- [ ] 1000+ creatures in world view < 16ms per frame
- [ ] Overlay toggle < 100ms
- [ ] Zoom transition smooth (60 fps) across 800ms
- [ ] Mobile fallback 30+ fps

---

## 16. References

- **Renderer Contract:** `THREEWORLD_RENDERER_CONTRACT.md`
- **Three.js Implementation:** `src/prototype/ThreeWorldView.tsx`
- **Semantic Zoom:** `artifacts/semantic_zoom_implementation.md`
- **WCAG Accessibility:** https://www.w3.org/WAI/WCAG21/quickref/
- **Media Queries:** MDN "prefers-reduced-motion"

---

**Document Approval:** Issue #162  
**Status:** Locked (changes require re-approval)

This information architecture is the authoritative source for screen layout and interaction patterns. All UI changes must maintain consistency with this document. File follow-on issues against this spec if changes are needed.
