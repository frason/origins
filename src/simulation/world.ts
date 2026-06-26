import { WORLD_WIDTH, WORLD_HEIGHT } from '../utils/constants';

/**
 * Cell interface representing a single grid cell in the world.
 * Each cell tracks available resources and conditions.
 */
export interface Cell {
  energy: number;
  nutrients: number;
  producerBiomass: number;
  toxicity: number;
}

/**
 * World class representing the 100×100 grid spatial foundation of the simulation.
 * Manages cell state and provides methods for reading/writing cell data.
 */
export class World {
  private cells: Cell[];
  private _width: number;
  private _height: number;

  /**
   * Initialize a world with the given dimensions.
   * All cells are initialized to zero values.
   *
   * @param width - number of cells horizontally (default: WORLD_WIDTH)
   * @param height - number of cells vertically (default: WORLD_HEIGHT)
   */
  constructor(width: number = WORLD_WIDTH, height: number = WORLD_HEIGHT) {
    this._width = width;
    this._height = height;

    // Initialize grid with all cells at zero
    const cellCount = width * height;
    this.cells = new Array(cellCount);
    for (let i = 0; i < cellCount; i++) {
      this.cells[i] = {
        energy: 0,
        nutrients: 0,
        producerBiomass: 0,
        toxicity: 0,
      };
    }
  }

  /**
   * Get the readonly width property.
   */
  get width(): number {
    return this._width;
  }

  /**
   * Get the readonly height property.
   */
  get height(): number {
    return this._height;
  }

  /**
   * Convert a 2D coordinate to a 1D array index.
   * Validates bounds and throws if out of range.
   *
   * @param x - horizontal coordinate
   * @param y - vertical coordinate
   * @returns 1D array index
   * @throws if coordinates are out of bounds
   */
  private getIndex(x: number, y: number): number {
    if (x < 0 || x >= this._width || y < 0 || y >= this._height) {
      throw new Error(
        `Cell access out of bounds: x=${x}, y=${y} (world size: ${this._width}×${this._height})`
      );
    }
    return y * this._width + x;
  }

  /**
   * Get a cell by coordinates.
   *
   * @param x - horizontal coordinate
   * @param y - vertical coordinate
   * @returns the Cell at (x, y)
   * @throws if coordinates are out of bounds
   */
  getCell(x: number, y: number): Cell {
    const index = this.getIndex(x, y);
    // Return a copy to prevent external mutation
    return { ...this.cells[index] };
  }

  /**
   * Update a cell by coordinates, merging the provided partial cell data.
   * Only updates fields that are present in the partial object.
   *
   * @param x - horizontal coordinate
   * @param y - vertical coordinate
   * @param cell - partial cell object with fields to update
   * @throws if coordinates are out of bounds
   */
  setCell(x: number, y: number, cell: Partial<Cell>): void {
    const index = this.getIndex(x, y);
    // Merge provided fields with existing cell
    this.cells[index] = {
      ...this.cells[index],
      ...cell,
    };
  }

  /**
   * Serialize the entire world to a JSON-compatible object.
   *
   * @returns a snapshot of the world state
   */
  toJSON(): object {
    return {
      width: this._width,
      height: this._height,
      cells: this.cells.map((cell) => ({ ...cell })),
    };
  }

  /**
   * Reconstruct a World from a JSON snapshot.
   * The snapshot should have been created by toJSON().
   *
   * @param data - JSON object containing world state
   * @returns reconstructed World instance
   * @throws if data format is invalid
   */
  static fromJSON(data: any): World {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid world JSON: expected object');
    }

    const { width, height, cells } = data;

    if (
      typeof width !== 'number' ||
      typeof height !== 'number' ||
      !Array.isArray(cells)
    ) {
      throw new Error(
        'Invalid world JSON: missing or invalid width, height, or cells'
      );
    }

    if (cells.length !== width * height) {
      throw new Error(
        `Invalid world JSON: cell count (${cells.length}) does not match dimensions (${width}×${height})`
      );
    }

    // Create a world and populate cells directly
    const world = new World(width, height);
    for (let i = 0; i < cells.length; i++) {
      world.cells[i] = { ...cells[i] };
    }

    return world;
  }
}
