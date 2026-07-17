import { useStore } from '../state/store';
import { buildFollowedLineageNotices, type FollowedNoticeType } from './lineageNoticeModel';

const colors: Record<FollowedNoticeType, string> = {
  branch: '#bba7e8',
  rebound: '#79dc89',
  dominance: '#d7bd6e',
  extinction: '#ef8b8b',
};

export default function FollowedLineageNotices() {
  const world = useStore((state) => state.worldState);
  const followed = useStore((state) => state.followedLineages);
  const tick = useStore((state) => state.tick);
  if (!world || followed.length === 0) return null;
  const notices = buildFollowedLineageNotices(world.creatures, world.events, followed, tick);
  if (notices.length === 0) return null;

  return (
    <section aria-labelledby="followed-notices-title" aria-live="polite" style={{ border: '1px solid #43404d', borderRadius: 7, padding: '0.55rem', marginBottom: '0.7rem' }}>
      <div id="followed-notices-title" style={{ color: '#c8bddb', fontWeight: 600, marginBottom: '0.25rem' }}>
        Followed lineage milestones
      </div>
      {notices.map((notice) => (
        <article key={notice.id} style={{ borderTop: '1px solid #37343e', padding: '0.35rem 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
            <strong style={{ color: colors[notice.type], fontSize: '0.7rem' }}>{notice.title}</strong>
            <span style={{ color: '#6f6b75', fontSize: '0.65rem' }}>tick {notice.tick}</span>
          </div>
          <div style={{ color: '#94909b', fontSize: '0.67rem', marginTop: '0.1rem' }}>{notice.detail}</div>
        </article>
      ))}
    </section>
  );
}
