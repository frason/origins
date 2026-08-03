import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import WorldLegend from '../ui/WorldLegend';

describe('WorldLegend', () => {
  it('collapses behind a toggle by default so it cannot sit over header controls at narrow widths', () => {
    const html = renderToStaticMarkup(<WorldLegend />);
    expect(html).toContain('aria-label="World map legend"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('world-legend--open');
    expect(html).toContain('>Map key<');
    expect(html).toContain('Green: producer biomass');
    expect(html).not.toContain('style=');
  });
});
