import { describe, expect, it } from 'vitest';
import { getUiFrameInterval, MAX_UI_FRAMES_PER_SECOND } from '../ui/framePacing';

describe('UI frame pacing', () => {
  it('publishes slow simulations at their requested cadence', () => {
    expect(getUiFrameInterval(1)).toBe(1000);
    expect(getUiFrameInterval(5)).toBe(200);
    expect(getUiFrameInterval(10)).toBe(100);
  });

  it('caps visual snapshots without reducing requested simulation speed', () => {
    const interval = getUiFrameInterval(20);
    expect(interval).toBe(1000 / MAX_UI_FRAMES_PER_SECOND);
    expect(interval / (1000 / 20)).toBe(2);
  });

  it('uses the store minimum for invalidly slow input', () => {
    expect(getUiFrameInterval(0.05)).toBe(10_000);
  });
});
