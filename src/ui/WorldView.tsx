import React, { useRef, useEffect, useState } from 'react';
import { useStore } from '../state/store';
import type { Biome } from '../simulation/world';
import type { ProducerArchetype } from '../simulation/producerTypes';
import {
  calculateGridLayout,
  GridLayout,
  viewportPointToTile,
} from './worldViewport';

/**
 * Rendering constants for the canvas grid
 */
const GRID_WIDTH = 100;
const GRID_HEIGHT = 100;
const MAX_CELL_ENERGY = 100; // Maximum energy per cell for brightness calculation
const MAX_BIOMASS = 50; // Maximum producer biomass for green overlay opacity
const CREATURE_RADIUS = 1; // Radius of creature dots (2px diameter)

const BIOME_COLORS: Record<Biome, [number, number, number]> = {
  ocean: [24, 67, 108],
  desert: [181, 148, 80],
  grassland: [92, 126, 67],
  forest: [42, 91, 55],
  wetland: [54, 104, 91],
  tundra: [139, 153, 151],
  mountain: [105, 101, 96],
};

const PRODUCER_COLORS: Record<ProducerArchetype, [number, number, number]> = {
  'photic-algae': [43, 205, 175],
  'xerophyte-mat': [178, 185, 72],
  'ground-cover': [65, 205, 82],
  'canopy-colony': [20, 145, 55],
  'marsh-biofilm': [69, 190, 126],
  'frost-lichen': [155, 205, 182],
  lithotroph: [196, 126, 70],
};

/**
 * Generate a deterministic color from a species ID using a simple hash function.
 * Returns RGB values for the species color.
 *
 * @param speciesId - unique identifier for the species
 * @returns [r, g, b] color values (0-255)
 */
