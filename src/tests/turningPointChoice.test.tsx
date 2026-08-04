import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TurningPointToast } from '../ui/TurningPointChoice';
import type { GodModeRecommendation } from '../ui/godModeRecommendations';
import type { TurningPointNotice } from '../ui/turningPointModel';

const turningPoint: TurningPointNotice = {
  id: 'chaos:intensifying',
  dimension: 'Chaos',
  tone: 'watch',
  title: 'Ecological turnover is intensifying',
  detail: 'Deaths have outpaced births for several ticks.',
  priority: 70,
};

const recommendation: GodModeRecommendation = {
  id: 'energy-relief',
  title: 'Ease the energy squeeze',
  reason: 'Many creatures are below 30% of their energy capacity.',
  priority: 100,
  changes: [
    { constant: 'producerGrowthRate', label: 'Producer growth', before: 0.1, after: 0.125 },
    { constant: 'baseMetabolism', label: 'Base metabolism', before: 2, after: 1.6 },
  ],
};

describe('TurningPointToast', () => {
  it('presents the turning point and action buttons as a non-blocking toast', () => {
    const html = renderToStaticMarkup(
      <TurningPointToast
        turningPoint={turningPoint}
        recommendations={[recommendation]}
        onApply={() => undefined}
        onIntroduceSpecies={() => undefined}
        onDoNothing={() => undefined}
        onDismiss={() => undefined}
      />
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('Ecological turnover is intensifying');
    expect(html).toContain('Deaths have outpaced births for several ticks.');
    expect(html).toContain('Introduce');
    expect(html).toContain('Continue');
    expect(html).not.toContain('The simulation is paused');
  });

  it('shows a compact toast even when no stewardship suggestion applies', () => {
    const html = renderToStaticMarkup(
      <TurningPointToast
        turningPoint={turningPoint}
        recommendations={[]}
        onApply={() => undefined}
        onIntroduceSpecies={() => undefined}
        onDoNothing={() => undefined}
        onDismiss={() => undefined}
      />
    );

    expect(html).toContain('Introduce');
    expect(html).toContain('Continue');
  });
});
