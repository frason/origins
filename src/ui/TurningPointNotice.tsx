import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { getEcosystemTrajectories } from './ecosystemTrajectory';
import {
  selectTurningPoint,
  nextTurningPointAnnouncement,
  type TurningPointNotice as Notice,
} from './turningPointModel';

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
  return (
    <aside
      aria-live="polite"
      aria-atomic="true"
      className={`turning-point turning-point--${notice.tone}`}
    >
      <div className="turning-point__eyebrow">
        {notice.dimension.toUpperCase()} TURNING POINT
      </div>
      <div className="turning-point__title">
        {notice.title}
      </div>
      <div className="turning-point__detail">
        {notice.detail}
      </div>
    </aside>
  );
}
