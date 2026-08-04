import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import WorldLegend from '../ui/WorldLegend';

describe('WorldLegend', () => {
  it('collapses to a small icon button by default so it cannot sit over header controls', () => {
    const html = renderToStaticMarkup(<WorldLegend />);
    expect(html).toContain('aria-label="Show map key"');
    expect(html).not.toContain('aria-label="World map legend"');
    expect(html).not.toContain('Green: producer biomass');
    expect(html).not.toContain('style=');
  });
});
