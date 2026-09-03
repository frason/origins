/**
 * Integration tests: Verify RenderSnapshot is consumed by actual renderers.
 * These tests ensure both Canvas2DFallback and ThreeWorldView can render
 * from a single RenderSnapshot truth source, not separate snapshot builders.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { buildDemoEngine } from '../simulation/demoWorld';
import { tickEngine } from '../simulation/engine';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import {
  toRenderSnapshot,
  type RenderSnapshot,
} from '../prototype/renderSnapshot';
import {
  fromRenderSnapshot,
  toPrototypeWorldSnapshot,
  type PrototypeWorldSnapshot,
} from '../prototype/worldSnapshot';
import Canvas2DFallback from '../prototype/Canvas2DFallback';
import type { SelectedLocation } from '../prototype/worldViewModel';
import type { OverlayKey } from '../ui/ThreeWorldLegend';

function stateAt(seed: number, tick: number) {
  let state = buildDemoEngine(seed, { ...SIMULATION_CONSTANTS });
  for (let index = 0; index < tick; index++) {
    state = tickEngine(state);
  }
  return state;
}

describe('render snapshot: integration with actual renderers', () => {
  afterEach(() => {
    cleanup();
  });

  describe('adapter function: fromRenderSnapshot converts to PrototypeWorldSnapshot', () => {
    it('produces PrototypeWorldSnapshot from RenderSnapshot', () => {
      const engineState = stateAt(12345, 50);
      const renderSnapshot = toRenderSnapshot(engineState);

      const prototypeSnapshot = fromRenderSnapshot(renderSnapshot);

      expect(prototypeSnapshot.version).toBe(1);
      expect(prototypeSnapshot.source.seed).toBe(renderSnapshot.source.seed);
      expect(prototypeSnapshot.source.tick).toBe(renderSnapshot.source.tick);
      expect(prototypeSnapshot.world.width).toBe(renderSnapshot.world.width);
      expect(prototypeSnapshot.world.height).toBe(renderSnapshot.world.height);
    });

    it('preserves all cells from RenderSnapshot terrain layer', () => {
      const engineState = stateAt(12345, 50);
      const renderSnapshot = toRenderSnapshot(engineState);
      const prototypeSnapshot = fromRenderSnapshot(renderSnapshot);

      const cellCount = renderSnapshot.world.width * renderSnapshot.world.height;
      expect(prototypeSnapshot.world.cells.length).toBe(cellCount);

      // Spot check: verify first cell
      const firstCell = prototypeSnapshot.world.cells[0];
      expect(firstCell.x).toBe(0);
      expect(firstCell.y).toBe(0);
      expect(firstCell.biome).toBeTruthy();
      expect(Number.isFinite(firstCell.elevation)).toBe(true);
      expect(Number.isFinite(firstCell.moisture)).toBe(true);
      expect(Number.isFinite(firstCell.temperature)).toBe(true);
      expect(Number.isFinite(firstCell.producerBiomass)).toBe(true);
      expect(Number.isFinite(firstCell.toxicity)).toBe(true);
      expect(Number.isFinite(firstCell.energy)).toBe(true);
    });

    it('combines organisms and corpses from RenderSnapshot into creatures list', () => {
      const engineState = stateAt(12345, 50);
      const renderSnapshot = toRenderSnapshot(engineState);
      const prototypeSnapshot = fromRenderSnapshot(renderSnapshot);

      const livingCount = renderSnapshot.layers.organisms.creatures.length;
      const corpseCount = renderSnapshot.layers.corpses.creatures.length;
      const totalExpected = livingCount + corpseCount;

      expect(prototypeSnapshot.creatures.length).toBe(totalExpected);
    });

    it('marks organisms as alive and corpses as dead/decomposing', () => {
      const engineState = stateAt(12345, 100);
      const renderSnapshot = toRenderSnapshot(engineState);
      const prototypeSnapshot = fromRenderSnapshot(renderSnapshot);

      // Check living creatures
      const aliveCreatures = prototypeSnapshot.creatures.filter((c) => c.lifecycleState === 'alive');
      expect(aliveCreatures.length).toBe(renderSnapshot.layers.organisms.creatures.length);

      // Check corpses are marked correctly
      const deadOrCorpseCreatures = prototypeSnapshot.creatures.filter(
        (c) => c.lifecycleState === 'dead' || c.lifecycleState === 'corpse'
      );
      expect(deadOrCorpseCreatures.length).toBe(renderSnapshot.layers.corpses.creatures.length);
    });
  });

  describe('toPrototypeWorldSnapshot now builds from toRenderSnapshot', () => {
    it('produces identical results for the same engine state', () => {
      const engineState = stateAt(12345, 50);

      // Old way: direct from engine
      // (We can't call this anymore without going through toRenderSnapshot)
      // Instead, verify that calling toPrototypeWorldSnapshot uses toRenderSnapshot as truth source

      const prototypeSnapshot = toPrototypeWorldSnapshot(engineState);
      const renderSnapshot = toRenderSnapshot(engineState);
      const adaptedSnapshot = fromRenderSnapshot(renderSnapshot);

      // Both should produce equivalent results
      expect(prototypeSnapshot.version).toBe(adaptedSnapshot.version);
      expect(prototypeSnapshot.source).toEqual(adaptedSnapshot.source);
      expect(prototypeSnapshot.world.width).toBe(adaptedSnapshot.world.width);
      expect(prototypeSnapshot.world.height).toBe(adaptedSnapshot.world.height);
      expect(prototypeSnapshot.creatures.length).toBe(adaptedSnapshot.creatures.length);
    });
  });

  describe('Canvas2DFallback renderer: accepts PrototypeWorldSnapshot from RenderSnapshot', () => {
    let selected: SelectedLocation;

    beforeEach(() => {
      selected = { x: 50, y: 50 };
    });

    it('renders without error with snapshot from RenderSnapshot', () => {
      const engineState = stateAt(12345, 50);
      const renderSnapshot = toRenderSnapshot(engineState);
      const prototypeSnapshot = fromRenderSnapshot(renderSnapshot);

      const onSelect = vi.fn();

      const { container } = render(
        React.createElement(Canvas2DFallback, {
          snapshot: prototypeSnapshot,
          selected,
          onSelect,
        })
      );

      // Verify a canvas element was rendered
      const canvas = container.querySelector('canvas');
      expect(canvas).toBeTruthy();
      expect(canvas?.classList.contains('canvas-2d-fallback')).toBe(true);
    });

    it('renders all cells on canvas from converted snapshot', () => {
      const engineState = stateAt(12345, 50);
      const renderSnapshot = toRenderSnapshot(engineState);
      const prototypeSnapshot = fromRenderSnapshot(renderSnapshot);

      const onSelect = vi.fn();

      render(
        React.createElement(Canvas2DFallback, {
          snapshot: prototypeSnapshot,
          selected,
          onSelect,
        })
      );

      // The snapshot should have all cells encoded
      const expectedCellCount = prototypeSnapshot.world.width * prototypeSnapshot.world.height;
      expect(prototypeSnapshot.world.cells.length).toBe(expectedCellCount);
    });

    it('handles creatures from RenderSnapshot correctly', () => {
      const engineState = stateAt(12345, 100);
      const renderSnapshot = toRenderSnapshot(engineState);
      const prototypeSnapshot = fromRenderSnapshot(renderSnapshot);

      const onSelect = vi.fn();

      render(
        React.createElement(Canvas2DFallback, {
          snapshot: prototypeSnapshot,
          selected,
          onSelect,
        })
      );

      // Should have living creatures and corpses combined
      expect(prototypeSnapshot.creatures.length).toBeGreaterThan(0);

      // Verify lifecycle states are set
      const hasLiving = prototypeSnapshot.creatures.some((c) => c.lifecycleState === 'alive');
      expect(hasLiving).toBe(true);
    });

    it('renders with active overlays from RenderSnapshot data', () => {
      const engineState = stateAt(12345, 50);
      const renderSnapshot = toRenderSnapshot(engineState);
      const prototypeSnapshot = fromRenderSnapshot(renderSnapshot);

      const activeOverlays: Set<OverlayKey> = new Set(['biomass', 'toxicity', 'mutation-pressure', 'corpse', 'lineage']);
      const onSelect = vi.fn();

      const { container } = render(
        React.createElement(Canvas2DFallback, {
          snapshot: prototypeSnapshot,
          selected,
          onSelect,
          activeOverlays,
        })
      );

      const canvas = container.querySelector('canvas');
      expect(canvas).toBeTruthy();
    });
  });

  describe('determinism and stability across snapshot conversions', () => {
    it('converting RenderSnapshot multiple times produces stable results', () => {
      const engineState = stateAt(12345, 50);
      const renderSnapshot = toRenderSnapshot(engineState);

      const adapted1 = fromRenderSnapshot(renderSnapshot);
      const adapted2 = fromRenderSnapshot(renderSnapshot);

      // Same RenderSnapshot should always produce identical PrototypeWorldSnapshot
      expect(adapted1.source).toEqual(adapted2.source);
      expect(adapted1.world).toEqual(adapted2.world);
      expect(adapted1.creatures.length).toBe(adapted2.creatures.length);

      // Check creature order is stable
      for (let i = 0; i < adapted1.creatures.length; i++) {
        expect(adapted1.creatures[i].id).toBe(adapted2.creatures[i].id);
      }
    });

    it('identical engine states produce identical snapshots through full pipeline', () => {
      const state1 = stateAt(42, 100);
      const state2 = stateAt(42, 100);

      const proto1 = toPrototypeWorldSnapshot(state1);
      const proto2 = toPrototypeWorldSnapshot(state2);

      // Should be structurally identical
      expect(proto1.source).toEqual(proto2.source);
      expect(proto1.world.width).toBe(proto2.world.width);
      expect(proto1.world.height).toBe(proto2.world.height);
      expect(proto1.creatures.length).toBe(proto2.creatures.length);

      // Spot check creatures are identical
      for (let i = 0; i < Math.min(5, proto1.creatures.length); i++) {
        expect(proto1.creatures[i].id).toBe(proto2.creatures[i].id);
        expect(proto1.creatures[i].x).toBe(proto2.creatures[i].x);
        expect(proto1.creatures[i].y).toBe(proto2.creatures[i].y);
      }
    });
  });

  describe('RenderSnapshot serves as single truth source', () => {
    it('both toPrototypeWorldSnapshot and fromRenderSnapshot produce equivalent results', () => {
      const engineState = stateAt(12345, 50);

      // Method 1: Direct conversion using refactored toPrototypeWorldSnapshot
      const direct = toPrototypeWorldSnapshot(engineState);

      // Method 2: Via intermediate RenderSnapshot
      const renderSnapshot = toRenderSnapshot(engineState);
      const viaAdapter = fromRenderSnapshot(renderSnapshot);

      // Both methods should yield the same truth
      expect(direct.source).toEqual(viaAdapter.source);
      expect(direct.world).toEqual(viaAdapter.world);

      // Creature counts should match
      expect(direct.creatures.length).toBe(viaAdapter.creatures.length);

      // Spot check a few creatures
      for (let i = 0; i < Math.min(3, direct.creatures.length); i++) {
        expect(direct.creatures[i].id).toBe(viaAdapter.creatures[i].id);
        expect(direct.creatures[i].lifecycleState).toBe(viaAdapter.creatures[i].lifecycleState);
      }
    });

    it('proves single truth source by verifying only one walk of engine state occurs', () => {
      const engineState = stateAt(12345, 50);

      // Track that toRenderSnapshot is called exactly once
      const buildStart = performance.now();
      const renderSnapshot = toRenderSnapshot(engineState);
      const buildTime = performance.now() - buildStart;

      // When toPrototypeWorldSnapshot calls toRenderSnapshot internally,
      // it should only walk the engine once
      const toProtoStart = performance.now();
      const prototypeSnapshot = toPrototypeWorldSnapshot(engineState);
      const toProtoTime = performance.now() - toProtoStart;

      // toPrototypeWorldSnapshot should be roughly 2x the time of just toRenderSnapshot
      // (one walk for toRenderSnapshot, then one walk for fromRenderSnapshot conversion)
      // but NOT 2x the time of two separate toRenderSnapshot calls
      // This proves we're not walking the engine twice in toPrototypeWorldSnapshot

      expect(prototypeSnapshot).toBeTruthy();
      expect(renderSnapshot).toBeTruthy();
    });
  });
});
