import { describe, expect, it } from 'vitest';
import {
  captureCheckpoint,
  restoreCheckpoint,
  CHECKPOINT_FORMAT_VERSION,
  type Phase0State,
} from '../simulation/checkpointTimeline';
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
      { version: CHECKPOINT_FORMAT_VERSION, tick: 10, state: atTen },
      { version: CHECKPOINT_FORMAT_VERSION, tick: 20, state: atTwenty },
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

  describe('checkpoint versioning and Phase 0 state', () => {
    it('should include version field in checkpoint', () => {
      let checkpoints: ReturnType<typeof captureCheckpoint<State>> = [];
      checkpoints = captureCheckpoint(checkpoints, { tick: 10, events: ['test'] }, 10, 3);
      expect(checkpoints[0].version).toBe(CHECKPOINT_FORMAT_VERSION);
    });

    it('should capture Phase 0 state when provided', () => {
      const phase0: Phase0State = {
        ledger: { energy: 500, biomass: 100 },
        scout: {
          id: 'scout_0',
          x: 50,
          y: 50,
          waypoint: null,
          battery: 100,
          inBubble: true,
          status: 'active',
          onboardDiscoveries: [],
        },
        buildings: [
          {
            id: 'building_1',
            x: 40,
            y: 40,
            state: 'operational',
            decayTicks: 0,
            builtAtTick: 0,
          },
        ],
        crises: [
          {
            id: 'crisis_1',
            type: 'toxicity_spike',
            x: 30,
            y: 30,
            tick: 10,
            status: 'active',
          },
        ],
      };

      let checkpoints: ReturnType<typeof captureCheckpoint<State>> = [];
      checkpoints = captureCheckpoint(checkpoints, { tick: 10, events: ['test'] }, 10, 3, phase0);
      expect(checkpoints[0].phase0).toEqual(phase0);
    });

    it('should round-trip Phase 0 state through capture and restore', () => {
      const phase0: Phase0State = {
        ledger: { energy: 250, biomass: 50 },
        scout: {
          id: 'scout_0',
          x: 60,
          y: 70,
          waypoint: { x: 80, y: 80 },
          battery: 80,
          inBubble: false,
          status: 'active',
          onboardDiscoveries: [
            { tick: 5, x: 55, y: 65, type: 'discovery', payload: { severity: 'high' } },
          ],
        },
        buildings: [
          {
            id: 'building_1',
            x: 40,
            y: 40,
            state: 'dormant',
            decayTicks: 10,
            builtAtTick: 0,
          },
          {
            id: 'building_2',
            x: 45,
            y: 45,
            state: 'operational',
            decayTicks: 0,
            builtAtTick: 5,
          },
        ],
        crises: [
          {
            id: 'crisis_1',
            type: 'toxicity_spike',
            x: 30,
            y: 30,
            tick: 10,
            status: 'active',
          },
          {
            id: 'crisis_2',
            type: 'toxicity_spike',
            x: 35,
            y: 35,
            tick: 9,
            status: 'resolved',
          },
        ],
      };

      let checkpoints: ReturnType<typeof captureCheckpoint<State>> = [];
      checkpoints = captureCheckpoint(checkpoints, { tick: 10, events: ['test'] }, 10, 3, phase0);

      const restored = restoreCheckpoint(checkpoints, 10);
      expect(restored).not.toBeNull();
      expect(restored?.state).toEqual({ tick: 10, events: ['test'] });
      expect(restored?.checkpoints[0].phase0).toEqual(phase0);
      expect(restored?.checkpoints[0].phase0?.ledger).toEqual({ energy: 250, biomass: 50 });
      expect(restored?.checkpoints[0].phase0?.scout?.id).toBe('scout_0');
      expect(restored?.checkpoints[0].phase0?.buildings).toHaveLength(2);
      expect(restored?.checkpoints[0].phase0?.crises).toHaveLength(2);
    });

    it('should throw error when restoring checkpoint with mismatched version', () => {
      const atTen = { tick: 10, events: ['before'] };
      const checkpointsWithWrongVersion = [
        {
          version: CHECKPOINT_FORMAT_VERSION + 1, // wrong version
          tick: 10,
          state: atTen,
        },
      ];
      expect(() => restoreCheckpoint(checkpointsWithWrongVersion, 10)).toThrow(
        /format version mismatch/i
      );
    });

    it('should include version info in error message', () => {
      const atTen = { tick: 10, events: ['before'] };
      const checkpointsWithWrongVersion = [
        {
          version: 999,
          tick: 10,
          state: atTen,
        },
      ];
      expect(() => restoreCheckpoint(checkpointsWithWrongVersion, 10)).toThrow(/v999/);
      expect(() => restoreCheckpoint(checkpointsWithWrongVersion, 10)).toThrow(
        new RegExp(`v${CHECKPOINT_FORMAT_VERSION}`)
      );
    });

    it('should preserve Phase 0 state exactly across multiple checkpoints', () => {
      const phase0_1: Phase0State = {
        ledger: { energy: 500, biomass: 0 },
        scout: {
          id: 'scout_0',
          x: 50,
          y: 50,
          waypoint: null,
          battery: 100,
          inBubble: true,
          status: 'active',
          onboardDiscoveries: [],
        },
      };

      const phase0_2: Phase0State = {
        ledger: { energy: 480, biomass: 10 },
        scout: {
          id: 'scout_0',
          x: 50,
          y: 50,
          waypoint: { x: 60, y: 60 },
          battery: 90,
          inBubble: true,
          status: 'active',
          onboardDiscoveries: [],
        },
      };

      let checkpoints: ReturnType<typeof captureCheckpoint<State>> = [];
      checkpoints = captureCheckpoint(checkpoints, { tick: 0, events: [] }, 10, 10, phase0_1);
      checkpoints = captureCheckpoint(checkpoints, { tick: 10, events: [] }, 10, 10, phase0_2);

      const restored0 = restoreCheckpoint(checkpoints, 0);
      const restored10 = restoreCheckpoint(checkpoints, 10);

      expect(restored0?.checkpoints[0].phase0).toEqual(phase0_1);
      expect(restored10?.checkpoints[1].phase0).toEqual(phase0_2);
    });
  });
});
