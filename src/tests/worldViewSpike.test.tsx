import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import WorldViewSpike from '../prototype/WorldViewSpike';

describe('WorldViewSpike', () => {
  it('renders shared fixture context, accessible controls, and 2D navigation', () => {
    const html = renderToStaticMarkup(<WorldViewSpike />);
    expect(html).toContain('Origins world-view comparison');
    expect(html).toContain('Frozen seed 12345');
    expect(html).toContain('A · Isometric tile world');
    expect(html).toContain('B · Full globe');
    expect(html).toContain('2D world navigator');
    expect(html).toContain('Focus event context');
    expect(html).toContain('data-direction="isometric"');
    expect(html).not.toContain('style=');
  });
});
