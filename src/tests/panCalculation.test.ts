import { describe, expect, it } from 'vitest';
import { calculatePanX, isPanClamped, type PanCalculationParams } from '../ui/panCalculation';

describe('panCalculation utilities', () => {
  describe('calculatePanX', () => {
    it('shifts pan left when dragging right (positive delta)', () => {
      const params: PanCalculationParams = {
        startPanX: 0,
        zoomScale: 2,
        pixelDelta: 50, // Dragging right 50px
        svgWidthPx: 500,
        chartWidthSVG: 100,
      };

      const newPanX = calculatePanX(params);
      // pixelToSVU = 100/500 = 0.2, deltaSVU = 50 * 0.2 = 10
      // newPanX = 0 + 10 = 10
      // But it gets clamped to [-(100*(2-1)), 0] = [-100, 0]
      // So result should be 0 (clamped to upper bound)
      expect(newPanX).toBe(0);
    });

    it('shifts pan right when dragging left (negative delta)', () => {
      const params: PanCalculationParams = {
        startPanX: 0,
        zoomScale: 2,
        pixelDelta: -50, // Dragging left 50px
        svgWidthPx: 500,
        chartWidthSVG: 100,
      };

      const newPanX = calculatePanX(params);
      // pixelToSVU = 100/500 = 0.2, deltaSVU = -50 * 0.2 = -10
      // newPanX = 0 + (-10) = -10
      // Clamp to [-100, 0]: -10 is valid
      expect(newPanX).toBe(-10);
    });

    it('clamps pan at the left boundary (max leftward pan)', () => {
      const params: PanCalculationParams = {
        startPanX: -90,
        zoomScale: 2,
        pixelDelta: -500, // Extremely large leftward drag
        svgWidthPx: 500,
        chartWidthSVG: 100,
      };

      const newPanX = calculatePanX(params);
      // pixelToSVU = 0.2, deltaSVU = -500 * 0.2 = -100
      // newPanX = -90 + (-100) = -190
      // maxPan = 100 * (2-1) = 100, so bounds are [-100, 0]
      // Clamped to -100
      expect(newPanX).toBe(-100);
      expect(newPanX).toBeLessThanOrEqual(0);
      expect(newPanX).toBeGreaterThanOrEqual(-100);
    });

    it('clamps pan at the right boundary (no rightward pan)', () => {
      const params: PanCalculationParams = {
        startPanX: -50,
        zoomScale: 2,
        pixelDelta: 500, // Extremely large rightward drag
        svgWidthPx: 500,
        chartWidthSVG: 100,
      };

      const newPanX = calculatePanX(params);
      // pixelToSVU = 0.2, deltaSVU = 500 * 0.2 = 100
      // newPanX = -50 + 100 = 50
      // Bounds are [-100, 0], so clamped to 0
      expect(newPanX).toBe(0);
      expect(newPanX).toBeLessThanOrEqual(0);
      expect(newPanX).toBeGreaterThanOrEqual(-100);
    });

    it('respects zoom scale in max pan calculation', () => {
      // With 3x zoom, max pan should be 3x larger
      const params2x: PanCalculationParams = {
        startPanX: 0,
        zoomScale: 2,
        pixelDelta: -500, // -500px * (100/500) = -100 SVU
        svgWidthPx: 500,
        chartWidthSVG: 100,
      };

      const params3x: PanCalculationParams = {
        startPanX: 0,
        zoomScale: 3,
        pixelDelta: -500, // Same pixel drag
        svgWidthPx: 500,
        chartWidthSVG: 100,
      };

      const result2x = calculatePanX(params2x);
      const result3x = calculatePanX(params3x);

      // 2x zoom: maxPan = 100, so -100 SVU clamps to -100
      expect(result2x).toBe(-100);
      // 3x zoom: maxPan = 200, so -100 SVU is within bounds
      expect(result3x).toBe(-100);

      // With larger drag on 3x zoom, we can pan further
      const params3xLargerDrag: PanCalculationParams = {
        startPanX: 0,
        zoomScale: 3,
        pixelDelta: -1000, // -1000px * (100/500) = -200 SVU
        svgWidthPx: 500,
        chartWidthSVG: 100,
      };
      const result3xDeeper = calculatePanX(params3xLargerDrag);
      expect(result3xDeeper).toBe(-200); // Can pan deeper with higher zoom
    });

    it('handles no zoom (zoomScale = 1)', () => {
      const params: PanCalculationParams = {
        startPanX: 0,
        zoomScale: 1,
        pixelDelta: -100,
        svgWidthPx: 500,
        chartWidthSVG: 100,
      };

      const newPanX = calculatePanX(params);
      // maxPan = 100 * (1 - 1) = 0
      // Any pan value outside [0, 0] gets clamped to 0
      expect(Math.abs(newPanX)).toBe(0); // Accept both +0 and -0
    });

    it('converts pixel deltas correctly based on svg/chart ratio', () => {
      // Narrow chart: larger pixelToSVU ratio (fewer pixels per SVU)
      const narrowChart: PanCalculationParams = {
        startPanX: 0,
        zoomScale: 2,
        pixelDelta: -100,
        svgWidthPx: 1000, // Wide viewport
        chartWidthSVG: 50, // Narrow chart
      };

      // Wide chart: smaller pixelToSVU ratio (more pixels per SVU)
      const wideChart: PanCalculationParams = {
        startPanX: 0,
        zoomScale: 2,
        pixelDelta: -100,
        svgWidthPx: 500, // Narrow viewport
        chartWidthSVG: 100, // Wide chart
      };

      const narrowResult = calculatePanX(narrowChart);
      const wideResult = calculatePanX(wideChart);

      // Narrow chart has tighter pixelToSVU (50/1000 = 0.05)
      // Wide chart has looser pixelToSVU (100/500 = 0.2)
      // For same pixel drag, narrow chart should pan less in SVU space
      expect(Math.abs(narrowResult)).toBeLessThan(Math.abs(wideResult));
    });
  });

  describe('isPanClamped', () => {
    it('returns true for pan within valid bounds', () => {
      const zoomScale = 2;
      const chartWidthSVG = 100;
      const maxPan = 100;

      expect(isPanClamped(0, zoomScale, chartWidthSVG)).toBe(true);
      expect(isPanClamped(-50, zoomScale, chartWidthSVG)).toBe(true);
      expect(isPanClamped(-100, zoomScale, chartWidthSVG)).toBe(true);
    });

    it('returns false for pan exceeding left boundary', () => {
      const zoomScale = 2;
      const chartWidthSVG = 100;

      expect(isPanClamped(-101, zoomScale, chartWidthSVG)).toBe(false);
      expect(isPanClamped(-200, zoomScale, chartWidthSVG)).toBe(false);
    });

    it('returns false for pan exceeding right boundary', () => {
      const zoomScale = 2;
      const chartWidthSVG = 100;

      expect(isPanClamped(1, zoomScale, chartWidthSVG)).toBe(false);
      expect(isPanClamped(50, zoomScale, chartWidthSVG)).toBe(false);
    });

    it('validates boundary at edges for different zoom levels', () => {
      const chartWidthSVG = 100;

      // At 2x zoom, maxPan = 100
      expect(isPanClamped(-100, 2, chartWidthSVG)).toBe(true);
      expect(isPanClamped(-101, 2, chartWidthSVG)).toBe(false);

      // At 3x zoom, maxPan = 200
      expect(isPanClamped(-200, 3, chartWidthSVG)).toBe(true);
      expect(isPanClamped(-201, 3, chartWidthSVG)).toBe(false);

      // At 1x zoom (no zoom), maxPan = 0
      expect(isPanClamped(0, 1, chartWidthSVG)).toBe(true);
      expect(isPanClamped(-1, 1, chartWidthSVG)).toBe(false);
    });
  });
});
