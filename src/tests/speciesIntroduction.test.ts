import { describe, expect, it } from 'vitest';
import { Creature } from '../simulation/creature';
import { createEngine, introduceSpecies, tickEngine, type EngineState } from '../simulation/engine';
import { DEFAULT_TRAITS } from '../utils/traits';

function founder() {
  return new Creature({
    speciesId: 'resident',
    lineageId: 'resident',
    parentId: null,
    traits: { ...DEFAULT_TRAITS, energyStrategy: 'herbivore' },
    x: 0,
    y: 0,
    energy: 100,
  });
}

function engine(): EngineState {
  Creature.resetIdCounter();
  return createEngine(314, [founder()], 20, 20);
}

function habitableTile(state: EngineState) {
  for (let y = 0; y < state.world.height; y++) {
    for (let x = 0; x < state.world.width; x++) {
      const biome = state.world.getCell(x, y).biome;
      if (biome !== 'ocean' && biome !== 'mountain') return { x, y };
    }
  }
  throw new Error('test world has no habitable tile');
}

function replayShape(result: ReturnType<typeof introduceSpecies>) {
  return {
    speciesId: result.speciesId,
    creatureIds: result.creatureIds,
    founders: result.state.creatures.slice(-3).map((creature) => ({
      id: creature.id,
      speciesId: creature.speciesId,
      strategy: creature.traits.energyStrategy,
      x: creature.x,
      y: creature.y,
      energy: creature.energy,
    })),
    event: result.state.events[result.state.events.length - 1],
  };
}

describe('God Mode species introduction', () => {
  it('places three deterministic founders in open habitat and records a checkpoint', () => {
    const state = engine();
    const result = introduceSpecies(state, 'scavenger', habitableTile(state));
    const founders = result.state.creatures.slice(-3);

    expect(state.creatures).toHaveLength(1);
    expect(founders).toHaveLength(3);
    expect(new Set(founders.map((creature) => `${creature.x},${creature.y}`)).size).toBe(3);
    expect(founders.every((creature) => creature.speciesId === result.speciesId)).toBe(true);
    expect(founders.every((creature) => creature.traits.energyStrategy === 'scavenger')).toBe(true);
    expect(result.state.events[result.state.events.length - 1]).toMatchObject({
      type: 'intervention',
      interventionKind: 'species-introduction',
      speciesId: 'introduced_scavenger_1',
      introducedStrategy: 'scavenger',
      interventionOrigin: habitableTile(state),
      founderCount: 3,
      ecosystemBefore: { population: 1, speciesCount: 1, lineageCount: 1 },
    });
    expect(result.state.history).toHaveLength(1);
    expect(result.state.history[0]).toMatchObject({ tick: 0, population: 4 });
  });

  it('uses a unique stable identity for each introduction', () => {
    const state = engine();
    const first = introduceSpecies(state, 'herbivore', habitableTile(state));
    const second = introduceSpecies(first.state, 'herbivore', habitableTile(first.state));

    expect(first.speciesId).toBe('introduced_herbivore_1');
    expect(second.speciesId).toBe('introduced_herbivore_2');
    expect(new Set(second.creatureIds).size).toBe(3);
  });

  it('records a normalized player name in the stable species identity', () => {
    const state = engine();
    const result = introduceSpecies(
      state,
      'herbivore',
      habitableTile(state),
      '  Tundra   Nibblers '
    );

    expect(result.speciesId).toContain('~Tundra%20Nibblers');
    expect(result.state.events[result.state.events.length - 1]?.detail)
      .toContain('Tundra Nibblers');
    expect(result.state.creatures.slice(-3).every(
      (creature) => creature.speciesId === result.speciesId
    )).toBe(true);
  });

  it('rejects out-of-world and uninhabitable origins without changing state', () => {
    const state = engine();
    expect(() => introduceSpecies(state, 'omnivore', { x: -1, y: 0 }))
      .toThrow('Choose a tile inside the world');

    const origin = habitableTile(state);
    state.world.setCell(origin.x, origin.y, { biome: 'ocean' });
    expect(() => introduceSpecies(state, 'omnivore', origin))
      .toThrow('Choose a habitable land tile');
    expect(state.events).toHaveLength(0);
    expect(state.creatures).toHaveLength(1);
  });

  it('replays identical state and action with identical placement and history', () => {
    const firstState = engine();
    const first = introduceSpecies(firstState, 'carnivore', habitableTile(firstState));
    let firstReplay = first.state;
    for (let tick = 0; tick < 5; tick++) firstReplay = tickEngine(firstReplay);

    const secondState = engine();
    const second = introduceSpecies(secondState, 'carnivore', habitableTile(secondState));
    let secondReplay = second.state;
    for (let tick = 0; tick < 5; tick++) secondReplay = tickEngine(secondReplay);

    expect(replayShape(second)).toEqual(replayShape(first));
    expect({
      tick: secondReplay.tick,
      world: secondReplay.world.toJSON(),
      creatures: secondReplay.creatures.map((creature) => creature.toJSON()),
      events: secondReplay.events,
    }).toEqual({
      tick: firstReplay.tick,
      world: firstReplay.world.toJSON(),
      creatures: firstReplay.creatures.map((creature) => creature.toJSON()),
      events: firstReplay.events,
    });
  });
});
