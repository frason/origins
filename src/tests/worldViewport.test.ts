import { describe, expect, it } from 'vitest';
import { calculateGridLayout, viewportPointToTile } from '../ui/worldViewport';

describe('world viewport layout', () => {
  it('fits a square grid by the limiting viewport dimension', () => {
    const wide = calculateGridLayout(1000, 600, 100, 100);
    expect(wide.cellSize).toBe(6);
    expect(wide.width).toBe(600);
    expect(wide.height).toBe(600);

    const tall = calculateGridLayout(500, 900, 100, 100);
    expect(tall.cellSize).toBe(5);
    expect(tall.width).toBe(500);
    expect(tall.height).toBe(500);
  });

  it('centers the complete grid in unused viewport space', () => {
    expect(calculateGridLayout(1000, 600, 100, 100)).toMatchObject({
      offsetX: 200,
      offsetY: 0,
    });
    expect(calculateGridLayout(500, 900, 100, 100)).toMatchObject({
      offsetX: 0,
      offsetY: 200,
    });
  });

  it('maps centered canvas coordinates to accurate tiles', () => {
    const layout = calculateGridLayout(1000, 600, 100, 100);
    expect(viewportPointToTile(200, 0, layout, 100, 100)).toEqual({ x: 0, y: 0 });
    expect(viewportPointToTile(797, 597, layout, 100, 100)).toEqual({ x: 99, y: 99 });
    expect(viewportPointToTile(503, 303, layout, 100, 100)).toEqual({ x: 50, y: 50 });
  });

  it('ignores clicks in letterboxed space outside the grid', () => {
    const layout = calculateGridLayout(1000, 600, 100, 100);
    expect(viewportPointToTile(199, 300, layout, 100, 100)).toBeNull();
    expect(viewportPointToTile(801, 300, layout, 100, 100)).toBeNull();
  });
});
