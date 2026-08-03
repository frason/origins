import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import StatsPanel from '../ui/StatsPanel';

describe('StatsPanel jargon reduction', () => {
  it('gives the population, breeding, and biomass stats plain self-explanatory labels', () => {
    const html = renderToStaticMarkup(<StatsPanel />);

    expect(html).toContain('Population<');
    expect(html).toContain('Breeding<');
    expect(html).toContain('Total food (world)');
    expect(html).toContain('Food where creatures live');
    expect(html).toContain('Tiles low on food');

    expect(html).not.toContain('Population / safety limit');
    expect(html).not.toContain('Breeding pressure');
    expect(html).not.toContain('Global biomass');
    expect(html).not.toContain('Local food / tile');
    expect(html).not.toContain('Depleted habitat');
  });

  it('still reserves a "?" tooltip for the genuinely non-obvious replacement-ratio and food-trend stats', () => {
    const html = renderToStaticMarkup(<StatsPanel />);
    expect(html).toContain('Live replacement');
    expect(html).toContain('Local food trend');
    expect(html.match(/aria-hidden="true">\?</g)?.length).toBe(2);
  });
});

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
