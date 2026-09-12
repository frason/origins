import { WORLD_WIDTH, WORLD_HEIGHT } from '../utils/constants';
import type { SimulationConstants } from '../utils/constants';
import { getProducerArchetype } from './producerTypes';
import type { ProducerArchetype } from './producerTypes';
import { createRng } from './rng';
import { SUBSTRATE_TRAITS } from './substrates';

export type Biome =
  | 'ocean'
  | 'desert'
  | 'grassland'
  | 'forest'
  | 'wetland'
  | 'tundra'
  | 'mountain';

export type SubstrateType = 'sand' | 'loam' | 'clay' | 'peat' | 'rock' | 'sediment';

export interface TerrainCell {
  elevation: number;
  moisture: number;
  temperature: number;
  biome: Biome;
  producerArchetype: ProducerArchetype;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

/** Coordinate hash returning a stable value in [0, 1]. */
function coordinateNoise(seed: number, x: number, y: number): number {
  let hash = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) | 0;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff;
}

function valueNoise(
  seed: number,
  x: number,
  y: number,
  scale: number,
  wrapWidth?: number
): number {
  const period = wrapWidth === undefined ? 0 : Math.max(1, Math.ceil(wrapWidth / scale));
  const scaledX = wrapWidth === undefined ? x / scale : x / wrapWidth * period;
  const scaledY = y / scale;
  const x0 = Math.floor(scaledX);
  const y0 = Math.floor(scaledY);
  const tx = smoothstep(scaledX - x0);
  const ty = smoothstep(scaledY - y0);
  const leftX = period > 0 ? ((x0 % period) + period) % period : x0;
  const rightX = period > 0 ? (leftX + 1) % period : x0 + 1;
  const top = coordinateNoise(seed, leftX, y0) * (1 - tx) +
    coordinateNoise(seed, rightX, y0) * tx;
  const bottom =
    coordinateNoise(seed, leftX, y0 + 1) * (1 - tx) +
    coordinateNoise(seed, rightX, y0 + 1) * tx;
  return top * (1 - ty) + bottom * ty;
}

function layeredNoise(seed: number, x: number, y: number, wrapWidth?: number): number {
  return (
    valueNoise(seed, x, y, 32, wrapWidth) * 0.55 +
    valueNoise(seed + 1013, x, y, 16, wrapWidth) * 0.3 +
    valueNoise(seed + 2027, x, y, 8, wrapWidth) * 0.15
  );
}

interface MountainRange {
  baseX: number;
  amplitude: number;
  phase: number;
  frequency: number;
  halfWidth: number;
}

function mountainRanges(seed: number, width: number): MountainRange[] {
  const count = width < 30 ? 1 : 2;
  return Array.from({ length: count }, (_, index) => ({
    baseX: coordinateNoise(seed + 12001, index, 0) * width,
    amplitude: width * (0.07 + coordinateNoise(seed + 12007, index, 1) * 0.09),
    phase: coordinateNoise(seed + 12011, index, 2) * Math.PI * 2,
    frequency: 0.65 + coordinateNoise(seed + 12017, index, 3) * 0.7,
    halfWidth: Math.max(2, width * (0.025 + coordinateNoise(seed + 12023, index, 4) * 0.025)),
  }));
}

/** Wrap a horizontal world coordinate so the eastern and western edges meet. */
export function wrapCoordinate(value: number, size: number): number {
  return ((value % size) + size) % size;
}

/** Shortest horizontal distance on the world's east/west seam. */
export function wrappedDistance(a: number, b: number, size: number): number {
  const distance = Math.abs(a - b);
  return Math.min(distance, size - distance);
}

function rangeCenter(range: MountainRange, y: number, height: number, width: number): number {
  const progress = height <= 1 ? 0.5 : y / (height - 1);
  return wrapCoordinate(
    range.baseX + Math.sin(progress * Math.PI * 2 * range.frequency + range.phase) * range.amplitude,
    width
  );
}

