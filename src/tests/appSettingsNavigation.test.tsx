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

    // Defaults to the Watch view, matching the drawer's default title/subtitle.
    expect(html).toContain('class="sim-window__title">Watch<');
    expect(html).toContain('What&#x27;s happening right now');
  });
});
