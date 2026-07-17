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
