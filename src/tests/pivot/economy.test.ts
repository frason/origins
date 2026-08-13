import { describe, it, expect, beforeEach } from 'vitest';
import { ResourceLedger, PHASE0_ECONOMY_CONSTANTS, tickPhase0Economy } from '../../simulation/pivot/economy';
import { World } from '../../simulation/world';
import { SIMULATION_CONSTANTS } from '../../utils/constants';

describe('ResourceLedger', () => {
  let ledger: ResourceLedger;

  beforeEach(() => {
    ledger = new ResourceLedger();
  });

  describe('initialization', () => {
    it('should start with energy at starting value', () => {
      expect(ledger.getBalance('energy')).toBe(PHASE0_ECONOMY_CONSTANTS.energy.startingValue);
    });

    it('should start with biomass at starting value', () => {
      expect(ledger.getBalance('biomass')).toBe(PHASE0_ECONOMY_CONSTANTS.biomass.startingValue);
    });

    it('should allow custom initial values', () => {
      const custom = new ResourceLedger(250, 100);
      expect(custom.getBalance('energy')).toBe(250);
      expect(custom.getBalance('biomass')).toBe(100);
    });

    it('should clamp energy to storage cap if initialized above', () => {
      const custom = new ResourceLedger(1000, 0);
      expect(custom.getBalance('energy')).toBe(PHASE0_ECONOMY_CONSTANTS.energy.storageCap);
    });

    it('should clamp biomass to storage cap if initialized above', () => {
      const custom = new ResourceLedger(0, 1000);
      expect(custom.getBalance('biomass')).toBe(PHASE0_ECONOMY_CONSTANTS.biomass.storageCap);
    });

    it('should clamp negative values to 0', () => {
      const custom = new ResourceLedger(-50, -100);
      expect(custom.getBalance('energy')).toBe(0);
      expect(custom.getBalance('biomass')).toBe(0);
    });
  });

  describe('canAfford', () => {
    it('should return true if balance >= amount', () => {
      expect(ledger.canAfford('energy', 100)).toBe(true);
      expect(ledger.canAfford('energy', 500)).toBe(true);
    });

    it('should return false if balance < amount', () => {
      expect(ledger.canAfford('energy', 501)).toBe(false);
      expect(ledger.canAfford('energy', 1000)).toBe(false);
    });

    it('should return false for negative amount', () => {
      expect(ledger.canAfford('energy', -10)).toBe(false);
    });

    it('should return true for 0 amount', () => {
      expect(ledger.canAfford('energy', 0)).toBe(true);
    });

    it('should work independently for each resource', () => {
      const custom = new ResourceLedger(100, 50);
      expect(custom.canAfford('energy', 100)).toBe(true);
      expect(custom.canAfford('energy', 101)).toBe(false);
      expect(custom.canAfford('biomass', 50)).toBe(true);
      expect(custom.canAfford('biomass', 51)).toBe(false);
    });
  });

  describe('spend', () => {
    it('should deduct from balance if sufficient funds', () => {
      const amount = ledger.spend('energy', 50);
      expect(amount).toBe(50);
      expect(ledger.getBalance('energy')).toBe(450);
    });

    it('should return the amount spent', () => {
      const amount = ledger.spend('energy', 123);
      expect(amount).toBe(123);
    });

    it('should throw error if insufficient funds', () => {
      expect(() => {
        ledger.spend('energy', 501);
      }).toThrow('Insufficient energy');
    });

    it('should throw error for biomass if insufficient', () => {
      const custom = new ResourceLedger(500, 100);
      expect(() => {
        custom.spend('biomass', 101);
      }).toThrow('Insufficient biomass');
    });

    it('should handle multiple spends correctly', () => {
      ledger.spend('energy', 100);
      expect(ledger.getBalance('energy')).toBe(400);
      ledger.spend('energy', 100);
      expect(ledger.getBalance('energy')).toBe(300);
    });

    it('should not allow spending negative amount', () => {
      expect(() => {
        ledger.spend('energy', -50);
      }).toThrow('Insufficient energy');
    });

    it('should handle spending to exactly 0', () => {
      const custom = new ResourceLedger(100, 0);
      custom.spend('energy', 100);
      expect(custom.getBalance('energy')).toBe(0);
    });
  });

  describe('credit', () => {
    it('should add to balance if below cap', () => {
      const custom = new ResourceLedger(400, 250);
      const credited = custom.credit('energy', 50);
      expect(credited).toBe(50);
      expect(custom.getBalance('energy')).toBe(450);
    });

    it('should return the amount credited', () => {
      const custom = new ResourceLedger(400, 0);
      const credited = custom.credit('energy', 75);
      expect(credited).toBe(75);
    });

    it('should respect storage cap for energy', () => {
      const custom = new ResourceLedger(490, 0);
      const credited = custom.credit('energy', 20);
      expect(credited).toBe(10); // cap is 500, so only 10 fits
      expect(custom.getBalance('energy')).toBe(500);
    });

    it('should respect storage cap for biomass', () => {
      const custom = new ResourceLedger(0, 290);
      const credited = custom.credit('biomass', 20);
      expect(credited).toBe(10); // cap is 300, so only 10 fits
      expect(custom.getBalance('biomass')).toBe(300);
    });

    it('should not credit negative amounts', () => {
      const credited = ledger.credit('energy', -50);
      expect(credited).toBe(0);
      expect(ledger.getBalance('energy')).toBe(500); // no change
    });

    it('should not credit 0 amount', () => {
      const credited = ledger.credit('energy', 0);
      expect(credited).toBe(0);
    });

    it('should handle crediting at cap', () => {
      const credited = ledger.credit('energy', 50);
      expect(credited).toBe(0); // already at 500 cap
      expect(ledger.getBalance('energy')).toBe(500);
    });
  });

  describe('drainPassive', () => {
    it('should drain energy each call', () => {
      ledger.drainPassive();
      expect(ledger.getBalance('energy')).toBe(499);
    });

    it('should drain by PHASE0_ECONOMY_CONSTANTS.energy.passiveDrainPerTick', () => {
      const initial = ledger.getBalance('energy');
      ledger.drainPassive();
      expect(ledger.getBalance('energy')).toBe(
        initial - PHASE0_ECONOMY_CONSTANTS.energy.passiveDrainPerTick
      );
    });

    it('should be floored at 0', () => {
      const custom = new ResourceLedger(0, 0);
      custom.drainPassive();
      expect(custom.getBalance('energy')).toBe(0);
    });

    it('should floor to 0 if drain would go negative', () => {
      const custom = new ResourceLedger(0.5, 0); // less than 1
      custom.drainPassive();
      expect(custom.getBalance('energy')).toBe(0);
    });

    it('should not affect biomass', () => {
      const custom = new ResourceLedger(100, 50);
      custom.drainPassive();
      expect(custom.getBalance('biomass')).toBe(50);
    });
  });

  describe('getBalance', () => {
    it('should return energy balance', () => {
      const custom = new ResourceLedger(250, 100);
      expect(custom.getBalance('energy')).toBe(250);
    });

    it('should return biomass balance', () => {
      const custom = new ResourceLedger(250, 100);
      expect(custom.getBalance('biomass')).toBe(100);
    });

    it('should reflect changes after spend', () => {
      ledger.spend('energy', 100);
      expect(ledger.getBalance('energy')).toBe(400);
    });

    it('should reflect changes after credit', () => {
      const custom = new ResourceLedger(400, 0);
      custom.credit('energy', 50);
      expect(custom.getBalance('energy')).toBe(450);
    });
  });

  describe('getBalances', () => {
    it('should return both balances as object', () => {
      const custom = new ResourceLedger(250, 100);
      const balances = custom.getBalances();
      expect(balances.energy).toBe(250);
      expect(balances.biomass).toBe(100);
    });

    it('should reflect changes', () => {
      ledger.spend('energy', 50);
      ledger.credit('biomass', 10);
      const balances = ledger.getBalances();
      expect(balances.energy).toBe(450);
      expect(balances.biomass).toBe(10);
    });
  });

  describe('reset', () => {
    it('should reset energy to starting value', () => {
      ledger.spend('energy', 100);
      ledger.reset();
      expect(ledger.getBalance('energy')).toBe(PHASE0_ECONOMY_CONSTANTS.energy.startingValue);
    });

    it('should reset biomass to starting value', () => {
      ledger.credit('biomass', 50);
      ledger.reset();
      expect(ledger.getBalance('biomass')).toBe(PHASE0_ECONOMY_CONSTANTS.biomass.startingValue);
    });

    it('should reset both resources together', () => {
      ledger.spend('energy', 100);
      ledger.credit('biomass', 50);
      ledger.reset();
      expect(ledger.getBalance('energy')).toBe(PHASE0_ECONOMY_CONSTANTS.energy.startingValue);
      expect(ledger.getBalance('biomass')).toBe(PHASE0_ECONOMY_CONSTANTS.biomass.startingValue);
    });
  });

  describe('integration scenarios', () => {
    it('should handle Phase 0 building construction cost', () => {
      expect(ledger.canAfford('energy', PHASE0_ECONOMY_CONSTANTS.energy.buildingConstructionCost)).toBe(true);
      ledger.spend('energy', PHASE0_ECONOMY_CONSTANTS.energy.buildingConstructionCost);
      expect(ledger.getBalance('energy')).toBe(
        PHASE0_ECONOMY_CONSTANTS.energy.startingValue - PHASE0_ECONOMY_CONSTANTS.energy.buildingConstructionCost
      );
    });

    it('should handle Tier 1 crisis response cost', () => {
      expect(ledger.canAfford('energy', PHASE0_ECONOMY_CONSTANTS.energy.tier1ResponseCost)).toBe(true);
      ledger.spend('energy', PHASE0_ECONOMY_CONSTANTS.energy.tier1ResponseCost);
      expect(ledger.getBalance('energy')).toBe(
        PHASE0_ECONOMY_CONSTANTS.energy.startingValue - PHASE0_ECONOMY_CONSTANTS.energy.tier1ResponseCost
      );
    });

    it('should handle multiple operations in sequence', () => {
      // Construct building
      ledger.spend('energy', PHASE0_ECONOMY_CONSTANTS.energy.buildingConstructionCost);
      expect(ledger.getBalance('energy')).toBe(400);

      // Drain for 10 ticks
      for (let i = 0; i < 10; i++) {
        ledger.drainPassive();
      }
      expect(ledger.getBalance('energy')).toBe(390);

      // Issue a response
      ledger.spend('energy', PHASE0_ECONOMY_CONSTANTS.energy.tier1ResponseCost);
      expect(ledger.getBalance('energy')).toBe(370);

      // Accumulate biomass from harvester
      ledger.credit('biomass', 50);
      expect(ledger.getBalance('biomass')).toBe(50);
    });
  });

  describe('storage cap enforcement', () => {
    it('should never allow energy to exceed cap', () => {
      const custom = new ResourceLedger(490, 0);
      custom.credit('energy', 100); // try to add 100, but cap is 500
      expect(custom.getBalance('energy')).toBe(500);
    });

    it('should never allow biomass to exceed cap', () => {
      const custom = new ResourceLedger(0, 290);
      custom.credit('biomass', 100); // try to add 100, but cap is 300
      expect(custom.getBalance('biomass')).toBe(300);
    });

    it('should handle edge case: credit exactly remaining to cap', () => {
      const custom = new ResourceLedger(495, 0);
      const credited = custom.credit('energy', 5);
      expect(credited).toBe(5);
      expect(custom.getBalance('energy')).toBe(500);
    });
  });
});

