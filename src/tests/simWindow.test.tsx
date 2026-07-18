import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SimWindow from '../ui/SimWindow';

describe('SimWindow', () => {
  it('renders optional chrome using stable BEM classes and semantic regions', () => {
    const markup = renderToStaticMarkup(
      <SimWindow
        title="Evolution"
        controls={<button type="button">Close</button>}
        menu={<button type="button">View</button>}
        status={<span>Simulation running</span>}
      >
        <p>Population chart</p>
      </SimWindow>
    );

    expect(markup).toContain('class="sim-window"');
    expect(markup).toContain('class="sim-window__title-bar"');
    expect(markup).toContain('aria-label="Evolution menu"');
    expect(markup).toContain('<footer class="sim-window__status-bar"');
    expect(markup).toContain('Population chart');
    expect(markup).not.toContain('style=');
  });
});
