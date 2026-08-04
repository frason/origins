import { describe, expect, it, vi } from 'vitest';
import { BALANCED_LONGEVITY_PRESET } from '../utils/constants';
import { applyWorldModePreset, WORLD_MODE_OPTIONS } from '../ui/worldModePresets';

describe('world mode presets', () => {
  it('names three distinct, described modes', () => {
    expect(WORLD_MODE_OPTIONS.map((option) => option.id)).toEqual(['standard', 'longevity', 'custom']);
    for (const option of WORLD_MODE_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.description.length).toBeGreaterThan(0);
    }
  });

  it('resets to defaults for standard, deterministically regardless of prior state', () => {
    const resetConstants = vi.fn();
    const updateConstants = vi.fn();
    applyWorldModePreset('standard', resetConstants, updateConstants);
    expect(resetConstants).toHaveBeenCalledOnce();
    expect(updateConstants).not.toHaveBeenCalled();
  });

  it('resets to defaults then layers the longevity preset on top', () => {
    const resetConstants = vi.fn();
    const updateConstants = vi.fn();
    applyWorldModePreset('longevity', resetConstants, updateConstants);
    expect(resetConstants).toHaveBeenCalledOnce();
    expect(updateConstants).toHaveBeenCalledOnce();
    expect(updateConstants).toHaveBeenCalledWith(BALANCED_LONGEVITY_PRESET);
  });

  it('leaves current constants untouched for custom', () => {
    const resetConstants = vi.fn();
    const updateConstants = vi.fn();
    applyWorldModePreset('custom', resetConstants, updateConstants);
    expect(resetConstants).not.toHaveBeenCalled();
    expect(updateConstants).not.toHaveBeenCalled();
  });
});