function mountainInfluence(
  ranges: MountainRange[],
  x: number,
  y: number,
  width: number,
  height: number
): number {
  return Math.max(0, ...ranges.map((range) => {
    const distance = wrappedDistance(x, rangeCenter(range, y, height, width), width);
    return Math.exp(-Math.pow(distance / range.halfWidth, 2));
  }));
}

/** Prevailing west-to-east winds dry a bounded region downwind of mountain ranges. */
function rainShadow(
  ranges: MountainRange[],
  x: number,
  y: number,
  width: number,
  height: number
): number {
  const shadowRange = Math.max(4, width * 0.18);
  return Math.max(0, ...ranges.map((range) => {
    const center = rangeCenter(range, y, height, width);
    const eastwardDistance = wrapCoordinate(x - center, width);
    if (eastwardDistance <= range.halfWidth || eastwardDistance >= shadowRange) return 0;
    return 1 - eastwardDistance / shadowRange;
  }));
}

export function classifyBiome(
  elevation: number,
  moisture: number,
  temperature: number
): Biome {
  if (elevation < 0.3) return 'ocean';
  if (elevation > 0.78) return 'mountain';
  if (temperature < 0.24) return 'tundra';
  if (moisture < 0.24) return 'desert';
  if (moisture > 0.72) return 'wetland';
  if (moisture > 0.5) return 'forest';
  return 'grassland';
}

/** Generate smooth deterministic terrain from a world seed. */
export function generateTerrain(width: number, height: number, seed: number): TerrainCell[][] {
  const terrain: TerrainCell[][] = [];
  const ranges = mountainRanges(seed, width);
  for (let y = 0; y < height; y++) {
    const row: TerrainCell[] = [];
    for (let x = 0; x < width; x++) {
      const ridge = mountainInfluence(ranges, x, y, width, height);
      const elevation = clamp01(0.08 + layeredNoise(seed, x, y, width) * 0.72 + ridge * 0.38);
      const moisture = clamp01(
        0.1 + layeredNoise(seed + 4099, x, y, width) * 0.82 -
        rainShadow(ranges, x, y, width, height) * 0.38
      );
      const latitude = height <= 1 ? 0.5 : y / (height - 1);
      const equatorWarmth = 1 - Math.abs(latitude * 2 - 1);
      const temperature = clamp01(
        equatorWarmth * 0.8 +
        layeredNoise(seed + 8191, x, y, width) * 0.2 -
        elevation * 0.18
      );
      const biome = classifyBiome(elevation, moisture, temperature);
      row.push({
        elevation,
        moisture,
        temperature,
        biome,
        producerArchetype: getProducerArchetype(biome),
      });
    }
    terrain.push(row);
  }
  return terrain;
}

/**
 * Interface for intermediate hydrology data during generation.
 */
interface HydrologyCell {
  waterDepth: number;
  salinity: number;
  waterTable: number;
}

/**
 * Fixed neighbor order for stable water routing (ensures determinism).
 * Order: N, NE, E, SE, S, SW, W, NW
 */
function getNeighbors(x: number, y: number, width: number, height: number): Array<[number, number]> {
  const neighbors: Array<[number, number]> = [];
  const dx = [-1, 0, 1, 1, 0, 1, 0, -1]; // x offsets: N, NE, E, SE, S, SW, W, NW
  const dy = [0, 1, 1, 0, 1, -1, -1, -1]; // y offsets
  for (let i = 0; i < 8; i++) {
    const nx = x + dx[i];
    const ny = y + dy[i];
    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
      neighbors.push([nx, ny]);
    }
  }
  return neighbors;
}

/**
 * Generate hydrology: basin detection, water routing, lake placement, and salinity.
 * Static hydrology for V1 (no seasonal changes, evaporation, or flow updates).
 */
