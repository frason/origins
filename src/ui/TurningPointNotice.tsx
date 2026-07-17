import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { getEcosystemTrajectories } from './ecosystemTrajectory';
import {
  selectTurningPoint,
  nextTurningPointAnnouncement,
  type TurningPointNotice as Notice,
  type TurningPointTone,
} from './turningPointModel';

const toneColors: Record<TurningPointTone, { border: string; label: string }> = {
  critical: { border: '#b85f63', label: '#ff9da0' },
  warning: { border: '#a9874c', label: '#e5c47d' },
  watch: { border: '#4e7e91', label: '#9fcfe0' },
  positive: { border: '#4f845e', label: '#91d7a2' },
};

export default function TurningPointNotice() {
  const world = useStore((state) => state.worldState);
  const tick = useStore((state) => state.tick);
  const candidate = selectTurningPoint(getEcosystemTrajectories(world, tick));
  const [notice, setNotice] = useState<Notice | null>(null);
  const lastAnnounced = useRef<string | null>(null);

  useEffect(() => {
    const announcement = nextTurningPointAnnouncement(lastAnnounced.current, candidate);
    lastAnnounced.current = announcement.lastId;
    if (!candidate) {
      setNotice(null);
      return;
    }
    if (!announcement.notice) return;
    setNotice(announcement.notice);
    const timeout = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [candidate?.id]);

  if (!notice) return null;
  const colors = toneColors[notice.tone];
  return (
    <aside
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'absolute', left: '50%', bottom: '1rem', transform: 'translateX(-50%)',
        zIndex: 20, width: 'min(520px, calc(100% - 2rem))', pointerEvents: 'none',
        border: `1px solid ${colors.border}`, borderRadius: 9,
        background: 'rgba(19, 22, 24, 0.94)', color: '#ddd',
        padding: '0.65rem 0.8rem', boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ color: colors.label, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em' }}>
        {notice.dimension.toUpperCase()} TURNING POINT
      </div>
      <div style={{ fontWeight: 700, fontSize: '0.88rem', marginTop: '0.15rem' }}>
        {notice.title}
      </div>
      <div style={{ color: '#9ca3a7', fontSize: '0.72rem', marginTop: '0.15rem', lineHeight: 1.35 }}>
        {notice.detail}
      </div>
    </aside>
  );
}
