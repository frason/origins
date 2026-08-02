import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Creature } from '../simulation/creature';
import { buildDemoEngine } from '../simulation/demoWorld';
import { snapshotEngine } from '../state/snapshot';
import { SpeciesPanelView } from '../ui/SpeciesPanel';
import { describeMetabolismTradeoff } from '../ui/metabolismTradeoff';
import { SIMULATION_CONSTANTS } from '../utils/constants';

describe('species metabolism observability', () => {
  it('explains both sides of the inherited metabolism tradeoff', () => {
    expect(describeMetabolismTradeoff(0.8)).toEqual({
      label: 'Efficient',
      summary: '20% lower baseline energy burn with 8% less travel and feeding throughput.',
    });
    expect(describeMetabolismTradeoff(1)).toEqual({
      label: 'Balanced',
      summary: 'Baseline travel, feeding throughput, and energy burn.',
    });
    expect(describeMetabolismTradeoff(1.1)).toEqual({
      label: 'Active',
      summary: '4% more travel and feeding throughput for 10% higher baseline energy burn.',
    });
  });

  it('renders founder habitats and metabolism costs and benefits together', () => {
    Creature.resetIdCounter();
    const worldState = snapshotEngine(buildDemoEngine(12345, { ...SIMULATION_CONSTANTS }));

    const html = renderToStaticMarkup(<SpeciesPanelView worldState={worldState} />);

    expect(html).toContain('Founder habitat');
    expect(html).toContain('Founder metabolism');
    expect(html).toContain('lower baseline energy burn');
    expect(html).toContain('higher baseline energy burn');
    expect(html).toContain('metabolism 0.80× (efficient)');
  });

  it('shows live replacement for each species and hides the old headline diagnostic', () => {
    Creature.resetIdCounter();
    const engine = buildDemoEngine(12345, { ...SIMULATION_CONSTANTS });
    engine.tick = 60;
    engine.events = [
      { type: 'birth', tick: 40, speciesId: 'meadow_grazer' },
      { type: 'birth', tick: 41, speciesId: 'meadow_grazer' },
      { type: 'death', tick: 42, speciesId: 'meadow_grazer' },
    ];
    const html = renderToStaticMarkup(<SpeciesPanelView worldState={snapshotEngine(engine)} />);

    expect(html).toContain('Live replacement · 2.00×');
    expect(html).not.toContain('Premature deaths by species');
  });
});