export function generateHydrology(
  width: number,
  height: number,
  elevations: number[][],
  seed: number
): HydrologyCell[][] {
  const hydrology: HydrologyCell[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({
      waterDepth: 0,
      salinity: 0,
      waterTable: 0,
    }))
  );

  // Identify ocean cells (very low elevation) as basin outlets
  const oceanCells = new Set<string>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (elevations[y][x] < 0.3) {
        oceanCells.add(`${x},${y}`);
      }
    }
  }

  /**
   * Trace water flow downhill from a cell to find its basin outlet.
   * Returns the outlet coordinates and whether it connects to ocean.
   */
  function traceFlow(startX: number, startY: number): [number, number, boolean] {
    let x = startX;
    let y = startY;
    const visitedInTrace = new Set<string>();

    while (true) {
      const key = `${x},${y}`;
      if (visitedInTrace.has(key)) {
        // Found a cycle (local minimum/lake)
        return [x, y, false];
      }
      visitedInTrace.add(key);

      if (oceanCells.has(key)) {
        return [x, y, true]; // Flows to ocean
      }

      const currentElev = elevations[y][x];
      const neighbors = getNeighbors(x, y, width, height);

      // Find the neighbor with lowest elevation in stable order
      let lowestNeighbor: [number, number] | null = null;
      let lowestElev = currentElev;

      for (const [nx, ny] of neighbors) {
        const neighElev = elevations[ny][nx];
        if (neighElev < lowestElev) {
          lowestElev = neighElev;
          lowestNeighbor = [nx, ny];
        }
      }

      if (lowestNeighbor === null) {
        // This is a local minimum (potential lake)
        return [x, y, false];
      }

      [x, y] = lowestNeighbor;
    }
  }

  // For each cell, trace flow to basin outlet
  const basins: Map<string, Array<[number, number]>> = new Map();
  const basinOceanConnected: Map<string, boolean> = new Map();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (oceanCells.has(`${x},${y}`)) {
        continue; // Skip ocean cells
      }

      const [ox, oy, connectedToOcean] = traceFlow(x, y);
      const outletKey = `${ox},${oy}`;
      if (!basins.has(outletKey)) {
        basins.set(outletKey, []);
        basinOceanConnected.set(outletKey, connectedToOcean);
      }
      basins.get(outletKey)!.push([x, y]);
    }
  }

  // Set waterDepth at local minima (lakes) with noise-based variation
  const rng = createRng(seed + 19993);
  for (const [outletKey, cells] of basins) {
    const [ox, oy] = outletKey.split(',').map(Number) as [number, number];
    const connectedToOcean = basinOceanConnected.get(outletKey) || false;

    // Only place water at outlets that are local minima (not flowing to ocean)
    if (!connectedToOcean && cells.length > 1) {
      const baseDepth = 0.25 + rng() * 0.3; // Vary lake depth 0.25-0.55
      const salinity = 0.1 * rng(); // Inland basins are fresh

      // Set water depth at outlet
      hydrology[oy][ox].waterDepth = baseDepth;
      hydrology[oy][ox].salinity = salinity;

      // Nearby cells in basin also have some water (gradient)
      for (const [cx, cy] of cells) {
        if (cx === ox && cy === oy) continue;
        const distToOutlet = Math.sqrt((cx - ox) ** 2 + (cy - oy) ** 2);
        const maxDist = Math.min(width, height) * 0.15;
        const depthGradient = Math.max(0, 1 - distToOutlet / maxDist);
        hydrology[cy][cx].waterDepth = Math.max(0, baseDepth * depthGradient * 0.4); // Shallow water
        hydrology[cy][cx].salinity = salinity;
      }
    } else if (connectedToOcean) {
      // Ocean-connected basins have salty water
      const baseDepth = 0.15 + rng() * 0.2; // Shallower but saline
      const salinity = 0.7 + rng() * 0.3; // Saline

      hydrology[oy][ox].waterDepth = baseDepth;
      hydrology[oy][ox].salinity = salinity;

      // A few cells in ocean-adjacent basins also get saline water
      for (let i = 0; i < Math.min(cells.length, 5); i++) {
        const [cx, cy] = cells[rng() * cells.length | 0];
        if (!(cx === ox && cy === oy)) {
          hydrology[cy][cx].waterDepth = baseDepth * 0.5;
          hydrology[cy][cx].salinity = salinity;
        }
      }
    }
  }

  // Set waterTable on dry cells from local moisture/drainage
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (hydrology[y][x].waterDepth === 0) {
        // Dry cell: derive waterTable from elevation and neighborhood water
        const neighbors = getNeighbors(x, y, width, height);
        let neighborWater = 0;
        for (const [nx, ny] of neighbors) {
          neighborWater += hydrology[ny][nx].waterDepth;
        }
        const avgNeighborWater = neighborWater / Math.max(1, neighbors.length);

        // Base water table on elevation and nearby water
        const baseTable = 0.5 - elevations[y][x] * 0.4; // Lower elevation = higher water table
        const moistureBoost = avgNeighborWater * 0.5;
        hydrology[y][x].waterTable = clamp01(baseTable + moistureBoost);
      }
    }
  }

  return hydrology;
}

