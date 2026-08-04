import type { ReactNode } from 'react';
import { SETTINGS_TABS, type SettingsTab } from './settingsTabs';

interface SettingsPanelProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  children: ReactNode;
  worldName: string;
  worldSeed: number;
}

export default function SettingsPanel({
  activeTab,
  onTabChange,
  children,
  worldName,
  worldSeed,
}: SettingsPanelProps) {
  return (
    <aside className="app-shell__settings-panel">
      <div className="settings-panel__header">
        <nav className="settings-panel__tabs" aria-label="Settings tabs">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`settings-panel__tab${activeTab === tab.id ? ' settings-panel__tab--active' : ''}`}
              onClick={() => onTabChange(tab.id)}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="settings-panel__content">
        {children}
      </div>
      <div className="settings-panel__footer">
        <strong className="settings-panel__world-name">{worldName}</strong>
        <span className="sim-data">Seed {worldSeed}</span>
      </div>
    </aside>
  );
}
