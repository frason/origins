/**
 * Canvas 2D Fallback Renderer for Three.js Living World.
 * Provides a reliable 2D alternative when WebGL is unavailable or fails.
 * Renders cells, overlays, creatures, and selection marker.
 */

import { useEffect, useRef, useState } from 'react';
import type { PrototypeWorldSnapshot } from './worldSnapshot';
import {
  cellAt,
  normalizedLayer,
  type SelectedLocation,
  type FocusState,
} from './worldViewModel';
import type { OverlayKey } from '../ui/ThreeWorldLegend';

const BIOME_COLORS: Record<string, string> = {
  ocean: '#398e9e',
  desert: '#c7a65a',
  grassland: '#70a85a',
  forest: '#356b42',
  wetland: '#5d8f7d',
  tundra: '#a8b7ad',
  mountain: '#77776f',
};

interface Canvas2DFallbackProps {
  snapshot: PrototypeWorldSnapshot;
  selected: SelectedLocation;
  onSelect: (location: SelectedLocation) => void;
  activeOverlays?: Set<OverlayKey>;
  showFocusOutline?: boolean;
  focus?: FocusState;
  onFocusLineage?: (lineageId: string) => void;
}

export default function Canvas2DFallback({
  snapshot,
  selected,
  onSelect,
  activeOverlays = new Set(['biomass', 'toxicity']),
  showFocusOutline = false,
  focus,
  onFocusLineage,
}: Canvas2DFallbackProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Focus tracking for accessibility outline
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleFocus = () => setIsFocused(true);
    const handleBlur = () => setIsFocused(false);

    canvas.addEventListener('focus', handleFocus);
    canvas.addEventListener('blur', handleBlur);
    return () => {
      canvas.removeEventListener('focus', handleFocus);
      canvas.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Keyboard navigation support (mirrors ThreeWorldView for accessibility)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const step = 5;
      let newX = selected.x;
      let newY = selected.y;
      let handled = false;

      if (key === 'arrowup') {
        newY = Math.max(0, selected.y - step);
        handled = true;
      } else if (key === 'arrowdown') {
        newY = Math.min(snapshot.world.height - 1, selected.y + step);
        handled = true;
      } else if (key === 'arrowleft') {
        newX = Math.max(0, selected.x - step);
        handled = true;
      } else if (key === 'arrowright') {
        newX = Math.min(snapshot.world.width - 1, selected.x + step);
        handled = true;
      } else if (key === 'home') {
        newX = 0;
        newY = 0;
        handled = true;
      } else if (key === 'end') {
        newX = snapshot.world.width - 1;
        newY = snapshot.world.height - 1;
        handled = true;
      } else if (key === 'escape') {
        canvas.blur();
        handled = true;
      }

      if (handled) {
        event.preventDefault();
        onSelect({ x: newX, y: newY });
      }
    };

    canvas.addEventListener('keydown', handleKeyDown);
    return () => {
      canvas.removeEventListener('keydown', handleKeyDown);
    };
  }, [selected, snapshot.world.width, snapshot.world.height, onSelect]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    // Fill background
    ctx.fillStyle = '#151a1d';
    ctx.fillRect(0, 0, width, height);

    // Compute max values for overlay normalization
    const maxBiomass = Math.max(
      ...snapshot.world.cells.map((c) => c.producerBiomass),
      1,
    );
    const maxEnergy = Math.max(
      ...snapshot.world.cells.map((c) => c.energy),
      1,
    );
    const toxicCells = snapshot.world.cells.filter((c) => c.toxicity > 0.01);
    const maxToxicity = Math.max(...toxicCells.map((c) => c.toxicity), 1);

    // Compute mutation pressure for corpses
    const miasmaPressure = new Map<number, number>();
    if (activeOverlays.has('mutation-pressure')) {
      const corpses = snapshot.creatures.filter((c) => c.lifecycleState !== 'alive');
      corpses.forEach((corpse) => {
        for (let y = 0; y < snapshot.world.height; y++) {
          for (let x = 0; x < snapshot.world.width; x++) {
            const dx = x - corpse.x;
            const dy = y - corpse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 3) {
              const idx = y * snapshot.world.width + x;
              const current = miasmaPressure.get(idx) || 0;
              miasmaPressure.set(idx, Math.max(current, 1 - dist / 3));
            }
          }
        }
      });
    }

    // Compute cell size to fit world in canvas
    const cellWidth = width / snapshot.world.width;
    const cellHeight = height / snapshot.world.height;

    // Draw cells
    snapshot.world.cells.forEach((cell, idx) => {
      const x = cell.x * cellWidth;
      const y = cell.y * cellHeight;

      // Base biome color
      ctx.fillStyle = BIOME_COLORS[cell.biome] || '#777777';
      ctx.fillRect(x, y, cellWidth, cellHeight);

      // Biomass overlay
      if (activeOverlays.has('biomass')) {
        const biomassIntensity = normalizedLayer(cell.producerBiomass, maxBiomass) * 0.32;
        ctx.fillStyle = `rgba(182, 217, 103, ${biomassIntensity})`;
        ctx.fillRect(x, y, cellWidth, cellHeight);
      }

      // Energy overlay
      if (activeOverlays.has('energy')) {
        const energyIntensity = normalizedLayer(cell.energy, maxEnergy) * 0.25;
        ctx.fillStyle = `rgba(255, 237, 78, ${energyIntensity})`;
        ctx.fillRect(x, y, cellWidth, cellHeight);
      }

      // Mutation pressure overlay
      if (activeOverlays.has('mutation-pressure')) {
        const pressure = miasmaPressure.get(idx) || 0;
        ctx.fillStyle = `rgba(255, 214, 89, ${pressure * 0.2})`;
        ctx.fillRect(x, y, cellWidth, cellHeight);
      }

      // Toxicity overlay
      if (activeOverlays.has('toxicity') && cell.toxicity > 0.01) {
        const toxicityIntensity = normalizedLayer(cell.toxicity, maxToxicity) * 0.5;
        ctx.fillStyle = `rgba(220, 91, 67, ${toxicityIntensity})`;
        ctx.fillRect(x, y, cellWidth, cellHeight);
      }

      // Cell borders for legibility
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, cellWidth, cellHeight);
    });

    // Draw corpses
    if (activeOverlays.has('corpse')) {
      snapshot.creatures
        .filter((c) => c.lifecycleState !== 'alive')
        .forEach((corpse) => {
          const x = corpse.x * cellWidth + cellWidth / 2;
          const y = corpse.y * cellHeight + cellHeight / 2;
          const radius = Math.min(cellWidth, cellHeight) * 0.3;

          ctx.fillStyle = '#8b6f55';
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        });
    }

    // Draw living creatures
    snapshot.creatures
      .filter((c) => c.lifecycleState === 'alive')
      .forEach((creature) => {
        const x = creature.x * cellWidth + cellWidth / 2;
        const y = creature.y * cellHeight + cellHeight / 2;
        const radius = Math.min(cellWidth, cellHeight) * 0.2;

        // Species color (simplified: use hash of speciesId)
        const hue = (creature.speciesId.charCodeAt(0) * 137.508) % 360;
        ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

    // Lineage overlay (if enabled) - highlight creatures in the focused lineage
    if (activeOverlays.has('lineage')) {
      const lineageToHighlight = focus?.lineageId ? new Set([focus.lineageId]) : undefined;

      snapshot.creatures
        .filter((c) => c.lifecycleState === 'alive')
        .forEach((creature) => {
          // Only highlight if no focused lineage, or if this creature belongs to the focused lineage
          const shouldHighlight = !lineageToHighlight || lineageToHighlight.has(creature.lineageId);
          if (!shouldHighlight) return;

          const x = creature.x * cellWidth + cellWidth / 2;
          const y = creature.y * cellHeight + cellHeight / 2;
          const ringRadius = Math.min(cellWidth, cellHeight) * 0.35;

          // Draw white ring around highlighted creature
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
          ctx.stroke();
        });
    }

    // Draw selection marker (white rectangle)
    const sx = selected.x * cellWidth;
    const sy = selected.y * cellHeight;
    ctx.strokeStyle = '#ffdd73';
    ctx.lineWidth = 3;
    ctx.strokeRect(sx, sy, cellWidth, cellHeight);

    // Draw habitat overlay (if enabled) - show biome legend
    if (activeOverlays.has('habitat')) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(width - 180, 10, 170, 140);
      ctx.fillStyle = '#ffffff';
      ctx.font = '11px sans-serif';
      ctx.fillText('Biome Legend:', width - 170, 25);
      let offsetY = 40;
      Object.entries(BIOME_COLORS).forEach(([biome, color]) => {
        ctx.fillStyle = color;
        ctx.fillRect(width - 170, offsetY, 12, 12);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(biome, width - 150, offsetY + 11);
        offsetY += 15;
      });
    }
  }, [snapshot, selected, activeOverlays, focus]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const bounds = canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;

    const cellX = Math.floor((x / bounds.width) * snapshot.world.width);
    const cellY = Math.floor((y / bounds.height) * snapshot.world.height);

    onSelect({
      x: Math.max(0, Math.min(cellX, snapshot.world.width - 1)),
      y: Math.max(0, Math.min(cellY, snapshot.world.height - 1)),
    });

    // If lineage overlay is active and user clicked on a creature, focus that lineage
    if (activeOverlays.has('lineage') && onFocusLineage) {
      const cellWidth = bounds.width / snapshot.world.width;
      const cellHeight = bounds.height / snapshot.world.height;
      const creatures = snapshot.creatures.filter((c) => c.lifecycleState === 'alive');

      for (const creature of creatures) {
        const cx = creature.x * cellWidth + cellWidth / 2;
        const cy = creature.y * cellHeight + cellHeight / 2;
        const ringRadius = Math.min(cellWidth, cellHeight) * 0.35;

        // Check if click is within creature's ring
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= ringRadius + 2) {
          // Extra 2px tolerance for easier clicking
          onFocusLineage(creature.lineageId);
          return;
        }
      }
    }
  };

  return (
    <canvas
      ref={canvasRef}
      className="canvas-2d-fallback"
      role="img"
      onClick={handleCanvasClick}
      tabIndex={0}
      aria-label="2D Canvas fallback view of the world (WebGL unavailable). Use arrow keys to navigate, click or tap to select cells. Press Enter or click creatures to follow lineages."
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        cursor: 'crosshair',
        outline: isFocused || showFocusOutline ? '2px solid #ffdd73' : 'none',
        outlineOffset: '2px',
      }}
    />
  );
}
