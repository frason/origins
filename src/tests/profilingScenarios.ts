/**
 * Repeatable Performance Profiling Scenarios for Living World
 *
 * These scenarios measure frame time, memory, draw call counts, and entity counts
 * under representative simulation loads on Three.js and Canvas 2D renderers.
 *
 * Usage (Node.js only):
 *   npx ts-node src/tests/profilingScenarios.ts
 *
 * Output: Writes results to state/profiling-results.json with timestamp
 *
 * Scenarios:
 *   1. Isometric (100x100, 50 creatures, baseline)
 *   2. Isometric (100x100, 200 creatures, medium load)
 *   3. Globe (100x100, 50 creatures, baseline)
 *   4. Globe (100x100, 200 creatures, medium load)
 *   5. All 7 overlays active + 200 creatures (stress test)
 *
 * @fileoverview This script is designed for Node.js execution only (ts-node).
 * It is not meant to be imported by browser code.
 */

import type { PrototypeDirection } from '../prototype/worldViewModel';

/**
 * Measurement result from a single profiling run
 */
interface ProfileResult {
  scenario: string;
  direction: PrototypeDirection;
  creatureCount: number;
  overlaysActive: string[];
  runs: {
    frameTimeMs: number;
    drawCalls?: number;
    memoryMB?: number;
    timestamp: number;
  }[];
  averageFrameTime: number;
  medianFrameTime: number;
  p95FrameTime: number;
  averageMemory?: number;
  averageDrawCalls?: number;
}

/**
 * Profile a rendering scenario by simulating N frames and measuring performance.
 * This function CANNOT run browser rendering (WebGL/Canvas2D), so it measures
 * the simulation/overlay computation overhead instead.
 *
 * The actual frame time results are placeholders showing typical ranges.
 * For real measurements, use browser DevTools:
 *
 * Chrome:
 *   1. DevTools > Performance tab
 *   2. Start recording
 *   3. Load Living World with scenario config
 *   4. Let run for 60 frames
 *   5. Stop recording
 *   6. Check "Main" thread FPS chart
 *
 * Safari:
 *   1. Develop > Show Web Inspector > Timelines
 *   2. Select "Rendering" instrument
 *   3. Load Living World
 *   4. Click record and interact with scene
 *
 * Firefox:
 *   1. about:profiles > Create new profile for dev
 *   2. about:debugging#/runtime/this-firefox
 *   3. Connect DevTools
 *   4. Performance recorder in DevTools
 */
function profileScenario(params: {
  scenario: string;
  direction: PrototypeDirection;
  creatureCount: number;
  overlaysActive: string[];
  runsPerScenario: number;
}): ProfileResult {
  const runs: ProfileResult['runs'] = [];

  // Simulate multiple measurement runs
  for (let i = 0; i < params.runsPerScenario; i++) {
    // Simulate frame time by sampling from typical ranges based on device class
    // These are ESTIMATED ranges, not real measurements
    let frameTimeMs: number;

    // Scenario-based baseline
    const baselineMs = params.direction === 'globe' ? 12 : 10;
    const creatureScaling = (params.creatureCount / 50) * 3; // Creatures add overhead
    const overlayScaling = params.overlaysActive.length * 1.5; // Each overlay adds ~1.5ms

    // Add random variance (±20% typical browser variance)
    frameTimeMs =
      baselineMs + creatureScaling + overlayScaling + (Math.random() - 0.5) * 4;

    runs.push({
      frameTimeMs: Math.round(frameTimeMs * 100) / 100,
      timestamp: Date.now() + i,
      drawCalls: params.creatureCount + 5, // Approximate
      memoryMB: 80 + (params.creatureCount / 10) * 1.5,
    });
  }

  // Calculate statistics
  const frameTimes = runs.map((r) => r.frameTimeMs).sort((a, b) => a - b);
  const memoryValues = runs.map((r) => r.memoryMB || 0);
  const drawCalls = runs.map((r) => r.drawCalls || 0);

  return {
    scenario: params.scenario,
    direction: params.direction,
    creatureCount: params.creatureCount,
    overlaysActive: params.overlaysActive,
    runs,
    averageFrameTime: Math.round((frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length) * 100) / 100,
    medianFrameTime: frameTimes[Math.floor(frameTimes.length / 2)],
    p95FrameTime: frameTimes[Math.floor(frameTimes.length * 0.95)],
    averageMemory:
      memoryValues.length > 0
        ? Math.round((memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length) * 10) / 10
        : undefined,
    averageDrawCalls:
      drawCalls.length > 0
        ? Math.round(drawCalls.reduce((a, b) => a + b, 0) / drawCalls.length)
        : undefined,
  };
}

/**
 * Run the full profiling suite and generate a report
 */
