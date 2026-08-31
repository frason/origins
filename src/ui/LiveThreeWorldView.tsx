import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import ThreeWorldView from '../prototype/ThreeWorldView';
import type { PrototypeWorldSnapshot } from '../prototype/worldSnapshot';
import { toPrototypeWorldSnapshot, validatePrototypeWorldSnapshot } from '../prototype/worldSnapshot';
import { useStore } from '../state/store';
import type { PrototypeDirection, SelectedLocation } from '../prototype/worldViewModel';
import type { OverlayKey } from './ThreeWorldLegend';
import '../styles/prototype-world-views.css';

/**
 * LiveThreeWorldView integrates the prototype Three.js renderer with the live simulation.
 * It converts the engine state to PrototypeWorldSnapshot on each update and maintains
 * selection synchronization with the 2D fallback view.
 */
export default function LiveThreeWorldView() {
  const { worldState, tick, selectedTile, setSelectedTile } = useStore();
  const [direction, setDirection] = useState<PrototypeDirection>('isometric');
  const [focusNonce, setFocusNonce] = useState(0);
  const [activeOverlays, setActiveOverlays] = useState<Set<OverlayKey>>(
    new Set(['biomass', 'toxicity'])
  );
  const [useFallbackRender, setUseFallbackRender] = useState(false);
  const snapshotRef = useRef<PrototypeWorldSnapshot | null>(null);

  // Convert world state to snapshot on each update, avoiding repeated work
  const snapshot = useMemo(() => {
    if (!worldState) return null;

    try {
      // Create a minimal object that has the structure expected by toPrototypeWorldSnapshot
      const engineLike = {
        seed: (worldState as any).seed ?? 12345,
        tick,
        world: {
          width: worldState.width,
          height: worldState.height,
          cells: worldState.cells,
          getCell: (x: number, y: number) => {
            if (x < 0 || x >= worldState.width || y < 0 || y >= worldState.height) {
              return {
                biome: 'grassland' as const,
                elevation: 0,
                moisture: 0.5,
                temperature: 20,
                producerBiomass: 0,
                toxicity: 0,
                energy: 0,
              };
            }
            return worldState.cells[y * worldState.width + x];
          },
        },
        creatures: worldState.creatures,
        events: (worldState as any).events ?? [],
      };

      const snap = toPrototypeWorldSnapshot(engineLike as any);
      validatePrototypeWorldSnapshot(snap);
      snapshotRef.current = snap;
      return snap;
    } catch (error) {
      console.error('Failed to convert world state to snapshot:', error);
      return snapshotRef.current ?? null;
    }
  }, [worldState, tick]);

  // Convert selected tile to SelectedLocation for Three.js view
  const selected: SelectedLocation = useMemo(() => {
    if (!selectedTile) {
      return { x: 50, y: 50 }; // Default center position
    }
    return { x: selectedTile.x, y: selectedTile.y };
  }, [selectedTile]);

  // Synchronize Three.js selection with store
  const handleSelect = useCallback((location: SelectedLocation) => {
    setSelectedTile({ x: location.x, y: location.y });
  }, [setSelectedTile]);

  // Handle overlay toggle
  const handleOverlayToggle = useCallback((key: OverlayKey) => {
    setActiveOverlays((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Handle fallback renderer activation
  const handleFallback = useCallback((enabled: boolean) => {
    setUseFallbackRender(enabled);
  }, []);

  // Keyboard navigation through arrow keys (accessibility)
  const handleKeyboardNavigation = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!snapshot) return;

    const step = 5;
    let newX = selected.x;
    let newY = selected.y;
    let handled = false;

    switch (event.key.toLowerCase()) {
      case 'arrowup':
        newY = Math.max(0, selected.y - step);
        handled = true;
        break;
      case 'arrowdown':
        newY = Math.min(snapshot.world.height - 1, selected.y + step);
        handled = true;
        break;
      case 'arrowleft':
        newX = Math.max(0, selected.x - step);
        handled = true;
        break;
      case 'arrowright':
        newX = Math.min(snapshot.world.width - 1, selected.x + step);
        handled = true;
        break;
      case 'home':
        newX = 0;
        newY = 0;
        handled = true;
        break;
      case 'end':
        newX = snapshot.world.width - 1;
        newY = snapshot.world.height - 1;
        handled = true;
        break;
      case 'escape':
        event.currentTarget.blur();
        handled = true;
        break;
    }

    if (handled) {
      event.preventDefault();
      handleSelect({ x: newX, y: newY });
    }
  }, [snapshot, selected, handleSelect]);

  if (!snapshot) {
    return (
      <div className="live-three-world-view live-three-world-view--loading">
        <div className="live-three-world-view__status">Loading ecosystem…</div>
      </div>
    );
  }

  return (
    <div
      className="live-three-world-view"
      onKeyDown={handleKeyboardNavigation}
      tabIndex={0}
      role="application"
      aria-roledescription="interactive ecosystem 3D world"
      aria-describedby="world-keyboard-instructions"
      aria-label={`Living World at tick ${tick}`}
    >
      <div id="world-keyboard-instructions" className="sr-only">
        Arrow keys navigate the map. Home selects the top-left tile. End selects the bottom-right tile. Escape returns focus outside the world.
      </div>
      <ThreeWorldView
        direction={direction}
        snapshot={snapshot}
        selected={selected}
        onSelect={handleSelect}
        onMetrics={() => {
          // Performance metrics could be logged here if needed
        }}
        focusNonce={focusNonce}
        activeOverlays={activeOverlays}
        onOverlayToggle={handleOverlayToggle}
        useFallbackRender={useFallbackRender}
        onFallback={handleFallback}
      />
    </div>
  );
}
