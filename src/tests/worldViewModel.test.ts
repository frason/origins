import { describe, expect, it } from 'vitest';
import {
  globePosition,
  isometricPosition,
  locationFromMapPoint,
  notableEvent,
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
});