function getColorFromSpeciesId(speciesId: string): [number, number, number] {
  // Simple hash: sum of character codes
  let hash = 0;
  for (let i = 0; i < speciesId.length; i++) {
    hash = (hash << 5) - hash + speciesId.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Use hash to generate HSL values and convert to RGB
  const hue = Math.abs(hash % 360);
  const saturation = 0.7;
  const lightness = 0.5;

  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - c / 2;

  let r = 0, g = 0, b = 0;

  if (hue < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (hue < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (hue < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (hue < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

/**
 * Extract grid cells from world state.
 * Handles World-like objects with cells array and width/height.
 *
 * @param worldState - the world state from store
 * @returns 2D array of cells [y][x] or null if invalid
 */
function extractGrid(
  worldState: any
): Array<
  Array<{
    energy: number;
    producerBiomass: number;
    toxicity: number;
    biome: Biome;
    producerArchetype: ProducerArchetype;
  }>
> | null {
  if (!worldState) return null;

  // Handle serialized World format (cells as 1D array)
  if (worldState.cells && Array.isArray(worldState.cells) && worldState.width && worldState.height) {
    const grid: Array<
      Array<{
        energy: number;
        producerBiomass: number;
        toxicity: number;
        biome: Biome;
        producerArchetype: ProducerArchetype;
      }>
    > = [];
    for (let y = 0; y < worldState.height; y++) {
      const row: Array<{
        energy: number;
        producerBiomass: number;
        toxicity: number;
        biome: Biome;
        producerArchetype: ProducerArchetype;
      }> = [];
      for (let x = 0; x < worldState.width; x++) {
        const index = y * worldState.width + x;
        const cell = worldState.cells[index];
        row.push({
          energy: cell?.energy ?? 0,
          producerBiomass: cell?.producerBiomass ?? 0,
          toxicity: cell?.toxicity ?? 0,
          biome: cell?.biome ?? 'grassland',
          producerArchetype: cell?.producerArchetype ?? 'ground-cover',
        });
      }
      grid.push(row);
    }
    return grid;
  }

  // Handle 2D grid format
  if (Array.isArray(worldState.grid) && worldState.grid.length > 0) {
    return worldState.grid.map((row: any[]) =>
      row.map((cell: any) => ({
        energy: cell?.energy ?? 0,
        producerBiomass: cell?.producerBiomass ?? 0,
        toxicity: cell?.toxicity ?? 0,
        biome: cell?.biome ?? 'grassland',
        producerArchetype: cell?.producerArchetype ?? 'ground-cover',
      }))
    );
  }

  return null;
}

/**
 * Extract creatures from world state.
 *
 * @param worldState - the world state from store
 * @returns array of creature objects or empty array
 */
function extractCreatures(worldState: any): Array<{
  x: number;
  y: number;
  speciesId: string;
  lifecycleState: 'alive' | 'dead' | 'corpse';
}> {
  if (!worldState) return [];

  if (Array.isArray(worldState.creatures)) {
    return worldState.creatures.map((creature: any) => ({
      x: creature.x ?? 0,
      y: creature.y ?? 0,
      speciesId: creature.speciesId ?? 'unknown',
      lifecycleState: creature.lifecycleState ?? 'alive',
    }));
  }

  return [];
}

/**
 * WorldView: Canvas 2D grid renderer component
 * Renders the 100×100 world grid with color encoding for energy,
 * producer biomass, and creature positions.
 */
const WorldView: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { worldState, tick, setSelectedTile } = useStore();
  const [layout, setLayout] = useState<GridLayout>(() =>
    calculateGridLayout(400, 400, GRID_WIDTH, GRID_HEIGHT)
  );

  /**
   * Handle canvas resize and update cell size
   */
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.parentElement) return;

      const rect = canvas.parentElement.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      canvas.width = width;
      canvas.height = height;
      setLayout(calculateGridLayout(width, height, GRID_WIDTH, GRID_HEIGHT));
    };

    // Initial size
    handleResize();

    const observer = new ResizeObserver(handleResize);
    if (canvasRef.current?.parentElement) observer.observe(canvasRef.current.parentElement);
    return () => observer.disconnect();
  }, []);

  /**
   * Handle canvas click to select a tile
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleCanvasClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const pixelX = event.clientX - rect.left;
      const pixelY = event.clientY - rect.top;

      const tile = viewportPointToTile(pixelX, pixelY, layout, GRID_WIDTH, GRID_HEIGHT);
      if (tile) setSelectedTile(tile);
    };

    canvas.addEventListener('click', handleCanvasClick);
    return () => canvas.removeEventListener('click', handleCanvasClick);
  }, [layout, setSelectedTile]);

  /**
   * Main render loop using requestAnimationFrame
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const render = () => {
      // Clear canvas with black background
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // If no world state, show placeholder
      if (!worldState) {
        ctx.fillStyle = '#666666';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Initializing world…', canvas.width / 2, canvas.height / 2);
        animationId = requestAnimationFrame(render);
        return;
      }

      // Extract grid and creatures from world state
      const grid = extractGrid(worldState);
      const creatures = extractCreatures(worldState);

      if (!grid) {
        ctx.fillStyle = '#666666';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Invalid world state', canvas.width / 2, canvas.height / 2);
        animationId = requestAnimationFrame(render);
        return;
      }

      // Render grid cells
      for (let y = 0; y < grid.length; y++) {
        for (let x = 0; x < grid[y].length; x++) {
          const cell = grid[y][x];
          const pixelX = layout.offsetX + x * layout.cellSize;
          const pixelY = layout.offsetY + y * layout.cellSize;

          // Tint the deterministic biome palette by local energy.
          const energyRatio = Math.min(1, cell.energy / MAX_CELL_ENERGY);
          const brightness = 0.55 + energyRatio * 0.8;
          const [baseR, baseG, baseB] = BIOME_COLORS[cell.biome];
          ctx.fillStyle = `rgb(${Math.min(255, Math.round(baseR * brightness))}, ${Math.min(
            255,
            Math.round(baseG * brightness)
          )}, ${Math.min(255, Math.round(baseB * brightness))})`;
          ctx.fillRect(pixelX, pixelY, layout.cellSize, layout.cellSize);

          // Apply green overlay for producer biomass
          if (cell.producerBiomass > 0) {
            const biomassRatio = Math.min(1, cell.producerBiomass / MAX_BIOMASS);
            const opacity = biomassRatio;

            const [producerR, producerG, producerB] = PRODUCER_COLORS[cell.producerArchetype];
            ctx.fillStyle = `rgba(${producerR}, ${producerG}, ${producerB}, ${opacity})`;
            ctx.fillRect(pixelX, pixelY, layout.cellSize, layout.cellSize);
          }

          // Decaying corpses leave a visible, fading violet ecological scar.
          if (cell.toxicity > 0) {
            const toxicityOpacity = Math.min(0.72, cell.toxicity / 8);
            ctx.fillStyle = `rgba(105, 45, 120, ${toxicityOpacity})`;
            ctx.fillRect(pixelX, pixelY, layout.cellSize, layout.cellSize);
          }
        }
      }

      // Render creatures as colored dots
      for (const creature of creatures) {
        // Ensure coordinates are within bounds
        if (creature.x < 0 || creature.x >= GRID_WIDTH || creature.y < 0 || creature.y >= GRID_HEIGHT) {
          continue;
        }

        const pixelX = layout.offsetX + creature.x * layout.cellSize + layout.cellSize / 2;
        const pixelY = layout.offsetY + creature.y * layout.cellSize + layout.cellSize / 2;

        if (creature.lifecycleState !== 'alive') {
          const corpseSize = Math.max(1.5, layout.cellSize * 0.45);
          ctx.fillStyle = '#8b6f55';
          ctx.fillRect(pixelX - corpseSize / 2, pixelY - corpseSize / 2, corpseSize, corpseSize);
          continue;
        }

        const [r, g, b] = getColorFromSpeciesId(creature.speciesId);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

        ctx.beginPath();
        ctx.arc(pixelX, pixelY, Math.max(CREATURE_RADIUS, layout.cellSize * 0.25), 0, 2 * Math.PI);
        ctx.fill();
      }

      animationId = requestAnimationFrame(render);
    };

    // Start rendering
    animationId = requestAnimationFrame(render);

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [worldState, layout, tick]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: '#000000',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
};

export default WorldView;
