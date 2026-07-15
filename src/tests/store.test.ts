/**
 * Unit tests for Zustand state store
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../state/store';
import { SIMULATION_CONSTANTS } from '../utils/constants';

describe('Store (Zustand)', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useStore.setState({
      worldState: null,
      tick: 0,
      isRunning: false,
      speed: 1,
      speciesList: [],
      constants: { ...SIMULATION_CONSTANTS },
      selectedTile: null,
    });
  });

  describe('updateConstants', () => {
    it('should merge partial constant overrides into the store', () => {
      const store = useStore.getState();
      const originalBaseMetabolism = store.constants.baseMetabolism;
      const newFeedingEfficiency = 0.9;
      const newBaseSolarEnergy = 15;

      // Call updateConstants with partial overrides
      store.updateConstants({
        feedingEfficiency: newFeedingEfficiency,
        baseSolarEnergy: newBaseSolarEnergy,
      });

      // Get updated state
      const updatedState = useStore.getState();

      // Verify overridden values
      expect(updatedState.constants.feedingEfficiency).toBe(newFeedingEfficiency);
      expect(updatedState.constants.baseSolarEnergy).toBe(newBaseSolarEnergy);

      // Verify non-overridden values remain unchanged
      expect(updatedState.constants.baseMetabolism).toBe(originalBaseMetabolism);

      // Verify all other constants are still present
      expect(updatedState.constants.worldWidth).toBe(SIMULATION_CONSTANTS.worldWidth);
      expect(updatedState.constants.reproductionEnergyCost).toBe(
        SIMULATION_CONSTANTS.reproductionEnergyCost
      );
    });

    it('should preserve all constants when applying partial override', () => {
      const store = useStore.getState();

      // Get baseline
      const baselineConstantKeys = Object.keys(store.constants).sort();

      // Apply a partial override
      store.updateConstants({ baseMetabolism: 5 });

      // Verify all keys still exist
      const updatedConstantKeys = Object.keys(useStore.getState().constants).sort();
      expect(updatedConstantKeys).toEqual(baselineConstantKeys);
    });

    it('should allow multiple successive overrides', () => {
      const store = useStore.getState();

      // First override
      store.updateConstants({ baseSolarEnergy: 20 });
      expect(useStore.getState().constants.baseSolarEnergy).toBe(20);

      // Second override on different field
      store.updateConstants({ feedingEfficiency: 0.75 });
      expect(useStore.getState().constants.feedingEfficiency).toBe(0.75);

      // First override should still be active
      expect(useStore.getState().constants.baseSolarEnergy).toBe(20);
    });
  });

  describe('other store actions', () => {
    it('should set world state', () => {
      const store = useStore.getState();
      const mockWorldState = { test: 'data' } as any;

      store.setWorldState(mockWorldState);

      expect(useStore.getState().worldState).toEqual(mockWorldState);
    });

    it('should set tick', () => {
      const store = useStore.getState();

      store.setTick(42);

      expect(useStore.getState().tick).toBe(42);
    });

    it('should set running state', () => {
      const store = useStore.getState();

      store.setRunning(true);
      expect(useStore.getState().isRunning).toBe(true);

      store.setRunning(false);
      expect(useStore.getState().isRunning).toBe(false);
    });

    it('should set speed with minimum threshold', () => {
      const store = useStore.getState();

      store.setSpeed(2);
      expect(useStore.getState().speed).toBe(2);

      // Speed below 0.1 should be clamped to 0.1
      store.setSpeed(0.05);
      expect(useStore.getState().speed).toBe(0.1);
    });

    it('should set and clear selected tile', () => {
      const store = useStore.getState();

      // Set a selected tile
      store.setSelectedTile({ x: 25, y: 50 });
      expect(useStore.getState().selectedTile).toEqual({ x: 25, y: 50 });

      // Set a different tile
      store.setSelectedTile({ x: 75, y: 10 });
      expect(useStore.getState().selectedTile).toEqual({ x: 75, y: 10 });

      // Clear selected tile
      store.setSelectedTile(null);
      expect(useStore.getState().selectedTile).toBeNull();
    });
  });
});
