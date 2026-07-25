import { describe, expect, it } from 'vitest';
import { elevationAppearance } from '../ui/elevationLayer';

describe('elevation layer', () => {
  it('lights exposed high ground and shades low ground deterministically', () => {
    const ridge = elevationAppearance(0.9, 0.6, 0.6);
    const basin = elevationAppearance(0.1, 0.4, 0.4);
    expect(ridge.tone).toBe('light');
    expect(ridge.opacity).toBeGreaterThan(0);
    expect(basin.tone).toBe('shadow');
    expect(basin.opacity).toBeGreaterThan(0);
    expect(elevationAppearance(0.9, 0.6, 0.6)).toEqual(ridge);
  });

  it('marks only contour-band transitions on north and west cell edges', () => {
    expect(elevationAppearance(0.55, 0.51, 0.59)).toMatchObject({
      contourTop: false,
      contourLeft: false,
    });
    expect(elevationAppearance(0.61, 0.59, 0.49)).toMatchObject({
      contourTop: true,
      contourLeft: true,
    });
  });

  it('clamps malformed elevation values to the visible world range', () => {
    const appearance = elevationAppearance(10, -2, Number.POSITIVE_INFINITY);
    expect(appearance.opacity).toBeLessThanOrEqual(0.22);
    expect(Number.isFinite(appearance.opacity)).toBe(true);
  });
});
