import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import App from '../App';
import { useStore } from '../state/store';

describe('app settings navigation', () => {
  it('replaces the fake World/Simulation/Data tabs with real Watch/Diagnose/Act/Remember views', () => {
    useStore.setState({ worldState: null, tick: 0, selectedTile: null, isRunning: false });
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('>Watch<');
    expect(html).toContain('>Diagnose<');
    expect(html).toContain('>Act<');
    expect(html).toContain('>Remember<');
    expect(html).not.toContain('>World<');

    // The tabs live in the always-visible settings panel and default to Watch.
    expect(html).toContain('class="settings-panel__tabs"');
    expect(html).toContain('settings-panel__tab settings-panel__tab--active" aria-current="page">Watch<');
  });
});
