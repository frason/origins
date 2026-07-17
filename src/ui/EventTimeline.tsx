import type { CSSProperties } from 'react';
import { useStore } from '../state/store';
import { buildEventStories, getPopulationTrend, type StoryTone } from './eventTimelineModel';
import InterventionImpact from './InterventionImpact';
import ReplayRecipe from './ReplayRecipe';
import type { WorldRecipe } from './worldRecipe';

const panelStyle: CSSProperties = {
  backgroundColor: '#222',
  borderRadius: 8,
  padding: '0.75rem 1rem',
  color: '#eee',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '0.8rem',
};

const toneColors: Record<StoryTone, string> = {
  growth: '#78cf83',
  loss: '#e7a16f',
  evolution: '#bba7e8',
  extinction: '#ef7c7c',
  intervention: '#70c7d8',
};

export default function EventTimeline({
  onReplayRecipe,
  replayStatus,
}: {
  onReplayRecipe?: (recipe: WorldRecipe) => string | null;
  replayStatus?: string | null;
}) {
  const worldState = useStore((state) => state.worldState);
  const tick = useStore((state) => state.tick);
  const events = worldState?.events ?? [];
  const stories = buildEventStories(events);
  const trend = getPopulationTrend(events, tick);

  return (
    <section style={panelStyle} aria-labelledby="timeline-title">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div id="timeline-title" style={{ fontWeight: 600 }}>World Story</div>
        <span style={{ color: '#9dc6d8', fontWeight: 600 }}>{trend.label}</span>
      </div>
      <div style={{ color: '#777', fontSize: '0.68rem', margin: '0.2rem 0 0.6rem' }}>
        {trend.explanation}
      </div>
      <InterventionImpact />
      <ReplayRecipe onReplay={onReplayRecipe} replayStatus={replayStatus} />

      {stories.length === 0 ? (
        <div style={{ color: '#777' }}>The world is waiting for its first major event.</div>
      ) : (
        <div aria-live="polite">
          {stories.map((story) => (
            <article
              key={story.id}
              style={{ borderTop: '1px solid #383838', padding: '0.5rem 0 0.45rem' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem' }}>
                <strong style={{ color: toneColors[story.tone], fontSize: '0.74rem' }}>
                  {story.title}
                </strong>
                <span style={{ color: '#666', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                  tick {story.tick}
                </span>
              </div>
              <div style={{ color: '#999', fontSize: '0.7rem', marginTop: '0.15rem' }}>
                {story.detail}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
