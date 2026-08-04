import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TurningPointDialog } from '../ui/TurningPointChoice';
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

describe('TurningPointDialog', () => {
  it('presents the turning point, a stewardship suggestion, and all three explicit choices', () => {
    const html = renderToStaticMarkup(
      <TurningPointDialog
        turningPoint={turningPoint}
        recommendations={[recommendation]}
        onApply={() => undefined}
        onIntroduceSpecies={() => undefined}
        onDoNothing={() => undefined}
      />
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Ecological turnover is intensifying');
    expect(html).toContain('Deaths have outpaced births for several ticks.');
    expect(html).toContain('The simulation is paused. Choose how to respond.');
    expect(html).toContain('Ease the energy squeeze');
    expect(html).toContain('Producer growth');
    expect(html).toContain('0.1 → 0.125');
    expect(html).toContain('>Apply<');
    expect(html).toContain('>Introduce species<');
    expect(html).toContain('>Do nothing<');
    expect(html).not.toContain('style=');
  });

  it('explains when no stewardship suggestion applies, without inventing a fallback', () => {
    const html = renderToStaticMarkup(
      <TurningPointDialog
        turningPoint={turningPoint}
        recommendations={[]}
        onApply={() => undefined}
        onIntroduceSpecies={() => undefined}
        onDoNothing={() => undefined}
      />
    );

    expect(html).toContain('No specific stewardship suggestion is available right now.');
    expect(html).not.toContain('>Apply<');
  });
});
