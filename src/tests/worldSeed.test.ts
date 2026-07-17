import { describe, expect, it } from 'vitest';
import { buildDemoEngine } from '../simulation/demoWorld';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import { MAX_WORLD_SEED, parseWorldSeed } from '../ui/worldSeed';

const testConstants = {
  ...SIMULATION_CONSTANTS,
  worldWidth: 20,
  worldHeight: 20,
};

function initialSnapshot(seed: number) {
  const engine = buildDemoEngine(seed, testConstants);
  return {
    seed: engine.seed,
    world: engine.world.toJSON(),
    creatures: engine.creatures.map((creature) => creature.toJSON()),
    events: engine.events,
  };
}

describe('player-selectable world seeds', () => {
  it('accepts whole-number seeds in the supported range', () => {
    expect(parseWorldSeed(' 42 ')).toEqual({ seed: 42, message: null });
    expect(parseWorldSeed(String(MAX_WORLD_SEED))).toEqual({
      seed: MAX_WORLD_SEED,
      message: null,
    });
  });

  it('rejects missing and non-numeric seeds', () => {
    expect(parseWorldSeed('')).toMatchObject({ seed: null });
    expect(parseWorldSeed('not-a-seed')).toMatchObject({ seed: null });
  });

  it('normalizes decimal and out-of-range seeds with an explanation', () => {
    expect(parseWorldSeed('42.9')).toMatchObject({ seed: 42 });
    expect(parseWorldSeed('-5')).toMatchObject({ seed: 0 });
    expect(parseWorldSeed('999999999999')).toMatchObject({ seed: MAX_WORLD_SEED });
    expect(parseWorldSeed('42.9').message).toContain('adjusted');
  });

  it('builds identical initial histories from the same seed', () => {
    expect(initialSnapshot(8675309)).toEqual(initialSnapshot(8675309));
  });

  it('builds different terrain and placements from different seeds', () => {
    const first = initialSnapshot(101);
    const second = initialSnapshot(202);

    expect(second.world).not.toEqual(first.world);
    expect(second.creatures).not.toEqual(first.creatures);
  });
});
