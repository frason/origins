import { describe, expect, it } from 'vitest';
import { captureCheckpoint, restoreCheckpoint } from '../simulation/checkpointTimeline';
import { buildDemoEngine } from '../simulation/demoWorld';
import { tickEngine, type EngineState } from '../simulation/engine';
import { SIMULATION_CONSTANTS } from '../utils/constants';

interface State {
  tick: number;
  events: string[];
}

describe('bounded deterministic checkpoint timeline', () => {
  it('captures fixed intervals, replaces same-tick state, and stays bounded', () => {
    let checkpoints: ReturnType<typeof captureCheckpoint<State>> = [];
    for (let tick = 0; tick <= 60; tick++) {
      checkpoints = captureCheckpoint(checkpoints, { tick, events: [`tick-${tick}`] }, 10, 3);
    }
    expect(checkpoints.map((checkpoint) => checkpoint.tick)).toEqual([40, 50, 60]);

    checkpoints = captureCheckpoint(checkpoints, { tick: 60, events: ['intervention'] }, 10, 3);
    expect(checkpoints).toHaveLength(3);
    expect(checkpoints[2].state.events).toEqual(['intervention']);
  });

  it('restores exact state and removes the replaced future', () => {
    const atTen = { tick: 10, events: ['before'] };
    const atTwenty = { tick: 20, events: ['before', 'future intervention'] };
    const checkpoints = [
      { tick: 10, state: atTen },
      { tick: 20, state: atTwenty },
    ];
    const restored = restoreCheckpoint(checkpoints, 10);

    expect(restored?.state).toBe(atTen);
    expect(restored?.checkpoints.map((checkpoint) => checkpoint.tick)).toEqual([10]);
    expect(restoreCheckpoint(checkpoints, 15)).toBeNull();
  });

  it('continues to an identical complete engine state from the same checkpoint', () => {
    const constants = { ...SIMULATION_CONSTANTS, worldWidth: 20, worldHeight: 20 };
    let state = buildDemoEngine(42, constants);
    for (let tick = 0; tick < 10; tick++) state = tickEngine(state, constants);
    const checkpoints = captureCheckpoint<EngineState>([], state);

    const continueFiveTicks = (start: EngineState) => {
      let next = start;
      for (let tick = 0; tick < 5; tick++) next = tickEngine(next, constants);
      return {
        tick: next.tick,
        world: next.world.toJSON(),
        creatures: next.creatures.map((creature) => creature.toJSON()),
        events: next.events,
        history: next.history,
      };
    };

    const firstFuture = continueFiveTicks(state);
    const restored = restoreCheckpoint(checkpoints, 10);
    expect(restored).not.toBeNull();
    expect(continueFiveTicks(restored!.state)).toEqual(firstFuture);
  });
});
