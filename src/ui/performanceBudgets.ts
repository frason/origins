/**
 * Performance budgets for Three.js and Canvas 2D rendering.
 * These targets are enforced at runtime with warnings and graceful degradation.
 */

export const PERFORMANCE_BUDGETS = {
  // Frame time budget: aim for 60 FPS = 16.67ms per frame
  frameTimeTarget: 16.67,
  frameTimeWarning: 20, // Warn at 20ms (slower than 50 FPS)
  frameTimeCritical: 33, // Critical at 33ms (30 FPS)

  // Memory budget for creature/overlay data (MB)
  memoryTargetMB: 256,
  memoryWarningMB: 512,
  memoryCriticalMB: 768,

  // Entity count budgets (creatures + decaying corpses)
  entityCountTarget: 500,
  entityCountWarning: 1000,
  entityCountCritical: 2000,

  // WebGL context recovery time budget (ms)
  contextRecoveryTimeBudget: 100,

  // Overlay computation budget (ms)
  overlayComputationBudget: 5,

  // Build/initialization budget per view (ms)
  buildTimeBudget: 100,
} as const;

interface PerformanceMetrics {
  lastFrameTimeMs: number;
  averageFrameTimeMs: number;
  peakFrameTimeMs: number;
  entityCount: number;
  drawCallCount: number;
  triangleCount: number;
  memoryUsageMB: number;
  lastOverlayComputeMs: number;
  contextRecoveries: number;
}

export class PerformanceMonitor {
  private frameTimeSamples: number[] = [];
  private maxSamples = 60; // Track 60 frames (~1 second at 60 FPS)
  private metrics: PerformanceMetrics = {
    lastFrameTimeMs: 0,
    averageFrameTimeMs: 0,
    peakFrameTimeMs: 0,
    entityCount: 0,
    drawCallCount: 0,
    triangleCount: 0,
    memoryUsageMB: 0,
    lastOverlayComputeMs: 0,
    contextRecoveries: 0,
  };

  recordFrameTime(timeMs: number) {
    this.metrics.lastFrameTimeMs = timeMs;
    this.frameTimeSamples.push(timeMs);
    if (this.frameTimeSamples.length > this.maxSamples) {
      this.frameTimeSamples.shift();
    }
    this.metrics.peakFrameTimeMs = Math.max(
      this.metrics.peakFrameTimeMs,
      timeMs
    );
    this.metrics.averageFrameTimeMs =
      this.frameTimeSamples.reduce((a, b) => a + b, 0) /
      this.frameTimeSamples.length;

    this.checkBudgets();
  }

  recordEntityCount(count: number) {
    this.metrics.entityCount = count;
    this.checkBudgets();
  }

  recordDrawMetrics(drawCalls: number, triangles: number) {
    this.metrics.drawCallCount = drawCalls;
    this.metrics.triangleCount = triangles;
  }

  recordMemoryUsage() {
    // performance.memory is a Chrome/Node-specific extension, not standard Web API
    const perfMemory = (performance as any).memory;
    if (perfMemory?.usedJSHeapSize) {
      this.metrics.memoryUsageMB = perfMemory.usedJSHeapSize / (1024 * 1024);
    }
  }

  recordOverlayComputeTime(timeMs: number) {
    this.metrics.lastOverlayComputeMs = timeMs;
  }

  recordContextRecovery() {
    this.metrics.contextRecoveries += 1;
  }

  private checkBudgets() {
    const budgets = PERFORMANCE_BUDGETS;

    // Frame time check
    if (this.metrics.lastFrameTimeMs > budgets.frameTimeCritical) {
      console.warn(
        `[PERFORMANCE] Frame time ${this.metrics.lastFrameTimeMs.toFixed(
          1
        )}ms exceeds critical budget (${budgets.frameTimeCritical}ms). Reducing quality.`
      );
    } else if (this.metrics.lastFrameTimeMs > budgets.frameTimeWarning) {
      console.warn(
        `[PERFORMANCE] Frame time ${this.metrics.lastFrameTimeMs.toFixed(
          1
        )}ms exceeds warning threshold (${budgets.frameTimeWarning}ms).`
      );
    }

    // Memory check
    if (this.metrics.memoryUsageMB > budgets.memoryCriticalMB) {
      console.warn(
        `[PERFORMANCE] Memory usage ${this.metrics.memoryUsageMB.toFixed(
          1
        )}MB exceeds critical budget (${budgets.memoryCriticalMB}MB).`
      );
    } else if (this.metrics.memoryUsageMB > budgets.memoryWarningMB) {
      console.warn(
        `[PERFORMANCE] Memory usage ${this.metrics.memoryUsageMB.toFixed(
          1
        )}MB exceeds warning threshold (${budgets.memoryWarningMB}MB).`
      );
    }

    // Entity count check
    if (this.metrics.entityCount > budgets.entityCountCritical) {
      console.warn(
        `[PERFORMANCE] Entity count ${this.metrics.entityCount} exceeds critical budget (${budgets.entityCountCritical}).`
      );
    } else if (this.metrics.entityCount > budgets.entityCountWarning) {
      console.warn(
        `[PERFORMANCE] Entity count ${this.metrics.entityCount} exceeds warning threshold (${budgets.entityCountWarning}).`
      );
    }

    // Overlay computation check
    if (this.metrics.lastOverlayComputeMs > budgets.overlayComputationBudget) {
      console.warn(
        `[PERFORMANCE] Overlay computation ${this.metrics.lastOverlayComputeMs.toFixed(
          2
        )}ms exceeds budget (${budgets.overlayComputationBudget}ms).`
      );
    }
  }

  getMetrics(): Readonly<PerformanceMetrics> {
    this.recordMemoryUsage();
    return Object.freeze({ ...this.metrics });
  }

  reset() {
    this.frameTimeSamples = [];
    this.metrics = {
      lastFrameTimeMs: 0,
      averageFrameTimeMs: 0,
      peakFrameTimeMs: 0,
      entityCount: 0,
      drawCallCount: 0,
      triangleCount: 0,
      memoryUsageMB: 0,
      lastOverlayComputeMs: 0,
      contextRecoveries: 0,
    };
  }
}

/**
 * Detect if device prefers reduced motion.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Detect if WebGL is supported and available.
 */
export function isWebGLSupported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') || canvas.getContext('webgl');
    return gl !== null;
  } catch {
    return false;
  }
}

/**
 * Get device capabilities for rendering optimization.
 */
export function getDeviceCapabilities() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');

  return {
    maxTextureSize: gl?.getParameter(gl.MAX_TEXTURE_SIZE) ?? 4096,
    maxRenderBufferSize:
      gl?.getParameter(gl.MAX_RENDERBUFFER_SIZE) ?? 4096,
    isDesktop:
      typeof window !== 'undefined' && window.innerWidth >= 1024,
    devicePixelRatio: typeof window !== 'undefined'
      ? window.devicePixelRatio
      : 1,
  };
}
