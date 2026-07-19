import { describe, expect, it } from 'vitest';
import { GOD_MODE_GROUPS, defaultValueFor } from '../ui/godModeControls';

describe('grouped God Mode control schema', () => {
  it('covers each editable constant exactly once in five progressive sections', () => {
    expect(GOD_MODE_GROUPS.map((group) => group.label)).toEqual([
      'Energy & Growth',
      'Creature Energy & Reproduction',
      'Lifespan & Decomposition',
      'Evolution',
      'Biodiversity Pressure',
    ]);
    const keys = GOD_MODE_GROUPS.flatMap((group) => group.controls.map((control) => control.key));
    expect(keys).toHaveLength(24);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps every default tick inside its supported slider range', () => {
    for (const control of GOD_MODE_GROUPS.flatMap((group) => group.controls)) {
      const value = defaultValueFor(control);
      expect(value).toBeGreaterThanOrEqual(control.min);
      expect(value).toBeLessThanOrEqual(control.max);
    }
  });
});