/**
 * Generate substrate types based on elevation, slope, water, temperature, and noise.
 * Uses data-driven substrate tendency table from substrates.ts.
 */
export function generateSubstrate(
  width: number,
  height: number,
  elevations: number[][],
  hydrology: HydrologyCell[][],
  temperatures: number[][],
  seed: number
): SubstrateType[][] {
  const substrateTypes: SubstrateType[] = ['sand', 'loam', 'clay', 'peat', 'rock', 'sediment'];

  const substrate: SubstrateType[][] = Array.from({ length: height }, () =>
    Array(width).fill('loam')
  );

  const rng = createRng(seed + 20011);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const elev = elevations[y][x];
      const temp = temperatures[y][x];
      const water = hydrology[y][x].waterDepth;
      const waterTable = hydrology[y][x].waterTable;
      const salinity = hydrology[y][x].salinity;

      // Calculate local slope
      const neighbors = getNeighbors(x, y, width, height);
      let maxSlope = 0;
      for (const [nx, ny] of neighbors) {
        const dElev = Math.abs(elevations[ny][nx] - elev);
        maxSlope = Math.max(maxSlope, dElev);
      }

      // Score each substrate type based on environmental conditions
      // Using data-driven tendency table
      const scores: Record<SubstrateType, number> = {
        sand: 0,
        loam: 0,
        clay: 0,
        peat: 0,
        rock: 0,
        sediment: 0
      };

      for (const subType of substrateTypes) {
        const traits = SUBSTRATE_TRAITS[subType];
        let score = 0;

        // Data-driven substrate placement using design table tendencies
        // Consult traits table to inform scoring

        // Base: high elevation, high slope -> rock
        if (elev > 0.7) {
          scores.rock = Math.max(scores.rock || 0, (elev - 0.7) * 2 + maxSlope * 1.5);
        }

        // High water depth -> sediment (underwater) or peat (wetland)
        if (water > 0.3) {
          if (elev < 0.4) {
            scores.sediment = Math.max(scores.sediment || 0, water * 2); // Underwater sediment
          } else {
            scores.peat = Math.max(scores.peat || 0, water * 1.5); // Wetland peat
          }
        }

        // High elevation + low water -> sand or rock
        if (elev > 0.55 && water < 0.2) {
          scores.sand = Math.max(scores.sand || 0, (1 - water) * 0.8);
        }

        // High temperature + low elevation -> sand
        if (temp > 0.65 && elev < 0.5) {
          scores.sand = Math.max(scores.sand || 0, (temp - 0.65) * 1.2);
        }

        // Cold + high water + high elevation -> peat
        if (temp < 0.35 && water > 0.2 && elev > 0.5) {
          scores.peat = Math.max(scores.peat || 0, (0.5 - temp) * water);
        }

        // Low elevation + low slope -> clay or loam (settled)
        if (elev < 0.4 && maxSlope < 0.05) {
          if (water > 0.2) {
            scores.clay = Math.max(scores.clay || 0, (1 - elev) * water * 1.2);
          } else {
            scores.loam = Math.max(scores.loam || 0, (1 - elev) * 0.8);
          }
        }

        // Salinity adjusts sediment preference
        if (salinity > 0.5) {
          scores.sediment = Math.max(scores.sediment || 0, salinity * 1.5);
        }
      }

      // Initialize all scores for the per-subtype evaluation
      for (const subType of substrateTypes) {
        scores[subType] = scores[subType] || 0;
      }

      // Add noise for variation and apply trait consultation
      for (const subType of substrateTypes) {
        const traits = SUBSTRATE_TRAITS[subType];
        const noiseVal = valueNoise(seed + 30017, x, y, 8, width);

        // Consult traits table: give bonus to substrates that are good for this condition
        const totalWater = water + waterTable * 0.5;
        if (totalWater > 0.3) {
          scores[subType] += traits.waterRetention * 0.3;
        } else if (totalWater < 0.1) {
          scores[subType] += traits.drainage * 0.2;
        }

        scores[subType] += (noiseVal - 0.5) * 0.5;
      }

      // Select substrate with highest score
      let maxScore = -Infinity;
      let selectedSubstrate: SubstrateType = 'loam';
      for (const subType of substrateTypes) {
        if (scores[subType] > maxScore) {
          maxScore = scores[subType];
          selectedSubstrate = subType;
        }
      }

      substrate[y][x] = selectedSubstrate;
    }
  }

  return substrate;
}

