# Three.js vs Canvas 2D: Performance & UX Comparison

**Date:** 2026-08-26  
**Scope:** Living World rendering for mobile (iOS/Android) and desktop (modern browsers)  

## Measurement Status

**IMPORTANT:** Performance numbers below are **estimated/heuristic** based on typical device capabilities and published benchmarks. They have NOT been measured via live profiling runs. 

**To generate real profiling data:**

1. Run the repeatable profiling scenarios script:
   ```bash
   npx ts-node src/tests/profilingScenarios.ts
   ```
   This outputs `state/profiling-results.json` with estimated overhead metrics.

2. Then run browser-based profiling using the **Manual Testing** section below to measure actual frame times across real devices.

3. Capture results from:
   - Chrome DevTools > Performance tab (frame time, draw calls)
   - Safari Web Inspector > Timelines (iOS)
   - Android Chrome Remote Debugging
   
4. Update this document's tables with actual measured data.

For accurate metrics on specific devices, follow the profiling procedures in the "Testing Procedure" section below.

## Executive Summary

This document compares Three.js (WebGL) and Canvas 2D rendering approaches for the Living World visualization, assessing performance, accessibility, and usability across device categories.

**Key Finding:** Three.js is superior on desktop and tablets with sufficient GPU memory; Canvas 2D is a reliable fallback for older/underpowered devices and when WebGL context is lost. The architecture supports both—Three.js as primary, Canvas 2D as automatic fallback.

---

## Test Scenarios

### Device Categories

| Device Class | Examples | GPU | RAM | Network |
|---|---|---|---|---|
| **Desktop High** | Modern MacBook, Windows gaming PC | Dedicated GPU (RTX/M1 Pro+) | 16GB+ | Fiber/Cable |
| **Desktop Mid** | MacBook Air M1, Surface Laptop 4 | Integrated GPU (Intel Iris, M1) | 8GB | Broadband |
| **Tablet (High)** | iPad Pro 2024 | Apple A17 Pro | 8GB+ | Wi-Fi 6 |
| **Tablet (Mid)** | iPad Air (2022), Samsung Tab S9 | Mid-range SoC | 6-8GB | Wi-Fi 5 |
| **Mobile (High)** | iPhone 15 Pro, Samsung S24 | Latest flagship SoC | 8GB+ | 5G/LTE |
| **Mobile (Mid)** | iPhone 14, Samsung S23 | Previous-gen flagship | 6GB | LTE |
| **Mobile (Low)** | iPhone SE, Samsung A53 | Budget SoC (A15, Exynos) | 4-6GB | LTE |

---

## Performance Metrics

### Frame Time (ms) — Target: ≤16.67 for 60 FPS

#### Three.js (WebGL)

| Scenario | Desktop High | Desktop Mid | Tablet High | Tablet Mid | Mobile High | Mobile Mid | Mobile Low |
|---|---|---|---|---|---|---|---|
| **Isometric (100×100, 50 creatures)** | 8–12 | 12–18 | 10–14 | 14–22 | 12–16 | 16–28 | 28–50+ |
| **Isometric (100×100, 200 creatures)** | 12–15 | 16–22 | 14–18 | 20–32 | 16–24 | 24–40 | 40–80+ |
| **Globe (100×100, 50 creatures)** | 10–14 | 14–20 | 12–16 | 16–26 | 14–20 | 20–32 | 32–60+ |
| **Globe (100×100, 200 creatures)** | 14–18 | 18–26 | 16–22 | 24–36 | 18–28 | 28–48 | 48–90+ |

**Three.js Characteristics:**
- ✅ Consistent frame times on high-end devices
- ✅ Handles 7–8 overlays simultaneously with minimal overhead
- ✅ Optimized instance rendering (single draw call per mesh type)
- ⚠️ Mobile Low devices drop below 60 FPS quickly as creature count increases
- ⚠️ Context loss/recovery on mobile can cause 100–300ms spike

#### Canvas 2D

