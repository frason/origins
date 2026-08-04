import { describe, expect, it } from 'vitest';
import {
  calculateGridLayout,
  navigateTileSelection,
  selectNearbyLivingTile,
  viewportPointToTile,
} from '../ui/worldViewport';

describe('world viewport layout', () => {
  it('fills the entire viewport, stretching cells to a non-square shape when needed', () => {
    const wide = calculateGridLayout(1000, 600, 100, 100);
    expect(wide.cellWidth).toBe(10);
    expect(wide.cellHeight).toBe(6);
    expect(wide.width).toBe(1000);
    expect(wide.height).toBe(600);

    const tall = calculateGridLayout(500, 900, 100, 100);
    expect(tall.cellWidth).toBe(5);
    expect(tall.cellHeight).toBe(9);
    expect(tall.width).toBe(500);
    expect(tall.height).toBe(900);
  });

  it('has no letterboxing offset, since the grid always fills the full viewport', () => {
    expect(calculateGridLayout(1000, 600, 100, 100)).toMatchObject({
      offsetX: 0,
      offsetY: 0,
    });
    expect(calculateGridLayout(500, 900, 100, 100)).toMatchObject({
      offsetX: 0,
      offsetY: 0,
    });
  });

  it('maps full-viewport coordinates to accurate tiles', () => {
    const layout = calculateGridLayout(1000, 600, 100, 100);
    expect(viewportPointToTile(0, 0, layout, 100, 100)).toEqual({ x: 0, y: 0 });
    expect(viewportPointToTile(997, 597, layout, 100, 100)).toEqual({ x: 99, y: 99 });
    expect(viewportPointToTile(505, 303, layout, 100, 100)).toEqual({ x: 50, y: 50 });
  });

  it('ignores clicks outside the viewport bounds', () => {
    const layout = calculateGridLayout(1000, 600, 100, 100);
    expect(viewportPointToTile(-1, 300, layout, 100, 100)).toBeNull();
    expect(viewportPointToTile(1000, 300, layout, 100, 100)).toBeNull();
    expect(viewportPointToTile(300, 600, layout, 100, 100)).toBeNull();
  });

  it('snaps a sparse-life click to the nearest living tile within two cells', () => {
    const creatures = [
      { x: 12, y: 10, lifecycleState: 'alive' as const },
      { x: 11, y: 11, lifecycleState: 'alive' as const },
      { x: 10, y: 11, lifecycleState: 'dead' as const },
    ];

    expect(selectNearbyLivingTile({ x: 10, y: 10 }, creatures)).toEqual({ x: 11, y: 11 });
    expect(selectNearbyLivingTile({ x: 20, y: 20 }, creatures)).toEqual({ x: 20, y: 20 });
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
