import { useEffect, type ReactNode } from 'react';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

export default function SettingsDrawer({ isOpen, onClose, children }: SettingsDrawerProps) {
  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`settings-drawer__backdrop${isOpen ? ' settings-drawer__backdrop--open' : ''}`}
      />
      <aside
        id="settings-drawer"
        aria-label="Simulation settings"
        aria-hidden={!isOpen}
        className={`settings-drawer sim-window${isOpen ? ' settings-drawer--open' : ''}`}
      >
        <header className="settings-drawer__header sim-window__title-bar">
          <strong className="sim-window__title">World controls</strong>
          <button type="button" onClick={onClose} className="sim-button sim-button--compact" aria-label="Close settings">
            Close
          </button>
        </header>
        <div className="settings-drawer__content">{children}</div>
      </aside>
    </>
  );
}
