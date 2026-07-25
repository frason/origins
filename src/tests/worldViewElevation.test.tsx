import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import WorldView from '../ui/WorldView';

describe('WorldView elevation controls', () => {
  it('starts with the accessible elevation layer enabled', () => {
    const html = renderToStaticMarkup(<WorldView />);
    expect(html).toContain('Elevation on');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('world-view__elevation-toggle--active');
  });
});
