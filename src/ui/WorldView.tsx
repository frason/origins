import React, { useRef, useEffect, useState } from 'react';
import { useStore } from '../state/store';

/**
 * Rendering constants for the canvas grid
 */
const GRID_WIDTH = 100;
const GRID_HEIGHT = 100;
const MAX_CELL_ENERGY = 100; // Maximum energy per cell for brightness calculation
const MAX_BIOMASS = 50; // Maximum producer biomass for green overlay opacity
const CREATURE_RADIUS = 1; // Radius of creature dots (2px diameter)

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
): Array<Array<{ energy: number; producerBiomass: number }>> | null {
  if (!worldState) return null;

  // Handle serialized World format (cells as 1D array)
  if (worldState.cells && Array.isArray(worldState.cells) && worldState.width && worldState.height) {
    const grid: Array<Array<{ energy: number; producerBiomass: number }>> = [];
    for (let y = 0; y < worldState.height; y++) {
      const row: Array<{ energy: number; producerBiomass: number }> = [];
      for (let x = 0; x < worldState.width; x++) {
        const index = y * worldState.width + x;
        const cell = worldState.cells[index];
        row.push({
          energy: cell?.energy ?? 0,
          producerBiomass: cell?.producerBiomass ?? 0,
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
}> {
  if (!worldState) return [];

  if (Array.isArray(worldState.creatures)) {
    return worldState.creatures.map((creature: any) => ({
      x: creature.x ?? 0,
      y: creature.y ?? 0,
      speciesId: creature.speciesId ?? 'unknown',
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
  const { worldState, tick } = useStore();
  const [cellSize, setCellSize] = useState(4);

  /**
   * Handle canvas resize and update cell size
   */
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.parentElement) return;

      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;

      // Calculate cell size based on canvas width
      const calculatedCellSize = Math.floor(canvas.width / GRID_WIDTH);
      setCellSize(Math.max(1, calculatedCellSize));
    };

    // Initial size
    handleResize();

    // Resize listener
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
          const pixelX = x * cellSize;
          const pixelY = y * cellSize;

          // Calculate background color based on energy
          // HSL lightness = energy / MAX_CELL_ENERGY * 100%
          const energyRatio = Math.min(1, cell.energy / MAX_CELL_ENERGY);
          const lightness = energyRatio * 100;

          // Draw cell background (neutral hue, varied lightness)
          ctx.fillStyle = `hsl(0, 0%, ${lightness}%)`;
          ctx.fillRect(pixelX, pixelY, cellSize, cellSize);

          // Apply green overlay for producer biomass
          if (cell.producerBiomass > 0) {
            const biomassRatio = Math.min(1, cell.producerBiomass / MAX_BIOMASS);
            const opacity = biomassRatio;

            // Semi-transparent green overlay
            ctx.fillStyle = `rgba(0, 200, 0, ${opacity})`;
            ctx.fillRect(pixelX, pixelY, cellSize, cellSize);
          }
        }
      }

      // Render creatures as colored dots
      for (const creature of creatures) {
        // Ensure coordinates are within bounds
        if (creature.x < 0 || creature.x >= GRID_WIDTH || creature.y < 0 || creature.y >= GRID_HEIGHT) {
          continue;
        }

        const [r, g, b] = getColorFromSpeciesId(creature.speciesId);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

        const pixelX = creature.x * cellSize + cellSize / 2;
        const pixelY = creature.y * cellSize + cellSize / 2;

        ctx.beginPath();
        ctx.arc(pixelX, pixelY, CREATURE_RADIUS, 0, 2 * Math.PI);
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
  }, [worldState, cellSize, tick]);

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
