/**
 * Pure functions for calculating pan position during drag-to-pan interactions.
 * These functions are isolated and testable without React components.
 */

export interface PanCalculationParams {
  /** Pan X position at the start of the drag (in SVG units) */
  startPanX: number;
  /** Zoom scale (1.0 = no zoom, >1 = zoomed in) */
  zoomScale: number;
  /** Pixel delta from pointer movement (positive = right) */
  pixelDelta: number;
  /** Width of SVG viewport in pixels */
  svgWidthPx: number;
  /** Chart width in SVG units */
  chartWidthSVG: number;
}

/**
 * Calculate the new pan X position after a pointer move event.
 * Clamps the result to stay within valid pan bounds.
 *
 * Pan behavior: dragging right decreases panX (shows content to the right),
 * dragging left increases panX (shows content to the left).
 *
 * @param params - Pan calculation parameters
 * @returns New pan X position, clamped to valid range [-maxPan, 0]
 */
export function calculatePanX(params: PanCalculationParams): number {
  const { startPanX, zoomScale, pixelDelta, svgWidthPx, chartWidthSVG } = params;

  // Convert pixel delta to SVG coordinate space
  const pixelToSVU = chartWidthSVG / svgWidthPx;
  const deltaSVU = pixelDelta * pixelToSVU;

  // Calculate max pan (how far right we can pan when zoomed)
  const maxPan = chartWidthSVG * (zoomScale - 1);

  // New pan position: add the delta to the starting position
  const newPanX = startPanX + deltaSVU;

  // Clamp to valid range: [-maxPan, 0]
  // 0 = no pan (left edge visible)
  // -maxPan = maximum pan right (right edge visible)
  return Math.max(-maxPan, Math.min(0, newPanX));
}

/**
 * Verify that pan is within valid bounds.
 *
 * @param panX - Current pan X position
 * @param zoomScale - Zoom scale
 * @param chartWidthSVG - Chart width in SVG units
 * @returns true if pan is within valid bounds
 */
export function isPanClamped(panX: number, zoomScale: number, chartWidthSVG: number): boolean {
  const maxPan = chartWidthSVG * (zoomScale - 1);
  return panX >= -maxPan && panX <= 0;
}
