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
      ticksSurvived: 41,
      births: 1,
      deaths: 1,
      mutations: 1,
      extinctions: 1,
      interventions: 1,
      speciesObserved: 2,
      remainingBiomass: 12.5,
    });
    expect(summary.finalEvents.map((event) => event.tick)).toEqual([41, 40, 39]);
  });

  it('detects extinction only when no living creatures remain', () => {
    const extinctWorld = world();
    expect(hasLivingCreatures(extinctWorld)).toBe(false);

    extinctWorld.creatures[0].lifecycleState = 'alive';
    expect(hasLivingCreatures(extinctWorld)).toBe(true);
  });
});