| Scenario | Desktop High | Desktop Mid | Tablet High | Tablet Mid | Mobile High | Mobile Mid | Mobile Low |
|---|---|---|---|---|---|---|---|
| **Grid (100×100, 50 creatures)** | 20–30 | 25–40 | 20–35 | 28–50 | 25–45 | 40–80 | 60–120+ |
| **Grid (100×100, 200 creatures)** | 30–45 | 40–60 | 35–55 | 50–80 | 45–75 | 70–120 | 100–200+ |

**Canvas 2D Characteristics:**
- ✅ No WebGL initialization overhead
- ✅ Predictable behavior (no context loss)
- ✅ Simpler fallback for accessibility tech
- ⚠️ 2–3× slower than Three.js on desktop
- ⚠️ Creature rendering is CPU-bound (loops through each, draw calls per creature)
- ⚠️ Overlay computation blocks main thread during render

---

## Memory Usage (MB) — Target: ≤256MB

| Load | Three.js Desktop | Canvas 2D Desktop | Three.js Mobile | Canvas 2D Mobile |
|---|---|---|---|---|
| **Baseline (empty world)** | 45–60 | 30–40 | 40–55 | 25–35 |
| **100×100 world, 50 creatures** | 80–110 | 50–70 | 90–130 | 55–80 |
| **100×100 world, 200 creatures** | 120–160 | 75–100 | 140–200 | 90–130 |
| **All 7 overlays active** | +15–25 MB | +8–12 MB | +20–35 MB | +10–15 MB |

**Memory Characteristics:**
- Three.js: Texture buffers, geometry data, shader programs, OrbitControls state
- Canvas 2D: ImageData, overlay computation arrays, minimal shader/texture overhead
- Mobile Low devices with 4GB RAM may hit critical memory at 150+ creatures

---

## Accessibility & UX

### Input Methods

| Input | Three.js | Canvas 2D | Notes |
|---|---|---|---|
| **Mouse (pointer)** | ✅ Excellent | ✅ Good | Raycasting vs pixel-based selection |
| **Touch (pinch/pan)** | ✅ Good (OrbitControls) | ⚠️ Custom needed | Fallback is single-tap only by default |
| **Keyboard (arrow keys)** | ✅ Full (tabIndex, listeners) | ✅ Full | Both support arrow keys for movement |
| **Reduced Motion** | ✅ Respected (damping disabled) | ✅ Respected | No animations in either |
| **Screen Reader** | ⚠️ Partial (`aria-label`) | ✅ Better (`role="img"` + alt) | Canvas is treated as image; needs descriptions |

### Features

| Feature | Three.js | Canvas 2D | Implementation |
|---|---|---|---|
| **Overlay visibility** | ✅ 7 types | ✅ 7 types | Identical legend/controls |
| **Cell selection** | ✅ 3D raycasting | ✅ 2D grid math | Both highlight selection marker |
| **Zoom** | ✅ Camera (semantic) | ✅ CSS/manual | Three.js offers continuous zoom range |
| **Pan** | ✅ Camera (smooth) | ✅ Discrete grid | Canvas jumps between cells |
| **Creature inspection** | ✅ Click to select | ✅ Click to select | No difference in feature set |

---

## Network & Load

### Initial Load Time

| Scenario | Desktop High | Mobile High | Mobile Low |
|---|---|---|---|
| **Three.js library + polyfill** | 150–200 ms | 200–300 ms | 300–500 ms |
| **Canvas 2D (no lib)** | <10 ms | <10 ms | <10 ms |
| **Full app + data (100×100)** | 500–800 ms | 800–1200 ms | 1500–2500 ms |

### WebGL Initialization Cost

- Three.js scene setup: 50–100 ms
- WebGL context creation: 20–40 ms (can spike on mobile)
- Geometry/material compilation: 30–60 ms
- First render: 20–40 ms
- **Total first paint: 120–240 ms** (longer on mobile)

Canvas 2D:
- No special init, just canvas element creation: <5 ms
- First render: 20–100 ms (depends on creature count)
- **Total: <120 ms**

---

## Failure Modes & Recovery

### WebGL Context Loss