describe('tickPhase0Economy', () => {
  let world: World;
  let ledger: ResourceLedger;

  beforeEach(() => {
    world = new World(100, 100, SIMULATION_CONSTANTS, 12345);
    ledger = new ResourceLedger();
  });

  describe('Energy passive drain', () => {
    it('should drain energy by 1 per tick', () => {
      const initialEnergy = ledger.getBalance('energy');
      tickPhase0Economy(world, ledger, { operational: false, x: 0, y: 0 }, 1);
      expect(ledger.getBalance('energy')).toBe(initialEnergy - 1);
    });

    it('should drain energy even with no harvester', () => {
      const initialEnergy = 100;
      const ledger2 = new ResourceLedger(initialEnergy, 0);
      tickPhase0Economy(world, ledger2, { operational: false, x: 0, y: 0 }, 1);
      expect(ledger2.getBalance('energy')).toBe(initialEnergy - 1);
    });

    it('should floor drain at 0 (never negative)', () => {
      const ledger2 = new ResourceLedger(0, 0);
      tickPhase0Economy(world, ledger2, { operational: false, x: 0, y: 0 }, 1);
      expect(ledger2.getBalance('energy')).toBe(0);
    });

    it('should floor drain at 0 when energy less than 1', () => {
      const ledger2 = new ResourceLedger(0.5, 0);
      tickPhase0Economy(world, ledger2, { operational: false, x: 0, y: 0 }, 1);
      expect(ledger2.getBalance('energy')).toBe(0);
    });

    it('should drain multiple times over multiple ticks', () => {
      const initialEnergy = 100;
      const ledger2 = new ResourceLedger(initialEnergy, 0);
      for (let i = 0; i < 5; i++) {
        tickPhase0Economy(world, ledger2, { operational: false, x: 0, y: 0 }, i);
      }
      expect(ledger2.getBalance('energy')).toBe(initialEnergy - 5);
    });

    it('should not affect biomass when draining energy', () => {
      const initialBiomass = 50;
      const ledger2 = new ResourceLedger(100, initialBiomass);
      tickPhase0Economy(world, ledger2, { operational: false, x: 0, y: 0 }, 1);
      expect(ledger2.getBalance('biomass')).toBe(initialBiomass);
    });
  });

  describe('Harvester placement and operationality', () => {
    it('should produce no biomass income if harvester not operational', () => {
      // Set up a cell with producerBiomass
      world.setCell(10, 10, { producerBiomass: 100 });
      const initialBiomass = ledger.getBalance('biomass');
      const initialProducer = world.getCell(10, 10).producerBiomass;

      // Tick with harvester not operational
      tickPhase0Economy(world, ledger, { operational: false, x: 10, y: 10 }, 1);

      // Biomass should not have changed
      expect(ledger.getBalance('biomass')).toBe(initialBiomass);
      // Producer biomass should not have changed
      expect(world.getCell(10, 10).producerBiomass).toBe(initialProducer);
    });

    it('should produce no biomass income if harvester coordinates out of bounds', () => {
      const initialBiomass = ledger.getBalance('biomass');

      // Harvester operational but at invalid coordinates
      tickPhase0Economy(world, ledger, { operational: true, x: 1000, y: 1000 }, 1);

      // Biomass should not have changed
      expect(ledger.getBalance('biomass')).toBe(initialBiomass);
    });

    it('should produce no biomass if harvester at negative coordinates', () => {
      const initialBiomass = ledger.getBalance('biomass');

      // Harvester operational but at negative coordinates
      tickPhase0Economy(world, ledger, { operational: true, x: -1, y: -1 }, 1);

      // Biomass should not have changed
      expect(ledger.getBalance('biomass')).toBe(initialBiomass);
    });
  });

  describe('Biomass harvesting: conversion rate', () => {
    it('should convert 2.0 producerBiomass to 1 stockpiled Biomass', () => {
      // Set up a cell with 2.0 producerBiomass
      world.setCell(20, 20, { producerBiomass: 2.0 });
      const initialBiomass = ledger.getBalance('biomass');

      tickPhase0Economy(world, ledger, { operational: true, x: 20, y: 20 }, 1);

      // Should gain 1 biomass (2.0 / 2 = 1.0)
      expect(ledger.getBalance('biomass')).toBe(initialBiomass + 1);
      // Should consume 2.0 from the tile
      expect(world.getCell(20, 20).producerBiomass).toBeCloseTo(0, 5);
    });

    it('should convert 4.0 producerBiomass to 1 stockpiled Biomass (limited by max draw)', () => {
      world.setCell(21, 21, { producerBiomass: 4.0 });
      const initialBiomass = ledger.getBalance('biomass');

      tickPhase0Economy(world, ledger, { operational: true, x: 21, y: 21 }, 1);

      // Should gain 1 biomass (max draw 2.0 / 2 = 1.0), not 2
      expect(ledger.getBalance('biomass')).toBeCloseTo(initialBiomass + 1, 5);
      // Should consume only 2.0 (max draw), leaving 2.0
      expect(world.getCell(21, 21).producerBiomass).toBeCloseTo(2.0, 5);
    });

    it('should convert 1.0 producerBiomass to 0.5 stockpiled Biomass', () => {
      world.setCell(22, 22, { producerBiomass: 1.0 });
      const initialBiomass = ledger.getBalance('biomass');

      tickPhase0Economy(world, ledger, { operational: true, x: 22, y: 22 }, 1);

      // Should gain 0.5 biomass (1.0 / 2 = 0.5)
      expect(ledger.getBalance('biomass')).toBeCloseTo(initialBiomass + 0.5, 5);
      // Should consume 1.0 from the tile
      expect(world.getCell(22, 22).producerBiomass).toBeCloseTo(0, 5);
    });
  });

  describe('Biomass harvesting: max draw per tick', () => {
    it('should draw at most 2.0 producerBiomass per tick (the max draw)', () => {
      // Set up a cell with more than 2.0 producerBiomass
      world.setCell(30, 30, { producerBiomass: 100 });
      const initialBiomass = ledger.getBalance('biomass');

      tickPhase0Economy(world, ledger, { operational: true, x: 30, y: 30 }, 1);

      // Should gain 1 biomass (max draw 2.0 / 2 = 1.0)
      expect(ledger.getBalance('biomass')).toBe(initialBiomass + 1);
      // Should consume only 2.0, leaving 98
      expect(world.getCell(30, 30).producerBiomass).toBe(98);
    });

    it('should respect max draw even with abundant producer biomass', () => {
      world.setCell(31, 31, { producerBiomass: 1000 });

      for (let i = 0; i < 3; i++) {
        tickPhase0Economy(world, ledger, { operational: true, x: 31, y: 31 }, i);
      }

      // Each tick draws 2.0, so after 3 ticks: 1000 - 6 = 994
      expect(world.getCell(31, 31).producerBiomass).toBe(994);
    });
  });

  describe('Biomass harvesting: floor at 0 for producer biomass', () => {
    it('should never take producerBiomass below 0', () => {
      // Set up a cell with less than max draw (e.g., 1.5)
      world.setCell(40, 40, { producerBiomass: 1.5 });

      tickPhase0Economy(world, ledger, { operational: true, x: 40, y: 40 }, 1);

      // Should floor at 0, not go negative
      expect(world.getCell(40, 40).producerBiomass).toBeGreaterThanOrEqual(0);
      expect(world.getCell(40, 40).producerBiomass).toBeCloseTo(0, 5);
    });

    it('should floor at 0 when cell has 0 producerBiomass', () => {
      world.setCell(41, 41, { producerBiomass: 0 });

      tickPhase0Economy(world, ledger, { operational: true, x: 41, y: 41 }, 1);

      // Should stay at 0
      expect(world.getCell(41, 41).producerBiomass).toBe(0);
    });

    it('should produce partial income when producer biomass less than max draw', () => {
      // Cell has 1.5 producerBiomass (less than max draw 2.0)
      world.setCell(42, 42, { producerBiomass: 1.5 });
      const initialBiomass = ledger.getBalance('biomass');

      tickPhase0Economy(world, ledger, { operational: true, x: 42, y: 42 }, 1);

      // Should only draw 1.5, converting to 0.75 stockpiled biomass
      expect(ledger.getBalance('biomass')).toBeCloseTo(initialBiomass + 0.75, 5);
      expect(world.getCell(42, 42).producerBiomass).toBeCloseTo(0, 5);
    });
  });

  describe('Biomass harvesting: ledger storage cap', () => {
    it('should not exceed ledger storage cap even with abundant harvest', () => {
      // Set ledger near cap (at 299, so only 1 biomass fits)
      const ledger2 = new ResourceLedger(500, 299);
      // Set cell with plenty of producer biomass
      world.setCell(50, 50, { producerBiomass: 1000 });

      tickPhase0Economy(world, ledger2, { operational: true, x: 50, y: 50 }, 1);

      // Should cap at 300: 299 + min(1.0 from draw, 1 remaining space) = 300
      expect(ledger2.getBalance('biomass')).toBe(300);
      // Should consume energy
      expect(ledger2.getBalance('energy')).toBe(500 - 1);
    });

    it('should credit only the amount that fits under cap', () => {
      // Ledger at 299, cap is 300
      const ledger2 = new ResourceLedger(500, 299);
      // Cell has 10.0 producerBiomass (would yield 5.0 biomass)
      world.setCell(51, 51, { producerBiomass: 10.0 });

      tickPhase0Economy(world, ledger2, { operational: true, x: 51, y: 51 }, 1);

      // Can only credit 1.0, so ledger should be at 300
      expect(ledger2.getBalance('biomass')).toBe(300);
      // But should still consume the producer biomass for the yield that fits
      // The max draw is 2.0, yielding 1.0 biomass, which fits in the ledger
      // So it consumes 2.0 from the cell
      expect(world.getCell(51, 51).producerBiomass).toBeCloseTo(8, 5);
    });

    it('should still draw from producer even when ledger cap prevents credit', () => {
      // Start with ledger at cap
      const ledger2 = new ResourceLedger(500, 300);
      world.setCell(52, 52, { producerBiomass: 10.0 });

      tickPhase0Economy(world, ledger2, { operational: true, x: 52, y: 52 }, 1);

      // Ledger should stay at cap (can't credit when at cap)
      expect(ledger2.getBalance('biomass')).toBe(300);
      // But producer should still be drawn (2.0 max draw): 10.0 - 2.0 = 8.0
      expect(world.getCell(52, 52).producerBiomass).toBe(8.0);
    });
  });

  describe('Determinism and purity', () => {
    it('should produce identical results with identical inputs', () => {
      // Create two identical scenarios
      const world1 = new World(100, 100, SIMULATION_CONSTANTS, 999);
      const world2 = new World(100, 100, SIMULATION_CONSTANTS, 999);
      const ledger1 = new ResourceLedger(250, 100);
      const ledger2 = new ResourceLedger(250, 100);

      world1.setCell(50, 50, { producerBiomass: 50 });
      world2.setCell(50, 50, { producerBiomass: 50 });

      const harvester = { operational: true, x: 50, y: 50 };

      // Run identical ticks
      tickPhase0Economy(world1, ledger1, harvester, 10);
      tickPhase0Economy(world2, ledger2, harvester, 10);

      // Results should be identical
      expect(ledger1.getBalance('energy')).toBe(ledger2.getBalance('energy'));
      expect(ledger1.getBalance('biomass')).toBe(ledger2.getBalance('biomass'));
      expect(world1.getCell(50, 50).producerBiomass).toBe(world2.getCell(50, 50).producerBiomass);
    });

    it('should handle multiple sequential ticks deterministically', () => {
      world.setCell(60, 60, { producerBiomass: 100 });
      const harvester = { operational: true, x: 60, y: 60 };

      // Run 5 sequential ticks
      for (let i = 0; i < 5; i++) {
        tickPhase0Economy(world, ledger, harvester, i);
      }

      // After 5 ticks:
      // - Energy drains by 5 (from 500 to 495)
      // - Harvester draws 2.0 per tick for 5 ticks = 10.0, yielding 5.0 biomass
      expect(ledger.getBalance('energy')).toBe(495);
      expect(ledger.getBalance('biomass')).toBe(5);
      expect(world.getCell(60, 60).producerBiomass).toBe(90);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle simultaneous energy drain and biomass harvest', () => {
      world.setCell(70, 70, { producerBiomass: 20 });
      const initialEnergy = ledger.getBalance('energy');
      const initialBiomass = ledger.getBalance('biomass');

      tickPhase0Economy(world, ledger, { operational: true, x: 70, y: 70 }, 1);

      // Energy should drain
      expect(ledger.getBalance('energy')).toBe(initialEnergy - 1);
      // Biomass should increase (2.0 / 2 = 1.0)
      expect(ledger.getBalance('biomass')).toBe(initialBiomass + 1);
      // Cell should lose 2.0 producerBiomass
      expect(world.getCell(70, 70).producerBiomass).toBe(18);
    });

    it('should handle harvester at edge of world', () => {
      // Test corner cases
      world.setCell(0, 0, { producerBiomass: 5 });
      const initialBiomass = ledger.getBalance('biomass');

      tickPhase0Economy(world, ledger, { operational: true, x: 0, y: 0 }, 1);

      // Max draw 2.0 yields 1.0 biomass
      expect(ledger.getBalance('biomass')).toBeCloseTo(initialBiomass + 1, 5);
      // Remaining: 5.0 - 2.0 = 3.0
      expect(world.getCell(0, 0).producerBiomass).toBeCloseTo(3.0, 5);
    });

    it('should handle multiple harvesters across different ticks at same location', () => {
      world.setCell(80, 80, { producerBiomass: 100 });
      const harvester = { operational: true, x: 80, y: 80 };

      // Simulate 3 ticks
      tickPhase0Economy(world, ledger, harvester, 1);
      tickPhase0Economy(world, ledger, harvester, 2);
      tickPhase0Economy(world, ledger, harvester, 3);

      // After 3 ticks:
      // - Harvester draws 2.0 per tick for 3 ticks = 6.0 total, yielding 3.0 biomass
      // - Energy drains 3
      expect(ledger.getBalance('energy')).toBe(497);
      expect(ledger.getBalance('biomass')).toBe(3);
      expect(world.getCell(80, 80).producerBiomass).toBe(94);
    });
  });

  describe('Edge cases', () => {
    it('should handle fractional producerBiomass values', () => {
      world.setCell(90, 90, { producerBiomass: 3.7 });
      const initialBiomass = ledger.getBalance('biomass');

      tickPhase0Economy(world, ledger, { operational: true, x: 90, y: 90 }, 1);

      // Draw 2.0 (limited by max draw), convert to 1.0
      expect(ledger.getBalance('biomass')).toBeCloseTo(initialBiomass + 1, 5);
      // Remaining: 3.7 - 2.0 = 1.7
      expect(world.getCell(90, 90).producerBiomass).toBeCloseTo(1.7, 5);
    });

    it('should handle very small producerBiomass', () => {
      world.setCell(91, 91, { producerBiomass: 0.1 });
      const initialBiomass = ledger.getBalance('biomass');

      tickPhase0Economy(world, ledger, { operational: true, x: 91, y: 91 }, 1);

      // Draw 0.1, convert to 0.05
      expect(ledger.getBalance('biomass')).toBeCloseTo(initialBiomass + 0.05, 5);
      expect(world.getCell(91, 91).producerBiomass).toBeCloseTo(0, 5);
    });

    it('should handle tick parameter (exists for logging but does not affect logic)', () => {
      world.setCell(92, 92, { producerBiomass: 10 });
      const ledger1 = new ResourceLedger(500, 0);
      const ledger2 = new ResourceLedger(500, 0);
      world.setCell(92, 92, { producerBiomass: 10 });

      const harvester = { operational: true, x: 92, y: 92 };

      // Run with different tick values
      tickPhase0Economy(world, ledger1, harvester, 100);
      // Revert world for second run
      world.setCell(92, 92, { producerBiomass: 10 });
      tickPhase0Economy(world, ledger2, harvester, 999999);

      // Results should be identical regardless of tick value
      expect(ledger1.getBalance('energy')).toBe(ledger2.getBalance('energy'));
      expect(ledger1.getBalance('biomass')).toBe(ledger2.getBalance('biomass'));
    });
  });
});
