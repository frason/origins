import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SettingsDrawer from '../ui/SettingsDrawer';

describe('SettingsDrawer accessibility structure', () => {
  it('exposes modal semantics and external BEM styling without inline CSS', () => {
    const html = renderToStaticMarkup(
      <SettingsDrawer isOpen onClose={() => undefined}>
        <button type="button">Example control</button>
      </SettingsDrawer>
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Simulation settings"');
    expect(html).toContain('class="settings-drawer sim-window settings-drawer--open"');
    expect(html).not.toContain('style=');
  });
});
