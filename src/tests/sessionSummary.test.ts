import { describe, expect, it } from 'vitest';
import type { WorldSnapshot } from '../state/store';
import { DEFAULT_TRAITS } from '../utils/traits';
import { buildSessionSummary, hasLivingCreatures } from '../ui/sessionSummary';

function world(): WorldSnapshot {
  return {
    width: 1,
    height: 1,
    cells: [{
      energy: 10,
      nutrients: 2,
      producerBiomass: 12.5,
      toxicity: 0,
      elevation: 0.5,
      moisture: 0.5,
      temperature: 0.5,
      biome: 'grassland',
      producerArchetype: 'ground-cover',
    }],
    creatures: [{
      id: 'corpse-1',
      speciesId: 'grazer',
      lineageId: 'grazer-root',
      parentId: null,
      traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
      x: 0,
      y: 0,
      energy: 0,
      age: 40,
      lifecycleState: 'dead',
      corpseDecayTicks: 5,
    }],
    events: [
      { type: 'birth', tick: 2, speciesId: 'grazer', creatureId: 'child' },
      { type: 'mutation', tick: 5, speciesId: 'grazer', creatureId: 'child' },
      { type: 'death', tick: 39, speciesId: 'grazer', creatureId: 'corpse-1' },
      { type: 'extinction', tick: 40, speciesId: 'predator' },
      { type: 'intervention', tick: 41, detail: 'God Mode changed 2 settings' },
    ],
  };
}

describe('session summary', () => {
  it('summarizes the final world and returns latest events first', () => {
    const summary = buildSessionSummary(world(), 41, 3);

    expect(summary).toMatchObject({
      status: 'ended',
      ticksSurvived: 41,
      currentPopulation: 0,
      activeSpecies: 0,
      activeLineages: 0,
      births: 1,
      deaths: 1,
      mutations: 1,
      extinctions: 1,
      interventions: 1,
      speciesObserved: 2,
      remainingBiomass: 12.5,
    });
    expect(summary.finalEvents.map((event) => event.tick)).toEqual([41, 40, 39]);
    expect(summary.recentStories[0]).toMatchObject({ tick: 41, tone: 'intervention' });
  });

  it('detects extinction only when no living creatures remain', () => {
    const extinctWorld = world();
    expect(hasLivingCreatures(extinctWorld)).toBe(false);

    extinctWorld.creatures[0].lifecycleState = 'alive';
    expect(hasLivingCreatures(extinctWorld)).toBe(true);
  });

  it('summarizes a living world and its recorded population peak', () => {
    const livingWorld = world();
    livingWorld.creatures[0].lifecycleState = 'alive';
    livingWorld.creatures.push({
      ...livingWorld.creatures[0],
      id: 'hunter-1', speciesId: 'hunter', lineageId: 'hunter-root',
    });
    livingWorld.history = [
      {
        tick: 0, population: 4,
        speciesPopulations: [
          { speciesId: 'grazer', population: 2 },
          { speciesId: 'hunter', population: 2 },
        ],
        lineageCount: 2, births: 0, deaths: 0, mutations: 0,
      },
      {
        tick: 30, population: 7,
        speciesPopulations: [
          { speciesId: 'grazer', population: 4 },
          { speciesId: 'hunter', population: 3 },
        ],
        lineageCount: 3, births: 5, deaths: 2, mutations: 1,
      },
    ];

    expect(buildSessionSummary(livingWorld, 42)).toMatchObject({
      status: 'living',
      ticksSurvived: 42,
      currentPopulation: 2,
      peakPopulation: 7,
      activeSpecies: 2,
      activeLineages: 2,
    });
  });

  it('is deterministic and handles an empty beginning honestly', () => {
    const empty = world();
    empty.creatures = [];
    empty.events = [];
    empty.history = [];
    const first = buildSessionSummary(empty, 0);
    expect(first).toMatchObject({
      status: 'ended', currentPopulation: 0, peakPopulation: 0,
      speciesObserved: 0, recentStories: [],
    });
    expect(buildSessionSummary(empty, 0)).toEqual(first);
  });
});
