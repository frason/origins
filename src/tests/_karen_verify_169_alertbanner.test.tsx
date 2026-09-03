import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import AlertBanner from '../ui/AlertBanner';
import { useStore } from '../state/store';
import type { EcosystemAlert } from '../simulation/watches';

describe('karen verify #169 AlertBanner rules-of-hooks', () => {
  it('re-renders correctly when alerts go from empty to non-empty (no hook-count crash)', () => {
    // start with no alerts, render once (hits early-return branch)
    const { rerender } = render(<AlertBanner />);

    const alert: EcosystemAlert = {
      id: 'a1',
      watchId: 'w1',
      tick: 5,
      severity: 'warning',
      type: 'species-population',
      speciesId: 's1',
      speciesName: 'Test Species',
      x: 3,
      y: 4,
      cause: 'population fell below 10',
      evidence: { currentValue: 5, previousValue: 20, threshold: 10, unit: 'individuals' },
      actions: ['focus', 'pause', 'compare', 'dismiss'],
      dismissed: false,
    };

    useStore.setState({ ecosystemAlerts: [alert] });

    expect(() => rerender(<AlertBanner />)).not.toThrow();
  });
});
