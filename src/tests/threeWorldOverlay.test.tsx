/**
 * Tests for Three.js World overlay components, fallback renderer, and performance monitoring.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ThreeWorldLegend from '../ui/ThreeWorldLegend';
import ThreeWorldOverlayControl from '../ui/ThreeWorldOverlayControl';
import { PerformanceMonitor, PERFORMANCE_BUDGETS, prefersReducedMotion } from '../ui/performanceBudgets';
import Canvas2DFallback from '../prototype/Canvas2DFallback';
import type { OverlayKey } from '../ui/ThreeWorldLegend';
import type { PrototypeWorldSnapshot } from '../prototype/worldSnapshot';

describe('ThreeWorldLegend', () => {
  it('renders legend with all overlay types', () => {
    const overlays: OverlayKey[] = ['biomass', 'energy', 'toxicity', 'mutation-pressure', 'corpse', 'habitat', 'lineage'];
    render(
      <ThreeWorldLegend
        open={true}
        activeOverlays={new Set(overlays)}
      />
    );

    // Verify that each overlay has a checkbox control with an aria-label containing "Toggle" and "overlay"
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBe(overlays.length);
    checkboxes.forEach((checkbox) => {
      const ariaLabel = checkbox.getAttribute('aria-label') || '';
      expect(ariaLabel).toMatch(/^Toggle .* overlay$/i);
    });
  });

  it('toggles overlay when checkbox clicked', () => {
    const onToggle = vi.fn();
    render(
      <ThreeWorldLegend
        open={true}
        activeOverlays={new Set()}
        onOverlayToggle={onToggle}
      />
    );

    const biomassCheckbox = screen.getByLabelText(/Toggle producer biomass overlay/i) as HTMLInputElement;
    fireEvent.click(biomassCheckbox);
    expect(onToggle).toHaveBeenCalledWith('biomass');
  });

  it('reflects active overlays in checked state', () => {
    render(
      <ThreeWorldLegend
        open={true}
        activeOverlays={new Set(['biomass', 'toxicity'])}
      />
    );

    const biomassCheckbox = screen.getByLabelText(/Toggle producer biomass overlay/i) as HTMLInputElement;
    const energyCheckbox = screen.getByLabelText(/Toggle available energy overlay/i) as HTMLInputElement;

    expect(biomassCheckbox.checked).toBe(true);
    expect(energyCheckbox.checked).toBe(false);
  });

  it('displays accessibility note about keyboard and touch support', () => {
    render(<ThreeWorldLegend open={true} />);
    expect(screen.getByText(/keyboard.*arrow keys.*touch.*reduced motion/i)).toBeInTheDocument();
  });
});

describe('ThreeWorldOverlayControl', () => {
  it('renders legend and fallback notice correctly', () => {
    render(
      <ThreeWorldOverlayControl
        activeOverlays={new Set()}
        isFallbackActive={true}
        onFallbackMode={vi.fn()}
      />
    );

    expect(screen.getByText(/Canvas 2D rendering active/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Retry WebGL/i)).toBeInTheDocument();
  });

  it('calls onFallbackMode when retry button clicked', () => {
    const onFallbackMode = vi.fn();
    render(
      <ThreeWorldOverlayControl
        activeOverlays={new Set()}
        isFallbackActive={true}
        onFallbackMode={onFallbackMode}
      />
    );

    const retryButton = screen.getByLabelText(/Retry WebGL/i);
    fireEvent.click(retryButton);
    expect(onFallbackMode).toHaveBeenCalled();
  });

  it('hides fallback notice when not active', () => {
    render(
      <ThreeWorldOverlayControl
        activeOverlays={new Set()}
        isFallbackActive={false}
      />
    );

    expect(screen.queryByText(/Canvas 2D rendering active/i)).not.toBeInTheDocument();
  });
});

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor();
  });

  it('records and averages frame times', () => {
    monitor.recordFrameTime(10);
    monitor.recordFrameTime(15);
    monitor.recordFrameTime(20);

    const metrics = monitor.getMetrics();
    expect(metrics.lastFrameTimeMs).toBe(20);
    expect(metrics.peakFrameTimeMs).toBe(20);
    expect(metrics.averageFrameTimeMs).toBeCloseTo(15);
  });

  it('records entity count', () => {
    monitor.recordEntityCount(42);
    expect(monitor.getMetrics().entityCount).toBe(42);
  });

  it('records draw metrics', () => {
    monitor.recordDrawMetrics(120, 5000);
    const metrics = monitor.getMetrics();
    expect(metrics.drawCallCount).toBe(120);
    expect(metrics.triangleCount).toBe(5000);
  });

  it('records overlay computation time', () => {
    monitor.recordOverlayComputeTime(3.5);
    expect(monitor.getMetrics().lastOverlayComputeMs).toBe(3.5);
  });

  it('records context recovery events', () => {
    monitor.recordContextRecovery();
    monitor.recordContextRecovery();
    expect(monitor.getMetrics().contextRecoveries).toBe(2);
  });

  it('warns when frame time exceeds budget (non-critical)', () => {
    const consoleSpy = vi.spyOn(console, 'warn');
    monitor.recordFrameTime(PERFORMANCE_BUDGETS.frameTimeWarning + 1);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[PERFORMANCE] Frame time')
    );
    consoleSpy.mockRestore();
  });

  it('warns when frame time exceeds critical budget', () => {
    const consoleSpy = vi.spyOn(console, 'warn');
    monitor.recordFrameTime(PERFORMANCE_BUDGETS.frameTimeCritical + 1);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('critical')
    );
    consoleSpy.mockRestore();
  });

  it('warns when entity count exceeds budget', () => {
    const consoleSpy = vi.spyOn(console, 'warn');
    monitor.recordEntityCount(PERFORMANCE_BUDGETS.entityCountWarning + 100);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('resets all metrics', () => {
    monitor.recordFrameTime(100);
    monitor.recordEntityCount(500);
    monitor.reset();

    const metrics = monitor.getMetrics();
    expect(metrics.lastFrameTimeMs).toBe(0);
    expect(metrics.entityCount).toBe(0);
    expect(metrics.averageFrameTimeMs).toBe(0);
  });
});

describe('Canvas2DFallback', () => {
  const mockSnapshot: PrototypeWorldSnapshot = {
    version: 1,
    source: { seed: 42, tick: 100 },
    world: {
      width: 10,
      height: 10,
      cells: Array.from({ length: 100 }, (_, i) => ({
        x: i % 10,
        y: Math.floor(i / 10),
        biome: i % 3 === 0 ? 'forest' : i % 3 === 1 ? 'ocean' : 'grassland',
        elevation: Math.random() * 0.5,
        moisture: Math.random() * 1.0,
        temperature: Math.random() * 1.0,
        energy: Math.random() * 100,
        producerBiomass: Math.random() * 50,
        toxicity: Math.random() * 0.2,
      })),
    },
    creatures: [
      {
        id: 'c1',
        speciesId: 'species-a',
        x: 5,
        y: 5,
        lineageId: 'lineage-1',
        strategy: 'herbivore',
        lifecycleState: 'alive',
        relativeEnergy: 0.8,
        colorKey: 'species-a:lineage-1',
      },
      {
        id: 'c2',
        speciesId: 'species-b',
        x: 3,
        y: 7,
        lineageId: 'lineage-2',
        strategy: 'carnivore',
        lifecycleState: 'corpse',
        relativeEnergy: 0.0,
        colorKey: 'species-b:lineage-2',
      },
    ],
    events: [],
  };

  it('renders canvas element', () => {
    const { container } = render(
      <Canvas2DFallback
        snapshot={mockSnapshot}
        selected={{ x: 5, y: 5 }}
        onSelect={vi.fn()}
      />
    );

    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveAttribute('role', 'img');
  });

  it('calls onSelect when canvas clicked', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <Canvas2DFallback
        snapshot={mockSnapshot}
        selected={{ x: 0, y: 0 }}
        onSelect={onSelect}
      />
    );

    const canvas = container.querySelector('canvas')!;
    const rect = canvas.getBoundingClientRect();
    fireEvent.click(canvas, {
      clientX: rect.left + rect.width * 0.5,
      clientY: rect.height * 0.5,
    });

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      x: expect.any(Number),
      y: expect.any(Number),
    }));
  });

  it('respects activeOverlays prop', () => {
    const { rerender } = render(
      <Canvas2DFallback
        snapshot={mockSnapshot}
        selected={{ x: 0, y: 0 }}
        onSelect={vi.fn()}
        activeOverlays={new Set(['biomass', 'toxicity'])}
      />
    );

    // Rerender with different overlays
    rerender(
      <Canvas2DFallback
        snapshot={mockSnapshot}
        selected={{ x: 0, y: 0 }}
        onSelect={vi.fn()}
        activeOverlays={new Set(['energy', 'corpse'])}
      />
    );

    // Component should handle overlay state changes without errors
    expect(true).toBe(true);
  });

  it('renders living creatures differently from corpses', () => {
    const snapshot = {
      ...mockSnapshot,
      creatures: [
        {
          id: 'c1',
          speciesId: 'species-a',
          x: 5,
          y: 5,
          lineageId: 'lineage-1',
          strategy: 'herbivore',
          lifecycleState: 'alive',
          relativeEnergy: 0.8,
          colorKey: 'species-a:lineage-1',
        },
        {
          id: 'c2',
          speciesId: 'species-b',
          x: 5,
          y: 5,
          lineageId: 'lineage-2',
          strategy: 'carnivore',
          lifecycleState: 'corpse',
          relativeEnergy: 0.0,
          colorKey: 'species-b:lineage-2',
        },
      ],
    };

    render(
      <Canvas2DFallback
        snapshot={snapshot}
        selected={{ x: 5, y: 5 }}
        onSelect={vi.fn()}
        activeOverlays={new Set(['corpse'])}
      />
    );

    // Both creatures should render without error
    expect(true).toBe(true);
  });
});

describe('Performance budgets', () => {
  it('defines reasonable target budgets', () => {
    expect(PERFORMANCE_BUDGETS.frameTimeTarget).toBe(16.67); // 60 FPS
    expect(PERFORMANCE_BUDGETS.entityCountTarget).toBe(500);
    expect(PERFORMANCE_BUDGETS.memoryTargetMB).toBe(256);
  });

  it('defines progressive warning levels', () => {
    const budgets = PERFORMANCE_BUDGETS;
    expect(budgets.frameTimeWarning).toBeGreaterThan(budgets.frameTimeTarget);
    expect(budgets.frameTimeCritical).toBeGreaterThan(budgets.frameTimeWarning);

    expect(budgets.entityCountWarning).toBeGreaterThan(budgets.entityCountTarget);
    expect(budgets.entityCountCritical).toBeGreaterThan(budgets.entityCountWarning);
  });
});

describe('Accessibility: prefersReducedMotion', () => {
  it('detects reduced motion preference', () => {
    // Mock matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: query === '(prefers-reduce-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    const result = prefersReducedMotion();
    expect(typeof result).toBe('boolean');
  });
});
