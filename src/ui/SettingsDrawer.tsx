import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { getDrawerPresentation } from './settingsDrawerModel';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

const closeButtonStyle: CSSProperties = {
  border: '1px solid #555',
  borderRadius: 6,
  background: '#2b2d30',
  color: '#eee',
  padding: '0.4rem 0.7rem',
  cursor: 'pointer',
};

export default function SettingsDrawer({ isOpen, onClose, children }: SettingsDrawerProps) {
  const presentation = getDrawerPresentation(isOpen);

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
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 90,
          background: 'rgba(0, 0, 0, 0.42)',
          opacity: isOpen ? 1 : 0,
          visibility: presentation.visibility,
          pointerEvents: presentation.pointerEvents,
          transition: 'opacity 180ms ease, visibility 180ms ease',
        }}
      />
      <aside
        id="settings-drawer"
        aria-label="Simulation settings"
        aria-hidden={!isOpen}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 100,
          width: 'min(360px, calc(100vw - 24px))',
          padding: '0.75rem',
          boxSizing: 'border-box',
          overflowY: 'auto',
          background: '#17191c',
          borderLeft: '1px solid #444',
          boxShadow: '-12px 0 36px rgba(0, 0, 0, 0.45)',
          transform: presentation.transform,
          visibility: presentation.visibility,
          pointerEvents: presentation.pointerEvents,
          transition: 'transform 220ms ease, visibility 220ms ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#eee',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            marginBottom: '0.75rem',
          }}
        >
          <strong>World controls</strong>
          <button type="button" onClick={onClose} style={closeButtonStyle} aria-label="Close settings">
            Close
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>{children}</div>
      </aside>
    </>
  );
}
