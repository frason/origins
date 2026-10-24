import { describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import App from '../App';
import { useStore } from '../state/store';
import { buildDemoEngine } from '../simulation/demoWorld';
import { snapshotEngine } from '../state/snapshot';

describe('app accessibility shell', () => {
  it('renders semantic landmarks and a keyboard-described world canvas', () => {
    // The keyboard-described world canvas is the 2D WorldView, which only
    // renders once a world snapshot exists; the default view is the 3D one.
    // Use the client render path (not renderToStaticMarkup): zustand 4.5 uses
    // the store's initial state as the server snapshot, so state set here
    // would be ignored during SSR.
    const engine = buildDemoEngine(12345, useStore.getState().constants);
    useStore.setState({
      worldState: snapshotEngine(engine),
      tick: engine.tick,
      selectedTile: null,
      isRunning: false,
      show2dView: true,
    });
    const { container } = render(<App />);
    const html = container.innerHTML;

    expect(html).toContain('<header');
    expect(html).toContain('<h1 class="sim-window__title">Project Origins — Living World</h1>');
    expect(html).toContain('<main aria-label="Ecosystem world"');
    expect(html).toContain('class="app-shell__transport"');
    expect(html).toContain('aria-label="Simulation speed"');
    expect(html).toContain('role="application"');
    expect(html).toContain('aria-roledescription="interactive ecosystem grid"');
    expect(html).toContain('aria-describedby="world-keyboard-instructions"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('Home selects the top-left tile');
    cleanup();
  });
});
