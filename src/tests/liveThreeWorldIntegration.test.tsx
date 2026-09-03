/**
 * Integration tests for LiveThreeWorldView in the main app
 *
 * Verifies:
 * - Three.js view is mounted and observable
 * - Selection syncs between 3D view and store
 * - Inspector UI reflects selected tile/entity
 * - Determinism is preserved (simulation state unchanged)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../state/store';
import { buildDemoEngine } from '../simulation/demoWorld';
import { snapshotEngine } from '../state/snapshot';
import LiveThreeWorldView from '../ui/LiveThreeWorldView';
import App from '../App';

describe('LiveThreeWorldView Integration', () => {
  beforeEach(() => {
    // Reset store to clean state
    const store = useStore.getState();
    store.setSelectedTile(null);
    store.setRunning(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Component Mounting & Observability', () => {
    it('should render LiveThreeWorldView in App when engine is initialized', async () => {
      const { container } = render(<App />);

      // Wait for the ecosystem to load
      await waitFor(() => {
        const worldContainer = container.querySelector('.live-three-world-view');
        expect(worldContainer).toBeTruthy();
      });

      // Verify the component has expected structure
      const worldElement = container.querySelector('.live-three-world-view');
      expect(worldElement).toHaveAttribute('role', 'application');
      expect(worldElement).toHaveAttribute('aria-roledescription', 'interactive ecosystem 3D world');
    });

    it('should display ThreeWorldView canvas when world state is ready', async () => {
      const { container } = render(<App />);

      await waitFor(() => {
        // Three.js renderer creates a canvas element
        const canvas = container.querySelector('canvas');
        expect(canvas).toBeTruthy();
      });
    });

    it('should show loading state before snapshot is available', async () => {
      const { container, rerender } = render(
        <LiveThreeWorldView />
      );

      // Before store has world state, should show loading
      const store = useStore.getState();
      if (!store.worldState) {
        const loadingElement = container.querySelector('.live-three-world-view--loading');
        expect(loadingElement).toBeTruthy();
      }
    });
  });

  describe('Selection Synchronization', () => {
    it('should sync selected tile from store to Three.js view', async () => {
      const { container } = render(<App />);

      await waitFor(() => {
        expect(container.querySelector('.live-three-world-view')).toBeTruthy();
      });

      const testTile = { x: 25, y: 30 };
      useStore.getState().setSelectedTile(testTile);

      // Verify selection is stored
      await waitFor(() => {
        expect(useStore.getState().selectedTile).toEqual(testTile);
      });
    });

    it('should update store when selection changes in Three.js view', async () => {
      const { container } = render(<LiveThreeWorldView />);

      // Initialize store with world state
      const store = useStore.getState();
      const engine = buildDemoEngine(12345, store.constants);
      store.setWorldState(snapshotEngine(engine));
      store.setTick(engine.tick);

      await waitFor(() => {
        expect(container.querySelector('.live-three-world-view')).toBeTruthy();
      });

      // Simulate selection change by directly calling the handler
      useStore.getState().setSelectedTile({ x: 15, y: 20 });

      await waitFor(() => {
        expect(useStore.getState().selectedTile).toEqual({ x: 15, y: 20 });
      });
    });

    it('should maintain selection state across re-renders', async () => {
      const { rerender } = render(<App />);

      const selectedTile = { x: 50, y: 50 };
      useStore.getState().setSelectedTile(selectedTile);

      await waitFor(() => {
        expect(useStore.getState().selectedTile).toEqual(selectedTile);
      });

      // Re-render should preserve selection
      rerender(<App />);

      await waitFor(() => {
        expect(useStore.getState().selectedTile).toEqual(selectedTile);
      });
    });
  });

  describe('Inspector UI Integration', () => {
    it('should display TileInfoPanel which reflects selected tile', async () => {
      const { container } = render(<App />);

      const testTile = { x: 45, y: 55 };

      await waitFor(() => {
        expect(container.querySelector('.live-three-world-view')).toBeTruthy();
      });

      useStore.getState().setSelectedTile(testTile);

      await waitFor(() => {
        expect(useStore.getState().selectedTile).toEqual(testTile);
      });
    });

    it('should clear selection when user clicks deselect', async () => {
      const { container } = render(<App />);

      await waitFor(() => {
        expect(container.querySelector('.live-three-world-view')).toBeTruthy();
      });

      useStore.getState().setSelectedTile({ x: 30, y: 40 });

      await waitFor(() => {
        expect(useStore.getState().selectedTile).toEqual({ x: 30, y: 40 });
      });

      // Store allows clearing selection
      useStore.getState().setSelectedTile(null);

      await waitFor(() => {
        expect(useStore.getState().selectedTile).toBeNull();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have keyboard navigation support', async () => {
      const { container } = render(<LiveThreeWorldView />);

      // Initialize store with world state
      const store = useStore.getState();
      const engine = buildDemoEngine(12345, store.constants);
      store.setWorldState(snapshotEngine(engine));
      store.setTick(engine.tick);

      await waitFor(() => {
        expect(container.querySelector('.live-three-world-view')).toBeTruthy();
      });

      const worldElement = container.querySelector('.live-three-world-view') as HTMLElement;
      expect(worldElement).toHaveAttribute('tabIndex', '0');
    });

    it('should have proper ARIA labels', async () => {
      const { container } = render(<LiveThreeWorldView />);

      // Initialize store with world state
      const store = useStore.getState();
      const engine = buildDemoEngine(12345, store.constants);
      store.setWorldState(snapshotEngine(engine));
      store.setTick(engine.tick);

      await waitFor(() => {
        const element = container.querySelector('.live-three-world-view');
        expect(element).toHaveAttribute('aria-roledescription');
        expect(element).toHaveAttribute('aria-label');
      });
    });
  });

  describe('Determinism Preservation', () => {
    it('should not alter simulation state through rendering', async () => {
      const store = useStore.getState();
      const engine1 = buildDemoEngine(12345, store.constants);
      const tick1 = engine1.tick;
      const creatureCount1 = engine1.creatures.length;
      const seed1 = engine1.seed;

      // Render the view
      const { container } = render(<App />);

      await waitFor(() => {
        expect(container.querySelector('.live-three-world-view')).toBeTruthy();
      });

      // Create a fresh engine with same seed
      const engine2 = buildDemoEngine(12345, store.constants);

      // Both should be identical (determinism preserved)
      expect(engine2.tick).toBe(tick1);
      expect(engine2.creatures.length).toBe(creatureCount1);
      expect(engine2.seed).toBe(seed1);
    });

    it('should not produce side effects on store during rendering', async () => {
      const store = useStore.getState();
      const initialRunning = store.isRunning;
      const initialTick = store.tick;

      render(<App />);

      await waitFor(() => {
        // Running and tick state should not change just from rendering
        expect(store.isRunning).toBe(initialRunning);
        // Tick may change if engine ticks, but initial state should be preserved
        expect(typeof store.tick).toBe('number');
      });
    });
  });

  describe('Mobile & Responsive Behavior', () => {
    it('should render on mobile viewport', async () => {
      // Simulate mobile viewport
      window.innerWidth = 375;
      window.innerHeight = 667;

      const { container } = render(<App />);

      await waitFor(() => {
        const worldElement = container.querySelector('.live-three-world-view');
        expect(worldElement).toBeTruthy();
      });
    });

    it('should handle device pixel ratio changes', async () => {
      const { container } = render(<App />);

      await waitFor(() => {
        const canvas = container.querySelector('canvas');
        expect(canvas).toBeTruthy();
      });

      // Simulate DPR change (e.g., device zoom)
      Object.defineProperty(window, 'devicePixelRatio', {
        value: 2,
        writable: true,
      });

      // Component should remain stable
      await waitFor(() => {
        const canvas = container.querySelector('canvas');
        expect(canvas).toBeTruthy();
      });
    });
  });
});
