// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../state/store';
import SeasonPanel from '../ui/SeasonPanel';
import { DEFAULT_SEASON_CONFIG } from '../simulation/seasons';

// Mount coverage for the season calendar and forecast (epic #121 gap 2).
// Uses the DOM renderer: zustand v4 serves the initial state under renderToStaticMarkup, so
// store-driven components must be mounted with react-dom to see setState values.
describe('SeasonPanel mount in the world view', () => {
  beforeEach(() => {
    useStore.setState({ seasonConfig: null, tick: 0, selectedTile: null, worldState: null });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when the live world has no seasons', () => {
    const { container } = render(<SeasonPanel />);
    expect(container.innerHTML).toBe('');
  });

  it('mounts the calendar and forecast when the live engine carries a season config', () => {
    useStore.setState({ seasonConfig: { ...DEFAULT_SEASON_CONFIG }, tick: 0 });
    render(<SeasonPanel />);
    expect(screen.getByLabelText('Seasons')).toBeTruthy();
    expect(screen.getByLabelText('Season calendar')).toBeTruthy();
    expect(screen.getByLabelText('Season forecast')).toBeTruthy();
    expect(screen.getByText(/Year 0 · Day 1 of 960/)).toBeTruthy();
    expect(screen.getByText(/North: Winter/)).toBeTruthy();
  });

  it('shows the seasons-off forecast state when config is disabled', () => {
    useStore.setState({ seasonConfig: { ...DEFAULT_SEASON_CONFIG, enabled: false }, tick: 0 });
    render(<SeasonPanel />);
    expect(screen.getByLabelText('Season forecast').textContent).toContain('Seasons are off.');
  });
});
