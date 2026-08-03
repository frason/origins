import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import StatsPanel from '../ui/StatsPanel';

describe('StatsPanel live ecosystem score', () => {
  it('shows the live Order/Chaos/Exploration read but never the end-of-run Ecosystem Points tally', () => {
    const html = renderToStaticMarkup(<StatsPanel />);
    expect(html).toContain('>Order<');
    expect(html).toContain('>Chaos<');
    expect(html).toContain('>Exploration<');
    expect(html).not.toContain('Open-ended ecosystem points');
    expect(html).not.toContain('Ecosystem points');
  });
});
