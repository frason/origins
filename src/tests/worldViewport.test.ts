import { describe, expect, it } from 'vitest';
import {
  calculateGridLayout,
  navigateTileSelection,
  viewportPointToTile,
} from '../ui/worldViewport';

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

  it('moves keyboard selection one tile and clamps every boundary', () => {
    expect(navigateTileSelection({ x: 5, y: 5 }, 'ArrowLeft', 10, 10))
      .toEqual({ handled: true, tile: { x: 4, y: 5 } });
    expect(navigateTileSelection({ x: 0, y: 0 }, 'ArrowUp', 10, 10).tile)
      .toEqual({ x: 0, y: 0 });
    expect(navigateTileSelection({ x: 9, y: 9 }, 'ArrowRight', 10, 10).tile)
      .toEqual({ x: 9, y: 9 });
  });

  it('starts keyboard exploration near the center and supports jump/clear keys', () => {
    expect(navigateTileSelection(null, 'ArrowRight', 100, 100).tile)
      .toEqual({ x: 50, y: 49 });
    expect(navigateTileSelection({ x: 5, y: 5 }, 'Home', 100, 100).tile)
      .toEqual({ x: 0, y: 0 });
    expect(navigateTileSelection({ x: 5, y: 5 }, 'End', 100, 100).tile)
      .toEqual({ x: 99, y: 99 });
    expect(navigateTileSelection({ x: 5, y: 5 }, 'Escape', 100, 100))
      .toEqual({ handled: true, tile: null });
  });

  it('ignores unrelated keys and invalid grids without changing selection', () => {
    const current = { x: 2, y: 3 };
    expect(navigateTileSelection(current, 'Enter', 10, 10))
      .toEqual({ handled: false, tile: current });
    expect(navigateTileSelection(current, 'ArrowDown', 0, 10))
      .toEqual({ handled: false, tile: current });
  });
});
