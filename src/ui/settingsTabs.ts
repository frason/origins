export type SettingsTab = 'watch' | 'diagnose' | 'act' | 'remember';

export interface SettingsTabConfig {
  id: SettingsTab;
  label: string;
  subtitle: string;
}

/**
 * Four jobs at four cadences: watching is continuous, diagnosing happens at a
 * turning point, acting is rare and deliberate, remembering spans sessions.
 */
export const SETTINGS_TABS: SettingsTabConfig[] = [
  { id: 'watch', label: 'Watch', subtitle: "What's happening right now" },
  { id: 'diagnose', label: 'Diagnose', subtitle: "Why it's happening" },
  { id: 'act', label: 'Act', subtitle: 'What to change' },
  { id: 'remember', label: 'Remember', subtitle: 'What happened to your lineages' },
];
