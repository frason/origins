import type { EcosystemPoints } from './ecosystemPoints';

const labels: Record<keyof EcosystemPoints['breakdown'], string> = {
  survival: 'Sustained life',
  biodiversity: 'Biodiversity',
  exploration: 'Exploration',
  recovery: 'Recovery',
  stewardship: 'Effective stewardship',
};

export default function EcosystemPointsPanel({ points }: { points: EcosystemPoints }) {
  return (
    <section aria-label="Open-ended ecosystem points" style={{ border: '1px solid #4b4540', padding: '0.6rem', marginTop: '0.7rem', background: '#252728' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
        <strong style={{ color: '#d3b38c', fontSize: '0.78rem' }}>Ecosystem points</strong>
        <output style={{ color: '#f0d39d', fontSize: '1.1rem', fontWeight: 700 }}>{points.total.toLocaleString()}</output>
      </div>
      <p style={{ color: '#888', fontSize: '0.64rem', margin: '0.2rem 0 0.4rem' }}>Open-ended evidence of sustained, varied, evolving life—not a perfect score.</p>
      {Object.entries(points.breakdown).map(([category, value]) => (
        <div key={category} style={{ display: 'flex', justifyContent: 'space-between', color: '#aaa', fontSize: '0.67rem', padding: '0.1rem 0' }}>
          <span>{labels[category as keyof typeof labels]}</span>
          <span>+{value.toLocaleString()}</span>
        </div>
      ))}
    </section>
  );
}
