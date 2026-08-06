import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import WorldLegend from '../ui/WorldLegend';
import { rgbToCss, strategyColor, STRATEGY_LEGEND } from '../ui/creatureColor';

describe('WorldLegend', () => {
  it('collapses behind a toggle by default so it cannot sit over header controls at narrow widths', () => {
    const html = renderToStaticMarkup(<WorldLegend />);
    expect(html).toContain('aria-label="World map legend"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('world-legend--open');
    expect(html).toContain('>Map key<');
    expect(html).toContain('Green: producer biomass');
  });

  /*
   * The diet swatches are coloured inline from creatureColor rather than from
   * CSS, which is why this file no longer forbids `style=` outright. Hard-coding
   * the same hues in a stylesheet would let the key drift away from the dots the
   * canvas actually draws, so the colours are asserted against the shared source
   * instead — drift fails here rather than shipping a misleading key.
   */
  it('shows every diet with the exact colour the map draws it in', () => {
    const html = renderToStaticMarkup(<WorldLegend />);
    for (const { strategy, label } of STRATEGY_LEGEND) {
      expect(html).toContain(label);
      expect(html).toContain(`background:${rgbToCss(strategyColor(strategy))}`);
    }
  });

  it('keeps inline styles confined to the diet swatches', () => {
    const html = renderToStaticMarkup(<WorldLegend />);
    const inlineStyles = html.match(/style="[^"]*"/g) ?? [];
    expect(inlineStyles).toHaveLength(STRATEGY_LEGEND.length);
    for (const style of inlineStyles) {
      expect(style).toContain('background:');
    }
  });
});
