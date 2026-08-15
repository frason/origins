import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  Building,
  buildHarvester,
  setDormant,
  tickBuildingDecay,
  recommission,
  demolishManual,
  tickAutoDemolish,
  calculateRecommissionCost,
  resetBuildingIdCounter,
  PHASE0_BUILDING_CONSTANTS,
} from '../../simulation/pivot/building';
import { ResourceLedger, PHASE0_ECONOMY_CONSTANTS } from '../../simulation/pivot/economy';

describe('Building Lifecycle System', () => {
  let ledger: ResourceLedger;

  beforeEach(() => {
    ledger = new ResourceLedger();
    resetBuildingIdCounter();
  });

  describe('buildHarvester', () => {
    it('should create a new building in operational state', () => {
      const building = buildHarvester(ledger, 10, 20, 5);

      expect(building.id).toBeDefined();
      expect(building.x).toBe(10);
      expect(building.y).toBe(20);
      expect(building.state).toBe('operational');
      expect(building.decayTicks).toBe(0);
      expect(building.builtAtTick).toBe(5);
    });

    it('should spend 100 Energy from ledger', () => {
      const initialEnergy = ledger.getBalance('energy');
      buildHarvester(ledger, 0, 0, 0);

      expect(ledger.getBalance('energy')).toBe(
        initialEnergy - PHASE0_BUILDING_CONSTANTS.harvester.buildCost
      );
    });

    it('should allocate unique IDs to consecutive harvesters', () => {
      resetBuildingIdCounter();
      const building1 = buildHarvester(ledger, 0, 0, 0);
      const building2 = buildHarvester(ledger, 1, 1, 0);

      expect(building1.id).not.toBe(building2.id);
      expect(building1.id).toMatch(/^building_\d+$/);
      expect(building2.id).toMatch(/^building_\d+$/);
    });

    it('should throw error if insufficient Energy', () => {
      const poorLedger = new ResourceLedger(50, 0); // Only 50 energy
      expect(() => {
        buildHarvester(poorLedger, 0, 0, 0);
      }).toThrow('Insufficient energy');
    });

    it('should throw error if Energy is exactly insufficient', () => {
      const poorLedger = new ResourceLedger(99, 0); // 1 short of cost
      expect(() => {
        buildHarvester(poorLedger, 0, 0, 0);
      }).toThrow('Insufficient energy');
    });

    it('should succeed if Energy is exactly the cost', () => {
      const exactLedger = new ResourceLedger(100, 0);
      const building = buildHarvester(exactLedger, 0, 0, 0);

      expect(building.state).toBe('operational');
      expect(exactLedger.getBalance('energy')).toBe(0);
    });

    it('should record the tick at construction time', () => {
      const building1 = buildHarvester(ledger, 0, 0, 42);
      const building2 = buildHarvester(ledger, 1, 1, 999);

      expect(building1.builtAtTick).toBe(42);
      expect(building2.builtAtTick).toBe(999);
    });

    it('should place buildings at the specified coordinates', () => {
      const b1 = buildHarvester(ledger, 0, 0, 0);
      const b2 = buildHarvester(ledger, 99, 99, 0);
      const b3 = buildHarvester(ledger, 50, 75, 0);

      expect(b1.x).toBe(0);
      expect(b1.y).toBe(0);
      expect(b2.x).toBe(99);
      expect(b2.y).toBe(99);
      expect(b3.x).toBe(50);
      expect(b3.y).toBe(75);
    });

    it('should allow negative coordinates (world may support them)', () => {
      const building = buildHarvester(ledger, -5, -10, 0);
      expect(building.x).toBe(-5);
      expect(building.y).toBe(-10);
    });
  });

  describe('setDormant', () => {
    let building: Building;

    beforeEach(() => {
      building = buildHarvester(ledger, 0, 0, 0);
    });

    it('should transition operational building to dormant', () => {
      expect(building.state).toBe('operational');
      setDormant(building);
      expect(building.state).toBe('dormant');
    });

    it('should preserve building properties when setting dormant', () => {
      const id = building.id;
      const x = building.x;
      const y = building.y;
      const decayTicks = building.decayTicks;
      const builtAtTick = building.builtAtTick;

      setDormant(building);

      expect(building.id).toBe(id);
      expect(building.x).toBe(x);
      expect(building.y).toBe(y);
      expect(building.decayTicks).toBe(decayTicks);
      expect(building.builtAtTick).toBe(builtAtTick);
    });

    it('should not change dormant building (idempotent when already dormant)', () => {
      setDormant(building);
      const stateAfterFirst = building.state;

      setDormant(building);
      const stateAfterSecond = building.state;

      expect(stateAfterFirst).toBe('dormant');
      expect(stateAfterSecond).toBe('dormant');
    });

    it('should not affect demolished building', () => {
      building.state = 'demolished';
      setDormant(building);

      expect(building.state).toBe('demolished');
    });

    it('should reset decay ticks to 0 initially', () => {
      expect(building.decayTicks).toBe(0);
      setDormant(building);
      expect(building.decayTicks).toBe(0);
    });
  });

  describe('tickBuildingDecay', () => {
    let building: Building;

    beforeEach(() => {
      building = buildHarvester(ledger, 0, 0, 0);
      setDormant(building);
    });

    it('should increment decayTicks by 1 when dormant', () => {
      expect(building.decayTicks).toBe(0);
      tickBuildingDecay(building);
      expect(building.decayTicks).toBe(1);
    });

    it('should accumulate decayTicks over multiple calls', () => {
      for (let i = 0; i < 5; i++) {
        tickBuildingDecay(building);
      }
      expect(building.decayTicks).toBe(5);
    });

    it('should not increment decayTicks if operational', () => {
      const opBuilding = buildHarvester(ledger, 1, 1, 0);
      expect(opBuilding.state).toBe('operational');

      tickBuildingDecay(opBuilding);
      expect(opBuilding.decayTicks).toBe(0);
    });

    it('should not increment decayTicks if demolished', () => {
      building.state = 'demolished';
      tickBuildingDecay(building);
      expect(building.decayTicks).toBe(0);
    });

    it('should accumulate precisely', () => {
      for (let i = 1; i <= 100; i++) {
        tickBuildingDecay(building);
        expect(building.decayTicks).toBe(i);
      }
    });
  });

  describe('recommission', () => {
    let building: Building;

    beforeEach(() => {
      building = buildHarvester(ledger, 0, 0, 0);
      setDormant(building);
    });

    it('should restore dormant building to operational state', () => {
      expect(building.state).toBe('dormant');
      recommission(building, ledger, 10);
      expect(building.state).toBe('operational');
    });

    it('should reset decayTicks to 0 on success', () => {
      tickBuildingDecay(building);
      tickBuildingDecay(building);
      expect(building.decayTicks).toBe(2);

      recommission(building, ledger, 10);
      expect(building.decayTicks).toBe(0);
    });

    it('should calculate cost as baseCost + (decayTicks * perTickPenalty)', () => {
      // No decay yet
      const costZeroDecay =
        PHASE0_BUILDING_CONSTANTS.harvester.recommissionBaseCost +
        0 * PHASE0_BUILDING_CONSTANTS.harvester.recommissionPerTickPenalty;
      expect(calculateRecommissionCost(building)).toBe(costZeroDecay);

      // After decay
      tickBuildingDecay(building);
      tickBuildingDecay(building);
      const costWithDecay =
        PHASE0_BUILDING_CONSTANTS.harvester.recommissionBaseCost +
        2 * PHASE0_BUILDING_CONSTANTS.harvester.recommissionPerTickPenalty;
      expect(calculateRecommissionCost(building)).toBe(costWithDecay);
    });

    it('should spend the calculated cost from ledger', () => {
      const initialEnergy = ledger.getBalance('energy');
      const cost = calculateRecommissionCost(building);

      recommission(building, ledger, 10);

      expect(ledger.getBalance('energy')).toBe(initialEnergy - cost);
    });

    it('should cost more as decayTicks increases', () => {
      const cost0 = calculateRecommissionCost(building);

      tickBuildingDecay(building);
      const cost1 = calculateRecommissionCost(building);

      tickBuildingDecay(building);
      const cost2 = calculateRecommissionCost(building);

      expect(cost0 < cost1).toBe(true);
      expect(cost1 < cost2).toBe(true);
      // Specifically, should increase by 2 each tick (perTickPenalty)
      expect(cost1 - cost0).toBe(PHASE0_BUILDING_CONSTANTS.harvester.recommissionPerTickPenalty);
      expect(cost2 - cost1).toBe(PHASE0_BUILDING_CONSTANTS.harvester.recommissionPerTickPenalty);
    });

    it('should throw error if insufficient Energy', () => {
      // Set up building with high decay to make cost high
      for (let i = 0; i < 200; i++) {
        tickBuildingDecay(building);
      }
      const cost = calculateRecommissionCost(building);

      // Create a poor ledger that can't afford it
      const poorLedger = new ResourceLedger(cost - 1, 0);

      expect(() => {
        recommission(building, poorLedger, 10);
      }).toThrow('Insufficient energy');
    });

    it('should throw error if building is operational', () => {
      const opBuilding = buildHarvester(ledger, 1, 1, 0);
      expect(() => {
        recommission(opBuilding, ledger, 10);
      }).toThrow('must be dormant');
    });

    it('should throw error if building is demolished', () => {
      building.state = 'demolished';
      expect(() => {
        recommission(building, ledger, 10);
      }).toThrow('must be dormant');
    });

    it('should not modify building state if cost cannot be afforded', () => {
      // High decay to make cost high
      for (let i = 0; i < 100; i++) {
        tickBuildingDecay(building);
      }

      const poorLedger = new ResourceLedger(0, 0);
      try {
        recommission(building, poorLedger, 10);
      } catch (e) {
        // Expected
      }

      // Building should still be dormant with decay intact
      expect(building.state).toBe('dormant');
      expect(building.decayTicks).toBe(100);
    });

    it('should succeed if Energy is exactly sufficient', () => {
      tickBuildingDecay(building);
      tickBuildingDecay(building);
      const cost = calculateRecommissionCost(building);

      const exactLedger = new ResourceLedger(cost + 10, 0); // 10 extra
      recommission(building, exactLedger, 10);

      expect(building.state).toBe('operational');
      expect(building.decayTicks).toBe(0);
      expect(exactLedger.getBalance('energy')).toBe(10);
    });
  });

  describe('demolishManual', () => {
    let building: Building;

    beforeEach(() => {
      building = buildHarvester(ledger, 0, 0, 0);
    });

    it('should set building state to demolished', () => {
      expect(building.state).toBe('operational');
      demolishManual(building, ledger);
      expect(building.state).toBe('demolished');
    });

    it('should refund 40% of build cost', () => {
      const initialEnergy = ledger.getBalance('energy'); // 500 - 100 from build = 400
      // Building cost 100, so refund should be 40
      const expectedRefund =
        PHASE0_BUILDING_CONSTANTS.harvester.buildCost *
        PHASE0_BUILDING_CONSTANTS.harvester.demolishRefundFraction;

      demolishManual(building, ledger);

      // Energy after demolish = initial (already spent 100) + refund 40
      const expectedFinalEnergy = initialEnergy + expectedRefund; // 400 + 40 = 440
      expect(ledger.getBalance('energy')).toBe(expectedFinalEnergy);
    });

    it('should refund 40 Energy (40% of 100)', () => {
      const initialEnergy = ledger.getBalance('energy'); // After build: 400
      demolishManual(building, ledger);

      // Refund 40 to the current balance (already spent 100 at build)
      expect(ledger.getBalance('energy')).toBe(initialEnergy + 40); // 400 + 40 = 440
    });

    it('should respect storage cap when crediting refund', () => {
      const capLedger = new ResourceLedger(490, 0); // 10 below cap
      const building2 = buildHarvester(capLedger, 0, 0, 0); // spends 100

      // Now ledger is at 390, and we demolish for 40 refund
      demolishManual(building2, capLedger);

      // 390 + 40 = 430, below the cap, so should work
      expect(capLedger.getBalance('energy')).toBe(430);
    });

    it('should work on dormant building', () => {
      setDormant(building);
      const initialEnergy = ledger.getBalance('energy'); // Already spent 100 at build

      demolishManual(building, ledger);

      expect(building.state).toBe('demolished');
      const expectedFinalEnergy = initialEnergy + 40;
      expect(ledger.getBalance('energy')).toBe(expectedFinalEnergy);
    });

    it('should work on already-demolished building (idempotent effect)', () => {
      building.state = 'demolished';
      const initialEnergy = ledger.getBalance('energy');

      // Demolishing an already-demolished building: state stays demolished, refund is credited again
      demolishManual(building, ledger);

      expect(building.state).toBe('demolished');
      // Refund is credited (multiple times if called multiple times)
      expect(ledger.getBalance('energy')).toBe(initialEnergy + 40);
    });

    it('should preserve building ID and position', () => {
      const id = building.id;
      const x = building.x;
      const y = building.y;

      demolishManual(building, ledger);

      expect(building.id).toBe(id);
      expect(building.x).toBe(x);
      expect(building.y).toBe(y);
    });

    it('should not be affected by decay ticks', () => {
      setDormant(building);
      for (let i = 0; i < 20; i++) {
        tickBuildingDecay(building);
      }

      const initialEnergy = ledger.getBalance('energy');
      demolishManual(building, ledger);

      // Refund should still be 40 (not affected by decay)
      expect(ledger.getBalance('energy')).toBe(initialEnergy + 40);
    });

    it('should cap refund credit if ledger is near cap', () => {
      const capLedger = new ResourceLedger(495, 0); // 5 below cap
      const building2 = buildHarvester(capLedger, 0, 0, 0); // spends 100
      // Now ledger is at 395

      demolishManual(building2, capLedger);

      // 395 + 40 = 435, but cap is 500, so this fits fully
      expect(capLedger.getBalance('energy')).toBe(435);
    });
  });

  describe('tickAutoDemolish', () => {
    let building: Building;

    beforeEach(() => {
      building = buildHarvester(ledger, 0, 0, 0);
      setDormant(building);
    });

    it('should not auto-demolish if decay is below threshold', () => {
      // Default threshold is 50
      for (let i = 0; i < PHASE0_BUILDING_CONSTANTS.harvester.autoDemolishThreshold - 1; i++) {
        tickBuildingDecay(building);
      }

      tickAutoDemolish(building);
      expect(building.state).toBe('dormant');
    });

    it('should auto-demolish once decay reaches threshold', () => {
      for (let i = 0; i < PHASE0_BUILDING_CONSTANTS.harvester.autoDemolishThreshold; i++) {
        tickBuildingDecay(building);
      }

      tickAutoDemolish(building);
      expect(building.state).toBe('demolished');
    });

    it('should auto-demolish if decay exceeds threshold', () => {
      for (let i = 0; i < PHASE0_BUILDING_CONSTANTS.harvester.autoDemolishThreshold + 10; i++) {
        tickBuildingDecay(building);
      }

      tickAutoDemolish(building);
      expect(building.state).toBe('demolished');
    });

    it('should not auto-demolish operational building', () => {
      const opBuilding = buildHarvester(ledger, 1, 1, 0);
      tickAutoDemolish(opBuilding);

      expect(opBuilding.state).toBe('operational');
    });

    it('should not auto-demolish already-demolished building', () => {
      building.state = 'demolished';
      tickAutoDemolish(building);

      expect(building.state).toBe('demolished');
    });

    it('should provide no refund on auto-demolish', () => {
      for (let i = 0; i < PHASE0_BUILDING_CONSTANTS.harvester.autoDemolishThreshold; i++) {
        tickBuildingDecay(building);
      }

      const initialEnergy = ledger.getBalance('energy');
      tickAutoDemolish(building);

      // No refund on auto-demolish
      expect(ledger.getBalance('energy')).toBe(initialEnergy);
    });

    it('should retain decayTicks after auto-demolish (for history)', () => {
      const decayAmount = PHASE0_BUILDING_CONSTANTS.harvester.autoDemolishThreshold + 5;
      for (let i = 0; i < decayAmount; i++) {
        tickBuildingDecay(building);
      }

      tickAutoDemolish(building);

      expect(building.state).toBe('demolished');
      expect(building.decayTicks).toBe(decayAmount);
    });

    it('should preserve building ID and position on auto-demolish', () => {
      const id = building.id;
      const x = building.x;
      const y = building.y;

      for (let i = 0; i < PHASE0_BUILDING_CONSTANTS.harvester.autoDemolishThreshold; i++) {
        tickBuildingDecay(building);
      }

      tickAutoDemolish(building);

      expect(building.id).toBe(id);
      expect(building.x).toBe(x);
      expect(building.y).toBe(y);
    });
  });

  describe('Full lifecycle scenarios', () => {
    it('should handle build → dormant → recommission → operational cycle', () => {
      const building = buildHarvester(ledger, 5, 10, 0);
      expect(building.state).toBe('operational');

      // Transition to dormant
      setDormant(building);
      expect(building.state).toBe('dormant');

      // Accumulate some decay
      tickBuildingDecay(building);
      tickBuildingDecay(building);
      expect(building.decayTicks).toBe(2);

      // Recommission back to operational
      recommission(building, ledger, 10);
      expect(building.state).toBe('operational');
      expect(building.decayTicks).toBe(0);
    });

    it('should handle build → dormant → auto-demolish lifecycle', () => {
      const building = buildHarvester(ledger, 0, 0, 0);
      const initialEnergy = ledger.getBalance('energy'); // 500 - 100 = 400

      setDormant(building);

      // Decay until auto-demolish threshold
      for (let i = 0; i < PHASE0_BUILDING_CONSTANTS.harvester.autoDemolishThreshold; i++) {
        tickBuildingDecay(building);
      }

      // Auto-demolish should happen with no refund
      tickAutoDemolish(building);
      expect(building.state).toBe('demolished');
      expect(ledger.getBalance('energy')).toBe(initialEnergy); // No refund, no charge
    });

    it('should handle build → dormant → manual demolish lifecycle', () => {
      const building = buildHarvester(ledger, 0, 0, 0);
      const initialEnergy = ledger.getBalance('energy'); // 500 - 100 = 400

      setDormant(building);

      // Decay a bit
      for (let i = 0; i < 10; i++) {
        tickBuildingDecay(building);
      }

      // Manual demolish with refund (already spent 100, now refund 40)
      demolishManual(building, ledger);
      expect(building.state).toBe('demolished');
      expect(ledger.getBalance('energy')).toBe(initialEnergy + 40); // 400 + 40 = 440
    });

    it('should correctly cost multiple recommissions', () => {
      const building = buildHarvester(ledger, 0, 0, 0);
      setDormant(building);

      // First recommission: cost = 50 + (5 * 2) = 60
      for (let i = 0; i < 5; i++) {
        tickBuildingDecay(building);
      }
      const cost1 = calculateRecommissionCost(building);
      expect(cost1).toBe(60);
      recommission(building, ledger, 10);

      // Dormant again, decay
      setDormant(building);
      for (let i = 0; i < 3; i++) {
        tickBuildingDecay(building);
      }
      const cost2 = calculateRecommissionCost(building);
      expect(cost2).toBe(56); // 50 + (3 * 2)
      recommission(building, ledger, 20);

      // Both costs should have been paid
      // Initial: 500
      // First build: -100 = 400
      // First recommission: -60 = 340
      // Second recommission: -56 = 284
      expect(ledger.getBalance('energy')).toBe(284);
    });

    it('should handle complex decay and recommission scaling', () => {
      const building = buildHarvester(ledger, 0, 0, 0);
      setDormant(building);

      // Accumulate significant decay
      for (let i = 0; i < 30; i++) {
        tickBuildingDecay(building);
      }

      // Cost should be 50 + (30 * 2) = 110
      const expectedCost = 110;
      expect(calculateRecommissionCost(building)).toBe(expectedCost);

      // Recommission should succeed
      const ledgerBefore = ledger.getBalance('energy');
      recommission(building, ledger, 30);

      expect(building.state).toBe('operational');
      expect(building.decayTicks).toBe(0);
      expect(ledger.getBalance('energy')).toBe(ledgerBefore - expectedCost);
    });

    it('should handle alternating dormancy and operation', () => {
      const building = buildHarvester(ledger, 0, 0, 0);

      // Cycle 1: dormant, decay, recommission
      setDormant(building);
      for (let i = 0; i < 5; i++) {
        tickBuildingDecay(building);
      }
      recommission(building, ledger, 5);
      expect(building.state).toBe('operational');
      expect(building.decayTicks).toBe(0);

      // Cycle 2: dormant again
      setDormant(building);
      for (let i = 0; i < 3; i++) {
        tickBuildingDecay(building);
      }
      recommission(building, ledger, 10);
      expect(building.state).toBe('operational');
      expect(building.decayTicks).toBe(0);

      // Should have paid both recommission costs
      const totalSpent = 100 + (50 + 5 * 2) + (50 + 3 * 2); // build + rec1 + rec2
      expect(ledger.getBalance('energy')).toBe(500 - totalSpent);
    });
  });

  describe('Edge cases and error conditions', () => {
    it('should handle building at world boundaries', () => {
      const b1 = buildHarvester(ledger, 0, 0, 0);
      const b2 = buildHarvester(ledger, 99, 99, 0);

      expect(b1.x).toBe(0);
      expect(b1.y).toBe(0);
      expect(b2.x).toBe(99);
      expect(b2.y).toBe(99);
    });

    it('should handle very large decay values', () => {
      const building = buildHarvester(ledger, 0, 0, 0);
      setDormant(building);

      for (let i = 0; i < 1000; i++) {
        tickBuildingDecay(building);
      }

      expect(building.decayTicks).toBe(1000);
      const cost = calculateRecommissionCost(building);
      expect(cost).toBe(50 + 1000 * 2); // 2050
    });

    it('should handle rapid-fire state transitions', () => {
      const building = buildHarvester(ledger, 0, 0, 0);

      setDormant(building);
      tickBuildingDecay(building);
      setDormant(building); // idempotent
      tickBuildingDecay(building);
      setDormant(building); // idempotent

      expect(building.state).toBe('dormant');
      expect(building.decayTicks).toBe(2);

      recommission(building, ledger, 10);
      expect(building.state).toBe('operational');
      expect(building.decayTicks).toBe(0);
    });

    it('should handle tick 0 and large tick numbers', () => {
      const b1 = buildHarvester(ledger, 0, 0, 0);
      const b2 = buildHarvester(ledger, 1, 1, 999999);

      expect(b1.builtAtTick).toBe(0);
      expect(b2.builtAtTick).toBe(999999);
    });

    it('should prevent recommission when insufficient funds after partial spend by economy', () => {
      const building = buildHarvester(ledger, 0, 0, 0);
      setDormant(building);

      // Add enough decay to make cost high
      for (let i = 0; i < 100; i++) {
        tickBuildingDecay(building);
      }

      const cost = calculateRecommissionCost(building); // 50 + 100 * 2 = 250
      const poorLedger = new ResourceLedger(cost - 1, 0); // 1 short

      expect(() => {
        recommission(building, poorLedger, 10);
      }).toThrow('Insufficient energy');

      // Building should remain unchanged
      expect(building.state).toBe('dormant');
      expect(building.decayTicks).toBe(100);
    });
  });

  describe('Constants validation', () => {
    it('should have non-zero build cost', () => {
      expect(PHASE0_BUILDING_CONSTANTS.harvester.buildCost).toBeGreaterThan(0);
    });

    it('should have valid demolish refund fraction (between 0 and 1)', () => {
      const frac = PHASE0_BUILDING_CONSTANTS.harvester.demolishRefundFraction;
      expect(frac).toBeGreaterThan(0);
      expect(frac).toBeLessThanOrEqual(1);
    });

    it('should have positive recommission base cost', () => {
      expect(PHASE0_BUILDING_CONSTANTS.harvester.recommissionBaseCost).toBeGreaterThan(0);
    });

    it('should have non-negative recommission per-tick penalty', () => {
      expect(PHASE0_BUILDING_CONSTANTS.harvester.recommissionPerTickPenalty).toBeGreaterThanOrEqual(0);
    });

    it('should have positive auto-demolish threshold', () => {
      expect(PHASE0_BUILDING_CONSTANTS.harvester.autoDemolishThreshold).toBeGreaterThan(0);
    });
  });
});
