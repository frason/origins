import { useStore } from '../state/store';
import { describeChange, rateEvidenceQuality } from '../simulation/adaptationMetrics';
import { speciesDisplayName, lineageDisplayName } from '../simulation/speciesNames';

const panelStyle = {
  backgroundColor: 'var(--sim-color-screen)',
  borderRadius: 8,
  padding: '0.75rem 1rem',
  color: 'var(--sim-color-screen-ink)',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '0.8rem',
};

const eventItemStyle = {
  background: '#1b2023',
  borderRadius: 6,
  padding: '0.55rem',
  marginBottom: '0.45rem',
  borderLeft: '3px solid #527786',
};

const confidenceBadgeStyle = (confidence: number) => ({
  display: 'inline-block',
  padding: '0.2rem 0.4rem',
  borderRadius: 3,
  fontSize: '0.65rem',
  fontWeight: 600 as const,
  marginLeft: '0.3rem',
  backgroundColor:
    confidence >= 0.8 ? '#2a4d3a' :
    confidence >= 0.6 ? '#4d4d2a' :
    '#4d2a2a',
  color:
    confidence >= 0.8 ? '#7dd98f' :
    confidence >= 0.6 ? '#d5d945' :
    '#d9797d',
});

export default function AdaptationEvidence() {
  const worldState = useStore((state) => state.worldState);
  const observations = worldState?.lastAdaptationObservations ?? [];

  if (observations.length === 0) {
    return (
      <section style={panelStyle}>
        <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
          Adaptation Evidence
        </div>
        <div style={{ color: 'var(--sim-color-screen-ink-faint)', fontSize: '0.75rem' }}>
          Trait changes and evidence-based adaptation claims will appear here as they occur.
        </div>
      </section>
    );
  }

  // Show recent observations, sorted by confidence
  const sorted = [...observations].sort((a, b) => {
    const aConf = a.evidence?.confidence ?? 0;
    const bConf = b.evidence?.confidence ?? 0;
    return bConf - aConf;
  });

  const recent = sorted.slice(0, 10); // Show last 10 observations

  return (
    <section style={panelStyle}>
      <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
        Adaptation Evidence ({observations.length} total observations)
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--sim-color-screen-ink-faint)', marginBottom: '0.5rem' }}>
        Trait frequencies tracked per lineage. Labels based on evidence thresholds.
      </div>
      <div>
        {recent.map((obs, i) => {
          const speciesName = speciesDisplayName(obs.speciesId);
          const lineageName = lineageDisplayName(obs.speciesId, obs.lineageId);
          const description = describeChange(obs, speciesName, lineageName);
          const confidence = obs.evidence?.confidence ?? 0;
          const quality = rateEvidenceQuality(obs.evidence);
          const traitLabel = obs.trait.replace(/([A-Z])/g, ' $1').toLowerCase().trim();

          return (
            <div key={`${obs.lineageId}-${obs.tick}-${obs.trait}-${i}`} style={eventItemStyle}>
              <div style={{ marginBottom: '0.35rem', lineHeight: 1.3 }}>
                <strong>{traitLabel}</strong> in{' '}
                <span style={{ color: '#a8d5e8' }}>{lineageName}</span>{' '}
                <span style={{ color: '#bdb76b' }}>({speciesName})</span>
              </div>
              <div style={{ fontSize: '0.68rem', color: '#899ba2', marginBottom: '0.25rem' }}>
                {obs.changeType.replace('-', ' ')} · Tick {obs.tick}
              </div>
              <div style={{ fontSize: '0.68rem', lineHeight: 1.4, color: '#99aab5' }}>
                {description}
              </div>
              {obs.evidence && (
                <>
                  <div style={{ fontSize: '0.67rem', marginTop: '0.25rem', color: '#7f898d' }}>
                    Evidence: {obs.evidence.evidence.join(', ')}
                  </div>
                  <div style={{ marginTop: '0.2rem' }}>
                    <span style={{ fontSize: '0.66rem', color: '#899ba2' }}>
                      Confidence:
                    </span>
                    <span style={confidenceBadgeStyle(confidence)}>
                      {Math.round(confidence * 100)}%
                    </span>
                    <span style={{ fontSize: '0.66rem', color: '#899ba2', marginLeft: '0.3rem' }}>
                      Quality: {Math.round(quality * 100)}%
                    </span>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
