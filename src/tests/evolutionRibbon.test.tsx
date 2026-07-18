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
        events: [],
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
    expect(html).toContain('Pop. 1 · Species 1 · Lineages 1');
    expect(html).toContain('aria-controls="evolution-history-panel"');
    expect(html).toContain('class="evolution-ribbon__sparkline"');
    expect(html).not.toContain('style=');
  });
});
