import type { WorldStory } from './worldStory';

export default function WorldStoryPanel({ story, headingId }: { story: WorldStory; headingId: string }) {
  return (
    <section aria-labelledby={headingId} style={{ marginTop: '1rem', padding: '0.75rem', border: '1px solid #3f494e', background: '#202528' }}>
      <h3 id={headingId} style={{ margin: 0, fontSize: '0.88rem', color: '#d3b38c' }}>{story.heading}</h3>
      {story.paragraphs.map((paragraph, index) => (
        <p key={index} style={{ margin: '0.4rem 0 0', color: '#aab3b7', fontSize: '0.72rem', lineHeight: 1.45 }}>
          {paragraph}
        </p>
      ))}
    </section>
  );
}
