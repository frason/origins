import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../App';
import { useStore } from '../state/store';

/**
 * Issue #274 — the 2D map must be a reachable, synchronized fallback for the
 * 3D Living World. `show2dView` existed in the store with no consumers and both
 * views were mounted simultaneously (the 2D one invisible underneath the 3D
 * one). These tests pin the toggle control and the clean one-at-a-time swap.
 *
 * Note: these use RTL `render`, not `renderToStaticMarkup`. Zustand subscribes
 * via useSyncExternalStore, whose server-render path reads the store's initial
 * snapshot, so state changes made with setState are invisible to static markup.
 */

const resetStore = (show2dView: boolean) => {
  useStore.setState({
    worldState: null,
    tick: 0,
    selectedTile: null,
    isRunning: false,
    show2dView,
  });
};

const renderApp = (show2dView: boolean) => {
  resetStore(show2dView);
  return render(<App />);
};

afterEach(() => {
  cleanup();
  resetStore(false);
});

describe('3D/2D view toggle (issue #274)', () => {
  it('renders only the 3D Living World by default and exposes the toggle control', () => {
    renderApp(false);

    expect(screen.getByTestId('live-three-world-view')).toBeTruthy();
    expect(screen.queryByTestId('world-view')).toBeNull();

    const toggle = screen.getByTestId('toggle-view-button');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveAttribute(
      'aria-label',
      'Toggle between 3D and 2D map view (press M)',
    );
  });

  it('renders only the 2D map when show2dView is already enabled', () => {
    renderApp(true);

    expect(screen.getByTestId('world-view')).toBeTruthy();
    expect(screen.queryByTestId('live-three-world-view')).toBeNull();

    const toggle = screen.getByTestId('toggle-view-button');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking the toggle swaps which view is in the DOM', () => {
    renderApp(false);

    const toggle = screen.getByTestId('toggle-view-button');
    expect(screen.getByTestId('live-three-world-view')).toBeTruthy();
    expect(screen.queryByTestId('world-view')).toBeNull();

    fireEvent.click(toggle);

    expect(screen.queryByTestId('live-three-world-view')).toBeNull();
    expect(screen.getByTestId('world-view')).toBeTruthy();
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(useStore.getState().show2dView).toBe(true);

    fireEvent.click(toggle);

    expect(screen.getByTestId('live-three-world-view')).toBeTruthy();
    expect(screen.queryByTestId('world-view')).toBeNull();
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(useStore.getState().show2dView).toBe(false);
  });

  it('pressing "M" toggles the view', () => {
    renderApp(false);

    fireEvent.keyDown(window, { key: 'm' });
    expect(useStore.getState().show2dView).toBe(true);
    expect(screen.getByTestId('world-view')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'M' });
    expect(useStore.getState().show2dView).toBe(false);
    expect(screen.getByTestId('live-three-world-view')).toBeTruthy();
  });

  it('ignores the "M" shortcut when modifiers are held', () => {
    renderApp(false);

    fireEvent.keyDown(window, { key: 'm', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'm', metaKey: true });
    fireEvent.keyDown(window, { key: 'm', altKey: true });
    fireEvent.keyDown(window, { key: 'm', shiftKey: true });

    expect(useStore.getState().show2dView).toBe(false);
    expect(screen.getByTestId('live-three-world-view')).toBeTruthy();
  });

  it('ignores the "M" shortcut while typing in a form field', () => {
    renderApp(false);

    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    try {
      input.focus();
      fireEvent.keyDown(input, { key: 'm' });
      expect(useStore.getState().show2dView).toBe(false);

      textarea.focus();
      fireEvent.keyDown(textarea, { key: 'm' });
      expect(useStore.getState().show2dView).toBe(false);
    } finally {
      input.remove();
      textarea.remove();
    }
  });
});
