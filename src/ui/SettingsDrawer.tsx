import { useEffect, useRef, type ReactNode } from 'react';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

export default function SettingsDrawer({
  isOpen,
  onClose,
  children,
  title = 'World controls',
  subtitle,
}: SettingsDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      returnFocusRef.current?.focus();
    };
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
        aria-modal="true"
        role="dialog"
        className={`settings-drawer sim-window${isOpen ? ' settings-drawer--open' : ''}`}
      >
        <header className="settings-drawer__header sim-window__title-bar">
          <span className="settings-drawer__title-group">
            <strong className="sim-window__title">{title}</strong>
            {subtitle && <span className="settings-drawer__subtitle">{subtitle}</span>}
          </span>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="sim-button sim-button--compact" aria-label="Close settings">
            Close
          </button>
        </header>
        <div className="settings-drawer__content">{children}</div>
      </aside>
    </>
  );
}
