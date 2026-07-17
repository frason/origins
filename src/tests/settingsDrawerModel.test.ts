import { describe, expect, it } from 'vitest';
import { getDrawerPresentation } from '../ui/settingsDrawerModel';

describe('settings drawer presentation', () => {
  it('is interactive and on-screen while open', () => {
    expect(getDrawerPresentation(true)).toEqual({
      transform: 'translateX(0)',
      visibility: 'visible',
      pointerEvents: 'auto',
    });
  });

  it('moves fully off-screen and stops intercepting input while closed', () => {
    expect(getDrawerPresentation(false)).toEqual({
      transform: 'translateX(100%)',
      visibility: 'hidden',
      pointerEvents: 'none',
    });
  });
});
