import { describe, it, expect, beforeEach } from 'vitest';
import { ResourceLedger, PHASE0_ECONOMY_CONSTANTS } from '../../simulation/pivot/economy';

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