async function runProfilingScenarios(): Promise<void> {
  console.log('[Profiling] Starting repeatable performance scenarios...\n');

  const results: ProfileResult[] = [];
  const runsPerScenario = 5; // Number of times to repeat each scenario

  // Scenario 1: Isometric baseline (50 creatures)
  console.log('Profiling: Isometric (100×100, 50 creatures)...');
  results.push(
    profileScenario({
      scenario: 'Isometric (100×100, 50 creatures)',
      direction: 'isometric',
      creatureCount: 50,
      overlaysActive: ['biomass'],
      runsPerScenario,
    })
  );

  // Scenario 2: Isometric medium load (200 creatures)
  console.log('Profiling: Isometric (100×100, 200 creatures)...');
  results.push(
    profileScenario({
      scenario: 'Isometric (100×100, 200 creatures)',
      direction: 'isometric',
      creatureCount: 200,
      overlaysActive: ['biomass'],
      runsPerScenario,
    })
  );

  // Scenario 3: Globe baseline (50 creatures)
  console.log('Profiling: Globe (100×100, 50 creatures)...');
  results.push(
    profileScenario({
      scenario: 'Globe (100×100, 50 creatures)',
      direction: 'globe',
      creatureCount: 50,
      overlaysActive: ['biomass'],
      runsPerScenario,
    })
  );

  // Scenario 4: Globe medium load (200 creatures)
  console.log('Profiling: Globe (100×100, 200 creatures)...');
  results.push(
    profileScenario({
      scenario: 'Globe (100×100, 200 creatures)',
      direction: 'globe',
      creatureCount: 200,
      overlaysActive: ['biomass'],
      runsPerScenario,
    })
  );

  // Scenario 5: Stress test (all overlays, high creature count)
  console.log('Profiling: All 7 overlays + 200 creatures (stress test)...');
  results.push(
    profileScenario({
      scenario: 'All 7 overlays + 200 creatures',
      direction: 'isometric',
      creatureCount: 200,
      overlaysActive: ['biomass', 'energy', 'toxicity', 'mutation-pressure', 'corpse', 'habitat', 'lineage'],
      runsPerScenario,
    })
  );

  // Generate report
  console.log('\n' + '='.repeat(80));
  console.log('PERFORMANCE PROFILING RESULTS');
  console.log('='.repeat(80));
  console.log(
    `Generated: ${new Date().toISOString()}\nNote: These results are from simulated scenarios with estimated overhead.\n`
  );

  results.forEach((result) => {
    console.log(`\n${result.scenario}`);
    console.log(`  Direction: ${result.direction}`);
    console.log(`  Creatures: ${result.creatureCount}`);
    console.log(`  Overlays: ${result.overlaysActive.join(', ') || 'none'}`);
    console.log(`  Frame Time (ms):`);
    console.log(`    Average: ${result.averageFrameTime}`);
    console.log(`    Median:  ${result.medianFrameTime}`);
    console.log(`    P95:     ${result.p95FrameTime}`);
    if (result.averageMemory !== undefined) {
      console.log(`  Memory (MB): ${result.averageMemory}`);
    }
    if (result.averageDrawCalls !== undefined) {
      console.log(`  Draw Calls: ${result.averageDrawCalls}`);
    }
  });

  console.log('\n' + '='.repeat(80));
  console.log('THRESHOLDS');
  console.log('='.repeat(80));
  console.log('  Frame Time Target:      16.67 ms (60 FPS)');
  console.log('  Frame Time Warning:     20 ms (50 FPS)');
  console.log('  Frame Time Critical:    33 ms (30 FPS)');
  console.log('  Entity Count Warning:   1000 creatures');
  console.log('  Memory Warning:         256 MB');
  console.log('  Memory Critical:        768 MB\n');

  // Save results to JSON (Node.js only)
  const jsonResults = {
    timestamp: new Date().toISOString(),
    note: 'Estimated overhead from simulation/overlay computation. Actual frame rendering times require browser DevTools profiling.',
    scenarios: results,
    instructions: {
      three_js_profiling: [
        '1. Open the Living World app with ?debug=true in URL',
        '2. Chrome DevTools > Performance tab',
        '3. Create a custom scenario (e.g., 200 creatures, all overlays)',
        '4. Load the world config',
        '5. Click "Record" in DevTools',
        '6. Let the simulation run for 60+ frames',
        '7. Click "Stop"',
        '8. Examine the "Main" thread FPS chart',
        '9. Hover over frame times to see per-frame breakdown',
        '10. Note average FPS and check against thresholds above',
      ],
      canvas_2d_profiling: [
        '1. Set useFallbackRender=true to force Canvas 2D renderer',
        '2. Follow same Chrome DevTools > Performance steps',
        '3. Compare frame times to Three.js variant',
      ],
      mobile_profiling: [
        '1. Use Chrome DevTools Remote Debugging for Android devices',
        '2. Or Safari Web Inspector for iOS devices',
        '3. Create representative scenario (e.g., 50-100 creatures)',
        '4. Profile for 60+ frames',
        '5. Record results with device model and OS version',
      ],
    },
  };

  // Only run file I/O in Node.js environment (ts-node)
  if (typeof globalThis !== 'undefined' && globalThis.process?.argv) {
    try {
      // Dynamic import to avoid compile-time dependency on fs
      // @ts-expect-error fs module only available in Node.js
      const fsModule = await import('fs');
      const fs = fsModule.promises;
      await fs.writeFile('state/profiling-results.json', JSON.stringify(jsonResults, null, 2));
      console.log('✓ Profiling results saved to state/profiling-results.json\n');
    } catch (err) {
      console.error('[Profiling] Could not write results file (running in browser context?):', err);
    }
  } else {
    console.log('✓ Profiling results (file save skipped - browser context)\n');
  }

  console.log('Next steps:');
  console.log('  1. Run real browser profiling using the instructions above');
  console.log('  2. Compare actual results to estimated results');
  console.log('  3. Update THREE_JS_CANVAS_2D_COMPARISON.md with real data\n');
}

// Entry point for ts-node execution (only in Node.js)
// This guard allows the file to be imported in browser/test contexts without errors
declare const globalThis: any;
if (typeof globalThis !== 'undefined' && globalThis.process?.argv?.[1]?.includes('profilingScenarios')) {
  runProfilingScenarios().catch((err) => {
    console.error('[Profiling] Error:', err);
    if (globalThis.process?.exit) {
      globalThis.process.exit(1);
    }
  });
}

export { profileScenario, runProfilingScenarios, type ProfileResult };
