import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ControlPanel from '../ui/ControlPanel';

describe('ControlPanel God Mode disclosure', () => {
  it('keeps God Mode content, including stewardship suggestions and raw constants, closed until opened', () => {
    const html = renderToStaticMarkup(<ControlPanel />);
    expect(html).toContain('Open God Mode');
    expect(html).not.toContain('Stewardship suggestions');
    expect(html).not.toContain('Advanced: raw simulation constants');
  });
});
