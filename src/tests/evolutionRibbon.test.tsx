import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TRAITS } from '../utils/traits';
import { useStore, type StoreState } from '../state/store';
import EvolutionRibbon from '../ui/EvolutionRibbon';

describe('EvolutionRibbon', () => {
  it('keeps bounded evolution metrics visible in the world shell', () => {
    const snapshot: Partial<StoreState> = {
      tick: 10,
      worldState: {
        width: 1,
        height: 1,
        cells: [],
        events: [
          { type: 'birth', tick: 8, speciesId: 'alpha' },
          { type: 'death', tick: 9, speciesId: 'alpha' },
        ],
        creatures: [{
          id: 'one', speciesId: 'alpha', lineageId: 'root', parentId: null,
          traits: { ...DEFAULT_TRAITS }, x: 0, y: 0, energy: 100, age: 1,
          lifecycleState: 'alive', corpseDecayTicks: 0,
        }],
        history: [],
      },
    };
    useStore.setState(snapshot);
    Object.assign(useStore.getInitialState(), snapshot);

    const html = renderToStaticMarkup(<EvolutionRibbon onOpenLineages={() => undefined} />);
    expect(html).toContain('Evolution over time');
    expect(html).toContain('>Population</span><span class="evolution-ribbon__stat-value sim-data">1<');
    expect(html).toContain('>Species</span><span class="evolution-ribbon__stat-value sim-data">1<');
    expect(html).toContain('1.00×');
    expect(html).toContain('>Tick</span><span class="evolution-ribbon__stat-value sim-data">10<');
    expect(html).toContain('aria-controls="evolution-history-panel"');
    expect(html).toContain('class="evolution-ribbon__sparkline"');
    expect(html).toContain('Live replacement');
    expect(html).not.toContain('style=');
  });
});
