import { describe, expect, it } from 'vitest';
import {
  creatureVisual,
  globePosition,
  isometricPosition,
  locationFromMapPoint,
  notableEvent,
  normalizedLayer,
} from '../prototype/worldViewModel';
import type { PrototypeWorldSnapshot } from '../prototype/worldSnapshot';

describe('prototype world-view model', () => {
  it('maps pointer positions to bounded authoritative tile coordinates', () => {
    const bounds = { left: 10, top: 20, width: 200, height: 100 };
    expect(locationFromMapPoint(110, 70, bounds, 100, 100)).toEqual({ x: 50, y: 50 });
    expect(locationFromMapPoint(-100, 500, bounds, 100, 100)).toEqual({ x: 0, y: 99 });
  });

  it('projects the same tile deterministically into each direction', () => {
    expect(isometricPosition({ x: 50, y: 25 }, 100, 100)).toEqual([0, 0, -25]);
    const first = globePosition({ x: 50, y: 25 }, 100, 100, 12);
    const second = globePosition({ x: 50, y: 25 }, 100, 100, 12);
    expect(second).toEqual(first);
    expect(Math.hypot(...first)).toBeCloseTo(12);
  });

  it('prefers the most recent mutation as the notable event', () => {
    const snapshot = {
      events: [
        { type: 'mutation', tick: 5 },
        { type: 'death', tick: 7 },
        { type: 'mutation', tick: 9, detail: 'new lineage' },
      ],
    } as PrototypeWorldSnapshot;
    expect(notableEvent(snapshot)).toEqual({
      type: 'mutation',
      tick: 9,
      detail: 'new lineage',
    });
  });

  it('normalizes ecological layers without exceeding visual bounds', () => {
    expect(normalizedLayer(50, 100)).toBe(0.5);
    expect(normalizedLayer(150, 100)).toBe(1);
    expect(normalizedLayer(-10, 100)).toBe(0);
    expect(normalizedLayer(10, 0)).toBe(0);
  });

  it('makes corpses distinct and colors living strategies consistently', () => {
    const living = {
      lifecycleState: 'alive',
      strategy: 'carnivore',
    } as PrototypeWorldSnapshot['creatures'][number];
    const corpse = {
      lifecycleState: 'dead',
      strategy: 'carnivore',
    } as PrototypeWorldSnapshot['creatures'][number];
    expect(creatureVisual(living)).toEqual({ role: 'living', color: 0xe8664a });
    expect(creatureVisual(corpse)).toEqual({ role: 'corpse', color: 0x9b7049 });
  });
});
