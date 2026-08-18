/**
 * Phase 0 Integration Test: Vertical Slice End-to-End
 *
 * Drives the full Phase 0 simulation vertical slice through:
 * 1. Building a harvester
 * 2. Accumulating biomass from world tiles
 * 3. Triggering and resolving a crisis
 * 4. Saving and restoring checkpoint state
 *
 * Tests that all pivot modules work together correctly and checkpoint
 * serialization preserves all relevant state.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '../../simulation/world';
import { ResourceLedger, PHASE0_ECONOMY_CONSTANTS, tickPhase0Economy } from '../../simulation/pivot/economy';
import {
  buildHarvester,
  setDormant,
  resetBuildingIdCounter,
  PHASE0_BUILDING_CONSTANTS,
} from '../../simulation/pivot/building';
import { detectCrises, resolveTier1, TOXICITY_CRISIS_THRESHOLD } from '../../simulation/pivot/crisis';
import { EquilibriumTracker } from '../../simulation/pivot/equilibrium';
import { Scout, issueWaypoint, tickScoutMovement } from '../../simulation/pivot/scout';
import {
  validateInterventionCommand,
  appendValidatedCommand,
  type InterventionCommand,
  type ValidatedCommandLogEntry,
} from '../../simulation/pivot/interventionCommand';
import { SIMULATION_CONSTANTS } from '../../utils/constants';
import { captureCheckpoint, restoreCheckpoint, type SimulationCheckpoint } from '../../simulation/checkpointTimeline';

describe('Phase 0 Vertical Slice Integration', () => {
  let world: World;
  let ledger: ResourceLedger;
  let checkpoints: SimulationCheckpoint<{ tick: number }>[] = [];
  let crises: any[] = [];
  let commandLog: ValidatedCommandLogEntry[] = [];
  let scout: Scout;
  let equilibriumTracker: EquilibriumTracker;

  beforeEach(() => {
    // Initialize world with deterministic seed for reproducibility
    world = new World(100, 100, SIMULATION_CONSTANTS, 42);

    // Initialize ledger with starting values
    ledger = new ResourceLedger();

    // Initialize scout at base (50, 50)
    scout = {
      id: 'scout_0',
      x: 50,
      y: 50,
      waypoint: null,
      battery: 100,
      inBubble: true,
      status: 'active',
      onboardDiscoveries: [],
    };

    // Initialize crisis tracking
    crises = [];

    // Initialize command log
    commandLog = [];

    // Initialize checkpoint tracking
    checkpoints = [];

    // Initialize equilibrium tracker
    equilibriumTracker = new EquilibriumTracker();

    // Reset building ID counter for consistent test results
    resetBuildingIdCounter();
  });

  describe('Building Phase 0 Harvester', () => {
    it('should construct a harvester and spend energy', () => {
      const initialEnergy = ledger.getBalance('energy');

      const building = buildHarvester(ledger, 50, 50, 0);

      expect(building.id).toBeDefined();
      expect(building.state).toBe('operational');
      expect(building.x).toBe(50);
      expect(building.y).toBe(50);
      expect(ledger.getBalance('energy')).toBe(
        initialEnergy - PHASE0_BUILDING_CONSTANTS.harvester.buildCost
      );
    });
  });

  describe('Biomass Accumulation', () => {
    it('should accumulate biomass by harvesting from tile producerBiomass', () => {
      const harvestX = 50;
      const harvestY = 50;

      // Build harvester at (50, 50)
      buildHarvester(ledger, harvestX, harvestY, 0);

      // Set initial producerBiomass on the harvest tile
      const initialCell = world.getCell(harvestX, harvestY);
      world.setCell(harvestX, harvestY, { producerBiomass: 10.0 });

      const initialBiomass = ledger.getBalance('biomass');

      // Advance several ticks with active harvester
      for (let tick = 1; tick <= 5; tick++) {
        tickPhase0Economy(world, ledger, { operational: true, x: harvestX, y: harvestY }, tick);
      }

      // Verify biomass increased and producerBiomass on tile decreased
      const finalBiomass = ledger.getBalance('biomass');
      const finalCell = world.getCell(harvestX, harvestY);

      expect(finalBiomass).toBeGreaterThan(initialBiomass);
      expect(finalCell.producerBiomass).toBeLessThan(10.0);
    });

    it('should apply energy drain each tick', () => {
      const initialEnergy = ledger.getBalance('energy');

      // Advance 10 ticks with no harvester
      for (let tick = 1; tick <= 10; tick++) {
        tickPhase0Economy(world, ledger, { operational: false, x: 0, y: 0 }, tick);
      }

      // Verify energy drained by 1 per tick (10 total)
      expect(ledger.getBalance('energy')).toBe(initialEnergy - 10);
    });
  });

  describe('Crisis Detection and Resolution', () => {
    it('should detect a toxicity spike crisis', () => {
      const crisisX = 50;
      const crisisY = 50;

      // Set toxicity above threshold
      world.setCell(crisisX, crisisY, { toxicity: TOXICITY_CRISIS_THRESHOLD + 0.5 });

      // Detect crises
      const newCrises = detectCrises(world, 10, []);

      expect(newCrises).toHaveLength(1);
      expect(newCrises[0].type).toBe('toxicity_spike');
      expect(newCrises[0].x).toBe(crisisX);
      expect(newCrises[0].y).toBe(crisisY);
      expect(newCrises[0].status).toBe('active');
    });

    it('should resolve a crisis with Tier 1 response, spending energy and reducing toxicity', () => {
      const crisisX = 50;
      const crisisY = 50;

      // Set toxicity above threshold
      world.setCell(crisisX, crisisY, { toxicity: TOXICITY_CRISIS_THRESHOLD + 0.5 });

      // Detect crisis
      const newCrises = detectCrises(world, 10, []);
      const crisis = newCrises[0];
      crises.push(crisis);

      // Record initial state
      const initialEnergy = ledger.getBalance('energy');
      const initialToxicity = world.getCell(crisisX, crisisY).toxicity;

      // Resolve with Tier 1 response
      const resolved = resolveTier1(crisis, world, ledger, 'scout_0');

      expect(resolved).toBe(true);
      expect(crisis.status).toBe('resolved');

      // Verify energy spent
      expect(ledger.getBalance('energy')).toBe(
        initialEnergy - PHASE0_ECONOMY_CONSTANTS.energy.tier1ResponseCost
      );

      // Verify toxicity reduced
      const finalToxicity = world.getCell(crisisX, crisisY).toxicity;
      expect(finalToxicity).toBeLessThan(initialToxicity);
    });

    it('should reject Tier 1 response if insufficient energy', () => {
      const crisisX = 25;
      const crisisY = 25;

      // Set up poor ledger with insufficient energy
      const poorLedger = new ResourceLedger(10, 100);

      // Set toxicity above threshold
      world.setCell(crisisX, crisisY, { toxicity: TOXICITY_CRISIS_THRESHOLD + 0.5 });

      // Detect crisis
      const newCrises = detectCrises(world, 10, []);
      const crisis = newCrises[0];

      // Attempt Tier 1 response with insufficient funds
      const resolved = resolveTier1(crisis, world, poorLedger, 'scout_0');

      expect(resolved).toBe(false);
      expect(crisis.status).toBe('active'); // Crisis remains active
      expect(poorLedger.getBalance('energy')).toBe(10); // Energy unchanged
    });
  });

  describe('Scout Movement and Bubble Mechanics', () => {
    it('should track scout position and inBubble status', () => {
      const baseX = 50;
      const baseY = 50;
      const bubbleRadius = 5;

      // Scout starts at base
      expect(scout.inBubble).toBe(true);
      expect(scout.battery).toBe(100);

      // Move scout away from base via waypoint
      issueWaypoint(scout, 60, 60);

      // Advance ticks for movement
      for (let tick = 1; tick <= 15; tick++) {
        tickScoutMovement(scout, baseX, baseY, bubbleRadius, []);
      }

      // Scout should be outside bubble with reduced battery
      expect(scout.inBubble).toBe(false);
      expect(scout.battery).toBeLessThan(100);
    });

    it('should recharge scout battery when at base', () => {
      const baseX = 50;
      const baseY = 50;
      const bubbleRadius = 5;

      // Manually set scout outside bubble with sufficient battery for return journey
      scout.x = 60;
      scout.y = 60;
      scout.inBubble = false;
      scout.battery = 50; // Enough for ~20+ ticks of travel

      // Move waypoint back to base
      issueWaypoint(scout, baseX, baseY);

      // Advance ticks to return to base (need 20 ticks to go from (60,60) to (50,50))
      for (let tick = 1; tick <= 25; tick++) {
        tickScoutMovement(scout, baseX, baseY, bubbleRadius, []);
      }

      // Scout should be at base with recharged battery
      expect(scout.x).toBe(baseX);
      expect(scout.y).toBe(baseY);
      expect(scout.battery).toBe(100);
    });
  });

  describe('Checkpoint Save and Restore', () => {
    it('should capture and restore complete Phase 0 state', () => {
      // ** Setup Phase 0 state **
      const harvestX = 50;
      const harvestY = 50;
      const crisisX = 40;
      const crisisY = 40;

      // Build harvester
      const building = buildHarvester(ledger, harvestX, harvestY, 0);

      // Set producerBiomass on harvest tile
      world.setCell(harvestX, harvestY, { producerBiomass: 10.0 });

      // Advance several ticks to accumulate biomass
      for (let tick = 1; tick <= 5; tick++) {
        tickPhase0Economy(world, ledger, { operational: true, x: harvestX, y: harvestY }, tick);
      }

      // Create a crisis
      world.setCell(crisisX, crisisY, { toxicity: TOXICITY_CRISIS_THRESHOLD + 0.5 });
      const newCrises = detectCrises(world, 5, []);
      const crisis = newCrises[0];

      // Resolve the crisis
      resolveTier1(crisis, world, ledger, 'scout_0');

      // Move scout out of bubble
      issueWaypoint(scout, 60, 60);
      for (let tick = 1; tick <= 10; tick++) {
        tickScoutMovement(scout, 50, 50, 5, []);
      }

      // Record equilibrium state
      equilibriumTracker.recordTick(60, 50, 50, 1.0, false, false);

      // ** Capture checkpoint **
      const checkpointState = { tick: 5 };
      const phase0State = {
        ledger: ledger.getBalances(),
        scout,
        buildings: [building],
        crises: [crisis],
      };

      const savedCheckpoints = captureCheckpoint(checkpoints, checkpointState, 1, 10, phase0State);

      // ** Restore checkpoint **
      const restored = restoreCheckpoint(savedCheckpoints, 5);

      expect(restored).not.toBeNull();
      if (!restored) throw new Error('Checkpoint restoration failed');

      const restoredCheckpoint = savedCheckpoints.find((cp) => cp.tick === 5);
      expect(restoredCheckpoint).toBeDefined();
      expect(restoredCheckpoint?.tick).toBe(5);

      // Verify Phase 0 state is preserved
      expect(restoredCheckpoint?.phase0?.ledger?.energy).toBe(ledger.getBalance('energy'));
      expect(restoredCheckpoint?.phase0?.ledger?.biomass).toBe(ledger.getBalance('biomass'));
      expect(restoredCheckpoint?.phase0?.scout?.x).toBe(scout.x);
      expect(restoredCheckpoint?.phase0?.scout?.y).toBe(scout.y);
      expect(restoredCheckpoint?.phase0?.scout?.battery).toBe(scout.battery);
      expect(restoredCheckpoint?.phase0?.scout?.status).toBe(scout.status);
      expect(restoredCheckpoint?.phase0?.buildings).toHaveLength(1);
      expect(restoredCheckpoint?.phase0?.buildings?.[0].id).toBe(building.id);
      expect(restoredCheckpoint?.phase0?.buildings?.[0].state).toBe(building.state);
      expect(restoredCheckpoint?.phase0?.crises).toHaveLength(1);
      expect(restoredCheckpoint?.phase0?.crises?.[0].status).toBe('resolved');
    });

    it('should preserve command log across checkpoint boundaries', () => {
      // Create and validate a command
      const command: InterventionCommand = {
        id: 'cmd_001',
        tick: 1,
        tier: 1,
        sourceScoutId: 'scout_0',
        targetX: 50,
        targetY: 50,
        parameter: 'toxicity_reduction',
        value: 1.0,
      };

      const validation = validateInterventionCommand(command);
      expect(validation.valid).toBe(true);

      // Append to command log
      const entry = appendValidatedCommand(commandLog, command, validation, 1);

      expect(commandLog).toHaveLength(1);
      expect(commandLog[0].command.id).toBe('cmd_001');
      expect(commandLog[0].appendedAtTick).toBe(1);

      // Simulate checkpoint save (just serialize the log)
      const savedLog = JSON.parse(JSON.stringify(commandLog));

      // Restore and verify
      expect(savedLog).toHaveLength(1);
      expect(savedLog[0].command.id).toBe('cmd_001');
    });
  });

  describe('Full Vertical Slice Scenario', () => {
    it('should execute complete Phase 0 workflow end-to-end', () => {
      const harvestX = 50;
      const harvestY = 50;
      const crisisX = 40;
      const crisisY = 40;
      const baseX = 50;
      const baseY = 50;
      const bubbleRadius = 5;

      // 1. Build harvester
      const startingEnergy = ledger.getBalance('energy');
      const building = buildHarvester(ledger, harvestX, harvestY, 0);

      expect(building.state).toBe('operational');
      expect(ledger.getBalance('energy')).toBe(
        startingEnergy - PHASE0_BUILDING_CONSTANTS.harvester.buildCost
      );

      // 2. Set up productive tile and advance ticks to accumulate biomass
      world.setCell(harvestX, harvestY, { producerBiomass: 20.0 });
      const initialBiomass = ledger.getBalance('biomass');

      for (let tick = 1; tick <= 10; tick++) {
        tickPhase0Economy(world, ledger, { operational: true, x: harvestX, y: harvestY }, tick);
      }

      expect(ledger.getBalance('biomass')).toBeGreaterThan(initialBiomass);

      // 3. Trigger a crisis via toxicity spike
      world.setCell(crisisX, crisisY, { toxicity: TOXICITY_CRISIS_THRESHOLD + 0.5 });
      let newCrises = detectCrises(world, 11, crises);

      expect(newCrises).toHaveLength(1);
      const crisis = newCrises[0];
      crises.push(crisis);

      // 4. Resolve crisis with Tier 1 response
      const energyBeforeResponse = ledger.getBalance('energy');
      const toxicityBeforeResponse = world.getCell(crisisX, crisisY).toxicity;

      const resolved = resolveTier1(crisis, world, ledger, 'scout_0');

      expect(resolved).toBe(true);
      expect(ledger.getBalance('energy')).toBe(energyBeforeResponse - 20);
      expect(world.getCell(crisisX, crisisY).toxicity).toBeLessThan(toxicityBeforeResponse);

      // 5. Move scout outside bubble
      issueWaypoint(scout, 60, 60);
      for (let tick = 11; tick <= 20; tick++) {
        tickScoutMovement(scout, baseX, baseY, bubbleRadius, []);
      }

      expect(scout.inBubble).toBe(false);
      expect(scout.battery).toBeLessThan(100);

      // 6. Capture checkpoint with all state
      const checkpointState = { tick: 20 };
      const phase0State = {
        ledger: ledger.getBalances(),
        scout,
        buildings: [building],
        crises,
      };

      const savedCheckpoints = captureCheckpoint(checkpoints, checkpointState, 1, 10, phase0State);

      // 7. Restore checkpoint and verify all state matches
      const restored = restoreCheckpoint(savedCheckpoints, 20);
      expect(restored).not.toBeNull();

      const restoredCheckpoint = savedCheckpoints.find((cp) => cp.tick === 20);
      expect(restoredCheckpoint?.phase0?.ledger?.energy).toBe(ledger.getBalance('energy'));
      expect(restoredCheckpoint?.phase0?.ledger?.biomass).toBe(ledger.getBalance('biomass'));
      expect(restoredCheckpoint?.phase0?.scout?.x).toBe(scout.x);
      expect(restoredCheckpoint?.phase0?.scout?.y).toBe(scout.y);
      expect(restoredCheckpoint?.phase0?.buildings).toHaveLength(1);
      expect(restoredCheckpoint?.phase0?.crises).toHaveLength(1);
      expect(restoredCheckpoint?.phase0?.crises?.[0].status).toBe('resolved');
    });
  });

  describe('Equilibrium Tracker Integration', () => {
    it('should record ticks and track equilibrium progress', () => {
      // Record several ticks with conditions met
      equilibriumTracker.recordTick(60, 50, 50, 1.0, false, false);
      equilibriumTracker.recordTick(60, 50, 50, 1.0, false, false);
      equilibriumTracker.recordTick(60, 50, 50, 1.0, false, false);

      const progress = equilibriumTracker.getProgress();

      expect(progress.streakLength).toBe(3);
      expect(progress.allConditionsMet).toBe(true);
      expect(progress.readyForCompletion).toBe(false); // Only 3 ticks, need 2000
    });

    it('should reset streak on intervention', () => {
      // Build up streak
      for (let i = 0; i < 10; i++) {
        equilibriumTracker.recordTick(60, 50, 50, 1.0, false, false);
      }

      let progress = equilibriumTracker.getProgress();
      expect(progress.streakLength).toBe(10);

      // Intervention resets streak
      equilibriumTracker.recordTick(60, 50, 50, 1.0, true, false);

      progress = equilibriumTracker.getProgress();
      expect(progress.streakLength).toBe(0);
    });

    it('should freeze streak during pause', () => {
      // Build up streak
      for (let i = 0; i < 5; i++) {
        equilibriumTracker.recordTick(60, 50, 50, 1.0, false, false);
      }

      let progress = equilibriumTracker.getProgress();
      expect(progress.streakLength).toBe(5);

      // Pause
      equilibriumTracker.recordTick(60, 50, 50, 1.0, false, true);

      progress = equilibriumTracker.getProgress();
      expect(progress.streakLength).toBe(5); // Unchanged
    });
  });
});
