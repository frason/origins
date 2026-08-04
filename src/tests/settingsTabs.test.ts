import { describe, expect, it } from 'vitest';
import { SETTINGS_TABS } from '../ui/settingsTabs';

describe('settings drawer tab schema', () => {
  it('names four distinct jobs at four distinct cadences', () => {
    expect(SETTINGS_TABS.map((tab) => tab.id)).toEqual(['watch', 'diagnose', 'act', 'remember']);
    expect(SETTINGS_TABS.map((tab) => tab.label)).toEqual(['Watch', 'Diagnose', 'Act', 'Remember']);
    for (const tab of SETTINGS_TABS) {
      expect(tab.subtitle.length).toBeGreaterThan(0);
    }
  });
});
