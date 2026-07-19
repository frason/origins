import { describe, expect, it } from 'vitest';
import { nextOpenHelpKey } from '../ui/ControlPanel';

describe('God Mode help popovers', () => {
  it('keeps only one help popover selected at a time', () => {
    expect(nextOpenHelpKey(null, 'baseSolarEnergy')).toBe('baseSolarEnergy');
    expect(nextOpenHelpKey('baseSolarEnergy', 'mutationDrift')).toBe('mutationDrift');
  });

  it('closes an already selected popover when its trigger is used again', () => {
    expect(nextOpenHelpKey('mutationDrift', 'mutationDrift')).toBeNull();
  });
});
