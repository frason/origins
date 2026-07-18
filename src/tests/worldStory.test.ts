import { describe, expect, it } from 'vitest';
import type { WorldSnapshot } from '../state/store';
import { DEFAULT_TRAITS } from '../utils/traits';
import { buildWorldStory } from '../ui/worldStory';

function world(): WorldSnapshot {
  return {
    width: 1,
    height: 1,
    seed: 42,
    cells: [],
    creatures: [{
      id: 'living', speciesId: 'grazer', lineageId: 'grazer', parentId: null,
      traits: DEFAULT_TRAITS, x: 0, y: 0, energy: 10, age: 1,
      lifecycleState: 'alive', corpseDecayTicks: 0,
    }],
    events: [
      { type: 'mutation', tick: 12, speciesId: 'grazer', lineageId: 'branch' },
      { type: 'intervention', tick: 15, detail: 'God Mode changed producer growth' },
    ],
    history: [
      { tick: 0, population: 10, speciesPopulations: [{ speciesId: 'grazer', population: 10 }], lineageCount: 1, births: 0, deaths: 0, mutations: 0 },
      { tick: 10, population: 3, speciesPopulations: [{ speciesId: 'grazer', population: 3 }], lineageCount: 1, births: 0, deaths: 7, mutations: 0 },
      { tick: 20, population: 8, speciesPopulations: [{ speciesId: 'grazer', population: 8 }], lineageCount: 2, births: 5, deaths: 7, mutations: 1 },
    ],
  };
}

describe('deterministic world story', () => {
  it('describes a living recovery and recorded evolution without inventing causes', () => {
    const state = world();
    state.creatures = Array.from({ length: 8 }, (_, index) => ({
      ...state.creatures[0], id: `living-${index}`,
    }));
    const story = buildWorldStory(state, 20);

    expect(story.heading).toContain('still evolving');
    expect(story.paragraphs.join(' ')).toContain('recovered');
    expect(story.paragraphs.join(' ')).toContain('1 lineage branch was recorded');
    expect(story.paragraphs.join(' ')).toContain('1 God Mode intervention is part of the record');
    expect(buildWorldStory(state, 20)).toEqual(story);
  });

  it('honestly describes extinction and names extinct species', () => {
    const state = world();
    state.creatures = [];
    state.events.push({ type: 'extinction', tick: 22, speciesId: 'grazer' });
    const story = buildWorldStory(state, 22);

    expect(story.heading).toContain('rise and fall');
    expect(story.paragraphs.join(' ')).toContain('declined from that peak to zero');
    expect(story.paragraphs.join(' ')).toContain('disappeared');
  });

  it('uses an honest fallback for an empty uneventful session', () => {
    const state = world();
    state.creatures = [];
    state.events = [];
    state.history = [];
    expect(buildWorldStory(state, 0).paragraphs).toEqual([
      'No animal population or major ecological event was recorded in this session.',
    ]);
  });
});