/**
 * Compute solar energy grid with radial dissipation from center.
 *
 * Cells at grid center (50, 50) receive maximum solar energy (BASE_SOLAR_ENERGY).
 * Cells further from center receive less based on powered Euclidean distance.
 *
 * Formula:
 *   cellSolarEnergy = BASE_SOLAR_ENERGY * (1 - normalizedDistance^exponent * edgeFalloff)
 *
 * Where:
 *   - distanceFromCenter: Euclidean distance from cell to grid center (50, 50)
 *   - maxDistance: distance from center to corner ≈ 70.7
 *   - edge falloff controls the center-to-corner contrast
 *   - exponent controls the shape of the habitable core and outer rim
 *
 * All values are clamped to minimum of 1.0 to ensure no cell is completely dark.
 *
 * @param constants - simulation constants including baseSolarEnergy and solarEdgeFalloffFactor
 * @returns 100×100 matrix of solar energy values (deterministic, no randomness)
 */
export function computeSolarEnergyGrid(constants: SimulationConstants): number[][] {
  const {
    worldWidth,
    worldHeight,
    baseSolarEnergy,
    solarEdgeFalloffFactor,
    solarFalloffExponent,
  } = constants;
  const centerX = worldWidth / 2;
  const centerY = worldHeight / 2;
  const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY);
  const MIN_SOLAR_ENERGY = 1;

  const grid: number[][] = [];

  for (let y = 0; y < worldHeight; y++) {
    const row: number[] = [];
    for (let x = 0; x < worldWidth; x++) {
      // Calculate Euclidean distance from this cell to grid center
      const dx = x - centerX;
      const dy = y - centerY;
      const distanceFromCenter = Math.sqrt(dx * dx + dy * dy);

      // Apply radial dissipation formula
      const normalizedDistance = Math.min(1, distanceFromCenter / maxDistance);
      const radialFalloff = Math.pow(normalizedDistance, Math.max(0.1, solarFalloffExponent));
      const solarEnergy = baseSolarEnergy * (1 - radialFalloff * solarEdgeFalloffFactor);

      // Clamp to minimum of 1.0
      row.push(Math.max(solarEnergy, MIN_SOLAR_ENERGY));
    }
    grid.push(row);
  }

  return grid;
}

