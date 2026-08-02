export interface GridLayout {
  cellSize: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export function calculateGridLayout(
  viewportWidth: number,
  viewportHeight: number,
  columns: number,
  rows: number
): GridLayout {
  if (viewportWidth <= 0 || viewportHeight <= 0 || columns <= 0 || rows <= 0) {
    return { cellSize: 0, offsetX: 0, offsetY: 0, width: 0, height: 0 };
  }

  const cellSize = Math.min(viewportWidth / columns, viewportHeight / rows);
  const width = cellSize * columns;
  const height = cellSize * rows;
  return {
    cellSize,
    width,
    height,
    offsetX: (viewportWidth - width) / 2,
    offsetY: (viewportHeight - height) / 2,
  };
}

export function viewportPointToTile(
  x: number,
  y: number,
  layout: GridLayout,
  columns: number,
  rows: number
): { x: number; y: number } | null {
  if (
    layout.cellSize <= 0 ||
    x < layout.offsetX ||
    y < layout.offsetY ||
    x >= layout.offsetX + layout.width ||
    y >= layout.offsetY + layout.height
  ) {
    return null;
  }

  const tileX = Math.floor((x - layout.offsetX) / layout.cellSize);
  const tileY = Math.floor((y - layout.offsetY) / layout.cellSize);
  return tileX < columns && tileY < rows ? { x: tileX, y: tileY } : null;
}

export interface TileSelection {
  x: number;
  y: number;
}

export interface SelectableCreature {
  x: number;
  y: number;
  lifecycleState: 'alive' | 'dead' | 'corpse';
}

/**
 * Make sparse, one-pixel organisms selectable without changing what a normal
 * tile click means. Exact occupied tiles always win; otherwise the nearest
 * living creature in a small, deterministic tile radius is selected.
 */
export function selectNearbyLivingTile(
  requested: TileSelection,
  creatures: readonly SelectableCreature[],
  radius: number = 2
): TileSelection {
  const candidate = creatures
    .filter((creature) => creature.lifecycleState === 'alive')
    .map((creature) => ({
      x: creature.x,
      y: creature.y,
      distance: Math.max(Math.abs(creature.x - requested.x), Math.abs(creature.y - requested.y)),
    }))
    .filter((creature) => creature.distance <= radius)
    .sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x)[0];
  return candidate ? { x: candidate.x, y: candidate.y } : requested;
}

export interface TileNavigationResult {
  handled: boolean;
  tile: TileSelection | null;
}

/** Translate keyboard intent into the same bounded tile selection used by pointer input. */
export function navigateTileSelection(
  current: TileSelection | null,
  key: string,
  columns: number,
  rows: number
): TileNavigationResult {
  if (columns <= 0 || rows <= 0) return { handled: false, tile: current };
  if (key === 'Escape') return { handled: true, tile: null };
  if (key === 'Home') return { handled: true, tile: { x: 0, y: 0 } };
  if (key === 'End') return { handled: true, tile: { x: columns - 1, y: rows - 1 } };
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) {
    return { handled: false, tile: current };
  }

  const origin = current ?? {
    x: Math.floor((columns - 1) / 2),
    y: Math.floor((rows - 1) / 2),
  };
  const dx = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
  const dy = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
  return {
    handled: true,
    tile: {
      x: Math.max(0, Math.min(columns - 1, origin.x + dx)),
      y: Math.max(0, Math.min(rows - 1, origin.y + dy)),
    },
  };
}
