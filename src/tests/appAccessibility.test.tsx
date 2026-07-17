import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import App from '../App';
import { useStore } from '../state/store';

describe('app accessibility shell', () => {
  it('renders semantic landmarks and a keyboard-described world canvas', () => {
    useStore.setState({ worldState: null, tick: 0, selectedTile: null, isRunning: false });
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('<header');
    expect(html).toContain('<main aria-label="Ecosystem world"');
    expect(html).toContain('role="application"');
    expect(html).toContain('aria-roledescription="interactive ecosystem grid"');
    expect(html).toContain('aria-describedby="world-keyboard-instructions"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('Home selects the top-left tile');
  });
});