/**
 * Cell interface representing a single grid cell in the world.
 * Each cell tracks available resources and conditions.
 */
export interface Cell {
  energy: number;
  nutrients: number;
  producerBiomass: number;
  toxicity: number;
  elevation: number;
  moisture: number;
  temperature: number;
  biome: Biome;
  producerArchetype: ProducerArchetype;
  corpseBiomass?: number; // Aggregated biomass from decaying corpses
  decompserActivity?: number; // Decomposer activity rate (0-1)
  substrate: SubstrateType;
  waterDepth: number; // 0 dry; 0..1 shallow to deep
  waterTable: number; // 0..1 subsurface availability on dry cells
  dissolvedNutrients: number;
  salinity: number; // 0 fresh; 1 hypersaline
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
   * If SimulationConstants are provided, cells are initialized with solar energy values.
   * Otherwise, all cells are initialized to zero values.
   *
   * @param width - number of cells horizontally (default: WORLD_WIDTH)
   * @param height - number of cells vertically (default: WORLD_HEIGHT)
   * @param constants - optional simulation constants for solar energy grid initialization
   */
  constructor(
    width: number = WORLD_WIDTH,
    height: number = WORLD_HEIGHT,
    constants?: SimulationConstants,
    seed: number = 0
  ) {
    this._width = width;
    this._height = height;

    // Compute solar energy grid if constants provided, otherwise default to zeros
    const solarGrid = constants ? computeSolarEnergyGrid(constants) : null;

    // Staged generation: terrain -> hydrology -> substrate -> biome
    const terrain = generateTerrain(width, height, seed);

    // Extract elevation and temperature arrays for hydrology/substrate generation
    const elevations = terrain.map((row) => row.map((cell) => cell.elevation));
    const temperatures = terrain.map((row) => row.map((cell) => cell.temperature));

    // Generate hydrology (water depth, salinity, water table)
    const hydrology = generateHydrology(width, height, elevations, seed);

    // Generate substrate types based on physical conditions
    const substrates = generateSubstrate(width, height, elevations, hydrology, temperatures, seed);

    // Re-compute biome based on updated moisture (from water table)
    const updatedTerrain = terrain.map((row, y) =>
      row.map((cell, x) => {
        // Update moisture from water table and water depth
        const newMoisture = Math.max(cell.moisture, hydrology[y][x].waterTable, hydrology[y][x].waterDepth * 0.5);
        const newBiome = classifyBiome(cell.elevation, newMoisture, cell.temperature);
        return {
          ...cell,
          moisture: newMoisture,
          biome: newBiome,
          producerArchetype: getProducerArchetype(newBiome),
        };
      })
    );

    // Initialize grid with solar energy or zeros
    const cellCount = width * height;
    this.cells = new Array(cellCount);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const energy = solarGrid ? solarGrid[y][x] : 0;
        const terrainCell = updatedTerrain[y][x];
        const hydroCell = hydrology[y][x];
        this.cells[index] = {
          energy,
          nutrients: 0,
          producerBiomass: 0,
          toxicity: 0,
          corpseBiomass: 0,
          decompserActivity: 0,
          substrate: substrates[y][x],
          waterDepth: hydroCell.waterDepth,
          waterTable: hydroCell.waterTable,
          dissolvedNutrients: 0,
          salinity: hydroCell.salinity,
          ...terrainCell,
        };
      }
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
      const loadedCell = cells[i];
      // Apply defaults for new substrate/water fields if missing (migration for old saves)
      const moisture = loadedCell.moisture ?? 0.5;
      world.cells[i] = {
        elevation: 0.5,
        moisture,
        temperature: 0.5,
        biome: 'grassland',
        producerArchetype: 'ground-cover',
        substrate: 'loam',
        waterDepth: 0,
        waterTable: moisture,
        dissolvedNutrients: 0,
        salinity: 0,
        ...loadedCell,
      };
    }

    return world;
  }
}
