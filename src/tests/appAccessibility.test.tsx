import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../App';
import { useStore } from '../state/store';

/**
 * The app shell must always expose its semantic landmarks, and whichever world
 * view is active must expose a keyboard-described `role="application"` surface.
 *
 * Since issue #274 the 3D and 2D views are mounted exclusively rather than
 * stacked, so the 2D canvas's accessibility contract is asserted with
 * `show2dView` enabled. RTL `render` is used instead of `renderToStaticMarkup`
 * because zustand's useSyncExternalStore server-render path reads the store's
 * initial snapshot, hiding any state set via setState.
 */

const renderApp = (show2dView: boolean) => {
  useStore.setState({
    worldState: null,
    tick: 0,
    selectedTile: null,
    isRunning: false,
    show2dView,
  });
  return render(<App />);
};

afterEach(() => {
  cleanup();
  useStore.setState({ show2dView: false });
});

describe('app accessibility shell', () => {
  it('renders semantic landmarks for the shell in either view mode', () => {
    const { container } = renderApp(false);

    expect(container.querySelector('header')).toBeTruthy();
    expect(
      container.querySelector('h1.sim-window__title')?.textContent,
    ).toBe('Project Origins — Living World');
    expect(
      container.querySelector('main[aria-label="Ecosystem world"]'),
    ).toBeTruthy();
    expect(container.querySelector('.app-shell__transport')).toBeTruthy();
    expect(
      container.querySelector('[aria-label="Simulation speed"]'),
    ).toBeTruthy();
  });

  it('exposes a keyboard-described world canvas in the 2D view', () => {
    const { container } = renderApp(true);

    const world = container.querySelector('[data-testid="world-view"]');
    expect(world).toBeTruthy();

    const canvas = world?.querySelector('.world-view__canvas');
    expect(canvas).toBeTruthy();
    expect(canvas?.getAttribute('role')).toBe('application');
    expect(canvas?.getAttribute('aria-roledescription')).toBe(
      'interactive ecosystem grid',
    );
    expect(canvas?.getAttribute('aria-describedby')).toBe(
      'world-keyboard-instructions',
    );
    expect(canvas?.getAttribute('tabindex')).toBe('0');
    expect(world?.textContent).toContain('Home selects the top-left tile');
  });
});
