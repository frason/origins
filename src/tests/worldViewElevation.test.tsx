import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import WorldView from '../ui/WorldView';

describe('WorldView elevation controls', () => {
  it('renders elevation contours unconditionally, with no toggle to turn them off', () => {
    const html = renderToStaticMarkup(<WorldView />);
    expect(html).not.toContain('Elevation on');
    expect(html).not.toContain('Elevation off');
    expect(html).not.toContain('world-view__elevation-toggle');
  });
});
