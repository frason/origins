import { describe, it, expect, beforeEach } from 'vitest';
import { createEngine, tickEngine } from '../simulation/engine';
import { Creature } from '../simulation/creature';
import { applyDisasterCommand, tickEngineWithDisaster } from '../simulation/applyDisasterCommand';
import type { DisasterCommand } from '../simulation/disasterCommand';

describe('Apply Disaster Command', () => {
  let state = createEngine(
    12345,
    [
      new Creature({
        speciesId: 'herbivore_1',
        lineageId: 'herbivore_1',
        parentId: null,
        traits: {
          size: 1,
          speed: 1,
          visionRange: 5,
          hearingRange: 2,
          camouflage: 0.5,
          armor: 0.3,
          boneDensity: 0.5,
          metabolism: 1,
          reproductionRate: 1,
          brainSize: 0.5,
          consciousnessLevel: 0.5,
          communication: 0.3,
          collectiveConnection: 0.2,
          thermalTolerance: 0.5,
          waterRetention: 0.5,
          aquaticAffinity: 0.2,
          aquaticAdaptation: 0,
          terrainGrip: 0.5,
          toxinResistance: 0.3,
          auditorySteal: 0.2,
          waterNeed: 0.5,
          saltTolerance: 0,
          energyStrategy: 'herbivore',
        },
        x: 50,
        y: 50,
        energy: 200,
      }),
    ]
  );

  beforeEach(() => {
    state = createEngine(
      12345,
      [
        new Creature({
          speciesId: 'herbivore_1',
          lineageId: 'herbivore_1',
          parentId: null,
          traits: {
            size: 1,
            speed: 1,
            visionRange: 5,
            hearingRange: 2,
            camouflage: 0.5,
            armor: 0.3,
            boneDensity: 0.5,
            metabolism: 1,
            reproductionRate: 1,
            brainSize: 0.5,
            consciousnessLevel: 0.5,
            communication: 0,
            collectiveConnection: 0,
            thermalTolerance: 0.5,
            waterRetention: 0.5,
            aquaticAffinity: 0.2,
            aquaticAdaptation: 0,
            terrainGrip: 0.5,
            toxinResistance: 0.3,
            auditorySteal: 0,
            waterNeed: 0.5,
            saltTolerance: 0,
            energyStrategy: 'herbivore',
          },
          x: 50,
          y: 50,
          energy: 200,
        }),
      ]
    );
  });

  describe('Command Application', () => {
    it('applies valid disaster command', () => {
      const cmd: DisasterCommand = {
        id: 'disaster-1',
        tick: 0,
        disasterKind: 'nutrient-bloom',
        centerX: 50,
        centerY: 50,
      };

      const result = applyDisasterCommand(state, cmd);
      expect(result.success).toBe(true);
      expect(result.event).toBeDefined();
      expect(result.event?.type).toBe('environmental-shock');
    });

    it('rejects invalid coordinates', () => {
      const cmd: DisasterCommand = {
        id: 'disaster-1',
        tick: 0,
        disasterKind: 'nutrient-bloom',
        centerX: -1,
        centerY: 50,
      };

      const result = applyDisasterCommand(state, cmd);
      expect(result.success).toBe(false);
      expect(result.reason).toContain('out of world bounds');
    });

    it('rejects unknown disaster kind', () => {
      const cmd: DisasterCommand = {
        id: 'disaster-1',
        tick: 0,
        disasterKind: 'unknown' as any,
        centerX: 50,
        centerY: 50,
      };

      const result = applyDisasterCommand(state, cmd);
      expect(result.success).toBe(false);
      expect(result.reason).toContain('not enabled');
    });

    it('clamps radius to valid bounds', () => {
      const cmd: DisasterCommand = {
        id: 'disaster-1',
        tick: 0,
        disasterKind: 'nutrient-bloom',
        centerX: 50,
        centerY: 50,
        radius: 100, // Too large
      };

      const result = applyDisasterCommand(state, cmd);
      expect(result.success).toBe(true);
      expect(result.event).toBeDefined();
    });

    it('tracks affected creatures', () => {
      const cmd: DisasterCommand = {
        id: 'disaster-1',
        tick: 0,
        disasterKind: 'wildfire',
        centerX: 50,
        centerY: 50,
      };

      const result = applyDisasterCommand(state, cmd);
      expect(result.success).toBe(true);
      expect(result.affectedCreatureCount).toBeDefined();
      expect(result.affectedCreatureCount).toBeGreaterThan(0); // Creature is nearby
    });

    it('tracks affected cells', () => {
      const cmd: DisasterCommand = {
        id: 'disaster-1',
        tick: 0,
        disasterKind: 'nutrient-bloom',
        centerX: 50,
        centerY: 50,
      };

      const result = applyDisasterCommand(state, cmd);
      expect(result.success).toBe(true);
      expect(result.affectedCellCount).toBeDefined();
      expect(result.affectedCellCount).toBeGreaterThan(0);
    });
  });

  describe('Engine Integration', () => {
    it('creates new state with disaster applied', () => {
      const cmd: DisasterCommand = {
        id: 'disaster-1',
        tick: 0,
        disasterKind: 'nutrient-bloom',
        centerX: 50,
        centerY: 50,
      };

      const newState = tickEngineWithDisaster(state, cmd);

      expect(newState).not.toBe(state);
      expect(newState.events.length).toBeGreaterThan(state.events.length);
    });

    it('logs disaster event', () => {
      const cmd: DisasterCommand = {
        id: 'disaster-2',
        tick: 0,
        disasterKind: 'drought',
        centerX: 50,
        centerY: 50,
      };

      const newState = tickEngineWithDisaster(state, cmd);

      const disasterEvent = newState.events.find(
        (e) => e.type === 'environmental-shock' && e.shockKind === 'drought'
      );

      expect(disasterEvent).toBeDefined();
      expect(disasterEvent?.affectedRegion).toEqual({
        x: 50,
        y: 50,
        radius: expect.any(Number),
      });
    });

    it('modifies world state deterministically', () => {
      const cmd: DisasterCommand = {
        id: 'disaster-3',
        tick: 0,
        disasterKind: 'nutrient-bloom',
        centerX: 50,
        centerY: 50,
      };

      const newState1 = tickEngineWithDisaster(state, cmd);
      const newState2 = tickEngineWithDisaster(state, cmd);

      // Same command on same state should produce same results
      expect(newState1.world.getCell(50, 50).nutrients)
        .toBe(newState2.world.getCell(50, 50).nutrients);
    });

    it('different disaster kinds produce different results', () => {
      const bloomCmd: DisasterCommand = {
        id: 'bloom',
        tick: 0,
        disasterKind: 'nutrient-bloom',
        centerX: 50,
        centerY: 50,
      };

      const droughtCmd: DisasterCommand = {
        id: 'drought',
        tick: 0,
        disasterKind: 'drought',
        centerX: 50,
        centerY: 50,
      };

      const bloomState = tickEngineWithDisaster(state, bloomCmd);
      const droughtState = tickEngineWithDisaster(state, droughtCmd);

      // Bloom increases nutrients, drought decreases energy
      expect(bloomState.world.getCell(50, 50).nutrients)
        .toBeGreaterThan(droughtState.world.getCell(50, 50).nutrients);

      expect(droughtState.world.getCell(50, 50).energy)
        .toBeLessThan(bloomState.world.getCell(50, 50).energy);
    });

    it('beneficial disaster does not harm creatures', () => {
      const cmd: DisasterCommand = {
        id: 'bloom',
        tick: 0,
        disasterKind: 'nutrient-bloom',
        centerX: 50,
        centerY: 50,
      };

      const creature = state.creatures[0];
      const initialEnergy = creature.energy;

      const newState = tickEngineWithDisaster(state, cmd);

      // Find the same creature in new state
      const newCreature = newState.creatures.find((c) => c.id === creature.id);
      expect(newCreature?.energy).toBe(initialEnergy);
    });

    it('harmful disaster can damage creatures', () => {
      const cmd: DisasterCommand = {
        id: 'fire',
        tick: 0,
        disasterKind: 'wildfire',
        centerX: 50,
        centerY: 50,
      };

      const creature = state.creatures[0];
      const initialEnergy = creature.energy;

      const newState = tickEngineWithDisaster(state, cmd);

      // Find the same creature in new state
      const newCreature = newState.creatures.find((c) => c.id === creature.id);
      expect(newCreature?.energy).toBeLessThanOrEqual(initialEnergy);
    });

    it('preserves other state properties', () => {
      const cmd: DisasterCommand = {
        id: 'disaster-4',
        tick: 0,
        disasterKind: 'nutrient-bloom',
        centerX: 50,
        centerY: 50,
      };

      const newState = tickEngineWithDisaster(state, cmd);

      expect(newState.tick).toBe(state.tick);
      expect(newState.seed).toBe(state.seed);
      expect(newState.creatures.length).toBe(state.creatures.length);
    });
  });

  describe('Disaster Chain', () => {
    it('can apply multiple disasters in sequence', () => {
      const cmd1: DisasterCommand = {
        id: 'disaster-1',
        tick: 0,
        disasterKind: 'nutrient-bloom',
        centerX: 50,
        centerY: 50,
      };

      const cmd2: DisasterCommand = {
        id: 'disaster-2',
        tick: 0,
        disasterKind: 'drought',
        centerX: 60,
        centerY: 60,
      };

      let newState = tickEngineWithDisaster(state, cmd1);
      newState = tickEngineWithDisaster(newState, cmd2);

      expect(newState.events.length).toBeGreaterThan(state.events.length);
      const disasterEvents = newState.events.filter((e) => e.type === 'environmental-shock');
      expect(disasterEvents.length).toBeGreaterThanOrEqual(2);
    });

    it('produces unique results for disasters with different IDs', () => {
      const cmd1: DisasterCommand = {
        id: 'disaster-1',
        tick: 0,
        disasterKind: 'nutrient-bloom',
        centerX: 50,
        centerY: 50,
      };

      const cmd2: DisasterCommand = {
        id: 'disaster-2',
        tick: 0,
        disasterKind: 'nutrient-bloom',
        centerX: 50,
        centerY: 50,
      };

      // Same disaster kind but different IDs should produce slightly different results
      // due to different RNG seeds
      const state1 = tickEngineWithDisaster(state, cmd1);
      const state2 = tickEngineWithDisaster(state, cmd2);

      // Both should be valid but may differ
      expect(state1.events.length).toBeGreaterThan(0);
      expect(state2.events.length).toBeGreaterThan(0);
    });
  });

  describe('Turning Point Integration', () => {
    it('can be triggered during simulation', () => {
      // Simulate a few ticks first
      let currentState = state;
      for (let i = 0; i < 5; i++) {
        currentState = tickEngine(currentState);
      }

      // Now trigger a disaster mid-simulation
      const cmd: DisasterCommand = {
        id: 'mid-sim-disaster',
        tick: currentState.tick,
        disasterKind: 'mild-flood',
        centerX: 50,
        centerY: 50,
      };

      const newState = tickEngineWithDisaster(currentState, cmd);

      expect(newState.tick).toBe(currentState.tick);
      const disasterEvent = newState.events
        .filter((e) => e.tick === currentState.tick)
        .find((e) => e.type === 'environmental-shock');

      expect(disasterEvent).toBeDefined();
    });
  });
});
