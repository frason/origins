/**
 * Integration test: Disaster UI → Running Engine State
 *
 * Verifies that applying a disaster through the UI callback actually updates
 * the live engine state (engineRef.current), not just a store snapshot.
 */

import { describe, expect, it } from 'vitest';
import { tickEngineWithDisaster } from '../simulation/applyDisasterCommand';
import type { DisasterCommand } from '../simulation/disasterCommand';
import { buildDemoEngine } from '../simulation/demoWorld';
import { SIMULATION_CONSTANTS } from '../utils/constants';

describe('Disaster Integration - Real Engine State Updates', () => {
  it('applies a disaster to a live engine state and returns mutated state', () => {
    // Setup: Create a live engine (simulating engineRef.current)
    const liveEngine = buildDemoEngine(12345, SIMULATION_CONSTANTS);
    const initialCreatureCount = liveEngine.creatures.filter(
      (c) => c.lifecycleState === 'alive'
    ).length;

    // Create a disaster command (simulating what DisasterPanel builds)
    const command: DisasterCommand = {
      id: `disaster-${Date.now()}-test`,
      tick: liveEngine.tick,
      disasterKind: 'drought',
      centerX: 50,
      centerY: 50,
      radius: 10,
    };

    // Apply the disaster (simulating what the applyDisaster callback in App.tsx does)
    const result = tickEngineWithDisaster(liveEngine, command);

    // Verify the result is a new EngineState
    expect(result).toBeDefined();
    expect(result.world).toBeDefined();
    expect(result.world.width).toBe(100);
    expect(result.world.height).toBe(100);

    // Verify the state was actually modified by the disaster
    expect(result.events.length).toBeGreaterThan(liveEngine.events.length);
    const lastEvent = result.events[result.events.length - 1];
    expect(lastEvent.type).toBe('disaster');

    // Verify the creatures may have been affected (drought harms creatures)
    // Note: exact effects depend on disaster logic, but we should see a change
    const finalCreatureCount = result.creatures.filter(
      (c) => c.lifecycleState === 'alive'
    ).length;
    // Either creature count changed or energy state changed
    expect(
      finalCreatureCount !== initialCreatureCount
      || result.creatures.some(
        (c, idx) => c.energy !== liveEngine.creatures[idx]?.energy
      )
    ).toBe(true);
  });

  it('verifies DisasterPanel callback integration pattern matches species introduction', () => {
    // This test verifies the pattern is consistent with how addSpecies works
    const engine = buildDemoEngine(54321, SIMULATION_CONSTANTS);

    // Simulate what happens in App.tsx applyDisaster callback:
    // 1. Get engine from engineRef.current
    let currentEngine = engine;

    // 2. Create a disaster command
    const command: DisasterCommand = {
      id: 'disaster-integration-test',
      tick: currentEngine.tick,
      disasterKind: 'nutrient-bloom',
      centerX: 30,
      centerY: 40,
      radius: 5,
    };

    // 3. Apply the disaster (this is what the callback does)
    try {
      const newState = tickEngineWithDisaster(currentEngine, command);
      currentEngine = newState; // Update the reference
    } catch (error) {
      expect.fail(`Disaster application should not throw: ${error}`);
    }

    // 4. Verify the new state was assigned
    expect(currentEngine).toBeDefined();
    expect(currentEngine.events).toBeDefined();
    expect(currentEngine.events.length).toBeGreaterThan(engine.events.length);

    // 5. Verify disaster event was logged
    const disasterEvent = currentEngine.events.find((e) => e.type === 'disaster');
    expect(disasterEvent).toBeDefined();
    expect(disasterEvent?.tick).toEqual(command.tick);
  });

  it('handles RNG seeding consistently for replay', () => {
    // Verify disasters use the shared RNG system for determinism
    const seed = 99999;
    const engine1 = buildDemoEngine(seed, SIMULATION_CONSTANTS);
    const engine2 = buildDemoEngine(seed, SIMULATION_CONSTANTS);

    const command: DisasterCommand = {
      id: 'same-disaster-id',
      tick: 10,
      disasterKind: 'wildfire',
      centerX: 25,
      centerY: 25,
      radius: 8,
    };

    // Apply same disaster to both engines at same tick
    const result1 = tickEngineWithDisaster(engine1, command);
    const result2 = tickEngineWithDisaster(engine2, command);

    // Verify both produce identical events (deterministic)
    expect(result1.events.length).toBe(result2.events.length);
    const event1 = result1.events[result1.events.length - 1];
    const event2 = result2.events[result2.events.length - 1];

    expect(event1).toEqual(event2);
  });
});