| Scenario | Likelihood | Recovery Time | User Impact |
|---|---|---|---|
| **Desktop (high-end)** | <1% (rare) | 100–200 ms | Brief flicker, automatic recovery |
| **Desktop (mid-range)** | 1–3% (tab switch, many tabs) | 150–300 ms | Noticeable pause |
| **Tablet (high)** | 2–5% (memory pressure) | 200–400 ms | Momentary blank, then restore |
| **Mobile (mid/low)** | 5–15% (memory, switching apps) | 300–600 ms | Visible glitch, may lose focus |

**Automatic Fallback Activation:** When context loss detected, parent component sets `useFallbackRender=true`, rendering Canvas 2D within 50 ms of detection.

### Fallback Rendering Quality

| Aspect | Three.js | Canvas 2D |
|---|---|---|
| **Grid clarity** | 3D perspective (can obscure) | Orthogonal (clearer) |
| **Creature visibility** | Small on full-world, large on semantic zoom | Always same size (may overlap) |
| **Overlay legend** | Interactive toggles | Static reference legend on canvas |
| **Interaction latency** | 1–2 ms (GPU) | 5–15 ms (CPU repaint) |

---

## Recommendations by Device Class

### Desktop (High/Mid)

- **Primary:** Three.js (WebGL)
- **Fallback:** Canvas 2D (for context loss or accessibility)
- **Settings:** Load all overlays; enable damping; 1.5× pixel ratio max
- **Expected:** 95%+ frames at 60 FPS

### Tablet (High)

- **Primary:** Three.js (WebGL)
- **Fallback:** Canvas 2D (if memory >300 MB)
- **Settings:** Disable non-essential overlays on low-power mode; reduce pixel ratio to 1.0
- **Expected:** 80–90% frames at 60 FPS

### Tablet (Mid)

- **Primary:** Three.js (WebGL) with reduced overlays
- **Fallback:** Canvas 2D (aggressive, if frame time >33 ms)
- **Settings:** Max 4 active overlays; pixel ratio 1.0; disable damping if reduced-motion
- **Expected:** 70–80% frames at 60 FPS; occasional dips to 30 FPS acceptable

### Mobile (High)

- **Primary:** Three.js (WebGL), limited to 100 creatures per direction
- **Fallback:** Canvas 2D (if creature count >150)
- **Settings:** 3 overlays max (biomass, toxicity, corpse); pixel ratio 1.0; aggressive LOD
- **Expected:** 60–70% frames at 60 FPS in busy scenes

### Mobile (Mid)

- **Primary:** Canvas 2D recommended (or Three.js with heavy restrictions)
- **Fallback:** None (Canvas 2D is primary)
- **Settings:** Single overlay at a time; 50 creature soft cap
- **Expected:** 45–60 frames at 30 FPS acceptable

### Mobile (Low)

- **Primary:** Canvas 2D only
- **Fallback:** None
- **Settings:** Simple grid, no overlays; 25 creature soft cap
- **Expected:** 20–30 FPS acceptable (graceful degradation)

---

## Profiling & Enforcement

### Performance Budgets Implemented

```typescript
export const PERFORMANCE_BUDGETS = {
  frameTimeTarget: 16.67,      // 60 FPS
  frameTimeWarning: 20,        // Warn at 50 FPS
  frameTimeCritical: 33,       // Critical at 30 FPS
  
  entityCountTarget: 500,      // Warn at 500 creatures
  entityCountWarning: 1000,    // Begin degradation
  
  memoryTargetMB: 256,         // Warn at 256 MB
  memoryCriticalMB: 768,       // Hard limit
  
  overlayComputationBudget: 5, // Per-frame overlay gen
  contextRecoveryTimeBudget: 100, // WebGL recovery
};
```

### Monitoring Points

1. **Frame Time:** Recorded every render; averaged over 60 frames
2. **Entity Count:** Logged per direction change
3. **Memory Usage:** Sampled from `performance.memory` (Chrome/Node only; graceful on others)
4. **Draw Calls:** Captured from `renderer.info.render.calls`
5. **Overlay Compute:** Timed during cell/creature data processing
6. **Context Recovery:** Counted on WebGL restoration

### Console Warnings

- **Frame time >20 ms:** "Frame time 22.1ms exceeds warning threshold."
- **Entity count >1000:** "Entity count 1200 exceeds warning threshold (1000)."
- **Memory >512 MB:** "Memory usage 580MB exceeds warning threshold (512MB)."

---

## Testing Procedure

### Automated Tests & Profiling Scripts

```bash
# Run all overlay/fallback/performance tests
npm run test -- threeWorldOverlay.test

# Generate estimated overhead profile (simulation/overlay computation only)
# Creates state/profiling-results.json with typical ranges
npx ts-node src/tests/profilingScenarios.ts

# Check build passes (TS types)
npm run build

# Lint and type-check
npm run lint
npm run type-check
```

**Note:** The `profilingScenarios.ts` script generates estimated measurements from simulation-only workloads. For actual frame-rendering measurements, use browser DevTools profiling (see "Manual Testing" section below).

### Manual Testing (Representative Scenarios)

1. **Desktop (MacBook Pro M1):**
   - Load isometric, 100×100, 200 creatures
   - Verify frame time 12–18 ms
   - Toggle all 7 overlays; confirm no frame drops
   - Disable WebGL via DevTools → fallback to Canvas 2D
   - Verify selection/keyboard still work

2. **Tablet (iPad Pro 2024):**
   - Same as desktop, measure memory
   - Verify memory <200 MB during normal play
   - Test touch pinch/pan (OrbitControls)
   - Simulate memory pressure → should trigger fallback

3. **Mobile (iPhone 15 Pro):**
   - Load in landscape (wider viewport)
   - Monitor frame time; expect 12–20 ms at 50 creatures
   - Add to 150+ creatures → observe graceful degradation or fallback
   - Test keyboard (external connected); verify arrow keys work
   - Disable WebGL → fallback should be instant

4. **Mobile (Samsung A53):**
   - Load directly to Canvas 2D fallback
   - Verify interaction is functional (single-tap cells)
   - No Three.js errors; clean rendering

---

## Implementation Details

### Automatic Fallback Trigger

```typescript
// In ThreeWorldView.tsx render effect:
if (useFallbackRender) {
  return <Canvas2DFallback snapshot={snapshot} ... />;
}

// WebGL context loss handler:
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  onFallback(true); // Signal parent to enable fallback
  console.warn('[Three.js] WebGL context lost. Activating 2D fallback.');
});

renderer.domElement.addEventListener('webglcontextrestored', () => {
  onFallback(false); // Restore Three.js
  console.log('[Three.js] WebGL context restored.');
});
```

### Overlay Consistency

Both renderers support identical overlay set:
- **biomass** — Producer biomass (green tint)
- **energy** — Available energy (yellow tint)
- **toxicity** — Toxicity hazard (red/violet overlay)
- **mutation-pressure** — Corpse miasma (amber glow)
- **corpse** — Dead creatures (brown geometry)
- **habitat** — Biome suitability (base color saturation)
- **lineage** — Followed species (white marker ring)

---

## Conclusion

The dual-renderer architecture (Three.js + Canvas 2D fallback) provides:

1. **Best Performance:** Three.js on capable devices (desktop, high-end tablets/mobiles)
2. **Reliability:** Canvas 2D fallback for WebGL loss or older devices
3. **Accessibility:** Both support keyboard, touch, reduced-motion preferences
4. **Observability:** Performance budgets enforced at runtime with console warnings
5. **Testability:** Comprehensive test suite (unit + integration)

**Recommended Deployment:**
- Deploy with Three.js as primary; monitor fallback activation rate
- Target: <5% fallback triggers in production
- If >10% fallback rate observed: optimize Three.js or increase device targeting threshold

---

## References

- **Profiling Script:** `src/tests/profilingScenarios.ts` (generates repeatable scenarios with overhead estimates)
- **Performance Budgets:** `src/ui/performanceBudgets.ts`
- **Three.js View:** `src/prototype/ThreeWorldView.tsx`
- **Canvas Fallback:** `src/prototype/Canvas2DFallback.tsx`
- **Legend/Controls:** `src/ui/ThreeWorldLegend.tsx`, `src/ui/ThreeWorldOverlayControl.tsx`
- **Tests:** `src/tests/threeWorldOverlay.test.tsx`
- **Profile Results:** `state/profiling-results.json` (generated output from profilingScenarios.ts)
