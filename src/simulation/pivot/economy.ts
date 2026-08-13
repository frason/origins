/**
 * Phase 0 Core Economy Ledger
 *
 * Tracks two resources: Energy and Biomass
 * Both have starting values, storage caps, and validation rules
 * based on the Phase 0 vertical slice design (see SPEC.md)
 */

import type { World } from '../world';

export type ResourceType = 'energy' | 'biomass';

/**
 * HarvesterState: describes whether a Biomass Harvester building is operational
 * and where it's located on the world grid.
 *
 * A harvester placed at tile (x, y) with operational=true will draw producerBiomass
 * each tick and convert it to stockpiled Biomass per SPEC.md phase 0 rates.
 */
export interface HarvesterState {
  operational: boolean; // Is the harvester currently active?
  x: number; // Grid x-coordinate of harvester placement (if operational)
  y: number; // Grid y-coordinate of harvester placement (if operational)
}

/**
 * Phase 0 Economy Constants
 * All numbers tunable via playtesting; these are Phase 0 defaults
 * (see SPEC.md "Core Economy — Phase 0 definition", lines 44-69)
 */
export const PHASE0_ECONOMY_CONSTANTS = {
  energy: {
    startingValue: 500,
    storageCap: 500,
    passiveDrainPerTick: 1,
    buildingConstructionCost: 100,
    tier1ResponseCost: 20,
  },
  biomass: {
    startingValue: 0,
    storageCap: 300,
    harvesterDrawMax: 2.0,
  },
} as const;

/**
 * ResourceLedger: tracks Energy and Biomass balances
 *
 * Enforces:
 * - Storage caps (credit/spend never exceed cap)
 * - Insufficient funds rejection (spend throws if insufficient)
 * - Minimum balance of 0 (no negative resources)
 */
export class ResourceLedger {
  private energy: number;
  private biomass: number;

  constructor(
    energyStart: number = PHASE0_ECONOMY_CONSTANTS.energy.startingValue,
    biomassStart: number = PHASE0_ECONOMY_CONSTANTS.biomass.startingValue
  ) {
    this.energy = Math.max(0, Math.min(energyStart, PHASE0_ECONOMY_CONSTANTS.energy.storageCap));
    this.biomass = Math.max(0, Math.min(biomassStart, PHASE0_ECONOMY_CONSTANTS.biomass.storageCap));
  }

  /**
   * Check if sufficient balance exists for a spend
   */
  canAfford(resource: ResourceType, amount: number): boolean {
    if (amount < 0) return false; // negative spend not allowed
    const current = resource === 'energy' ? this.energy : this.biomass;
    return current >= amount;
  }

  /**
   * Deduct a resource from balance
   * Throws Error if insufficient funds
   * Returns the amount actually spent
   */
  spend(resource: ResourceType, amount: number): number {
    if (!this.canAfford(resource, amount)) {
      throw new Error(
        `Insufficient ${resource}: have ${this.getBalance(resource)}, need ${amount}`
      );
    }

    if (resource === 'energy') {
      this.energy -= amount;
      return amount;
    } else {
      this.biomass -= amount;
      return amount;
    }
  }

  /**
   * Add a resource to balance, respecting storage cap
   * Returns the amount actually credited (may be less if capped)
   */
  credit(resource: ResourceType, amount: number): number {
    if (amount <= 0) return 0; // no negative credits

    const cap = resource === 'energy'
      ? PHASE0_ECONOMY_CONSTANTS.energy.storageCap
      : PHASE0_ECONOMY_CONSTANTS.biomass.storageCap;

    const current = resource === 'energy' ? this.energy : this.biomass;
    const available = cap - current;
    const credited = Math.min(amount, available);

    if (resource === 'energy') {
      this.energy += credited;
    } else {
      this.biomass += credited;
    }

    return credited;
  }

  /**
   * Apply passive drain (Energy only, per tick)
   * Floored at 0
   */
  drainPassive(): void {
    this.energy = Math.max(0, this.energy - PHASE0_ECONOMY_CONSTANTS.energy.passiveDrainPerTick);
  }

  /**
   * Get current balance of a resource
   */
  getBalance(resource: ResourceType): number {
    return resource === 'energy' ? this.energy : this.biomass;
  }

  /**
   * Get both balances as an object (for inspection/serialization)
   */
  getBalances(): { energy: number; biomass: number } {
    return {
      energy: this.energy,
      biomass: this.biomass,
    };
  }

  /**
   * Reset ledger to starting values (for testing/reset scenarios)
   */
  reset(): void {
    this.energy = PHASE0_ECONOMY_CONSTANTS.energy.startingValue;
    this.biomass = PHASE0_ECONOMY_CONSTANTS.biomass.startingValue;
  }
}

/**
 * tickPhase0Economy: Main economy tick function for Phase 0
 *
 * Pure function that applies one tick's worth of economy changes:
 * 1. Applies passive Energy drain (floored at 0)
 * 2. If harvesterState indicates an operational harvester, draws from that tile's
 *    producerBiomass and converts it to stockpiled Biomass
 *
 * The function mutates world (to update tile producerBiomass) and ledger (to apply
 * drain and credit biomass), but is deterministic: identical inputs always produce
 * identical outputs.
 *
 * @param world - World grid containing cells with producerBiomass values
 * @param ledger - ResourceLedger tracking global Energy and Biomass balances
 * @param harvesterState - Current harvester placement and operational status
 * @param tick - Current simulation tick (for logging/determinism purposes; not used here)
 *
 * Per SPEC.md "Core Economy — Phase 0 definition":
 * - Energy drain: −1/tick (fixed base beachhead survival cost), floored at 0
 * - Biomass harvest (if operational): 2.0 producerBiomass → 1 stockpiled Biomass per tick
 *   - Draw never takes cell's producerBiomass below 0
 *   - Ledger never exceeds its Biomass storage cap (300)
 *   - No harvester placed/operational → zero Biomass income that tick
 */
export function tickPhase0Economy(
  world: World,
  ledger: ResourceLedger,
  harvesterState: HarvesterState,
  tick: number
): void {
  // Step 1: Apply passive Energy drain (floored at 0)
  ledger.drainPassive();

  // Step 2: If harvester is operational, harvest from that tile
  if (harvesterState.operational) {
    const { x, y } = harvesterState;

    // Validate harvester coordinates are within world bounds
    if (x >= 0 && x < world.width && y >= 0 && y < world.height) {
      // Get the current cell to read producerBiomass
      const cell = world.getCell(x, y);

      // Calculate how much producerBiomass we can draw
      // Conversion rate: 2.0 producerBiomass → 1 stockpiled Biomass
      const maxDrawPerTick = PHASE0_ECONOMY_CONSTANTS.biomass.harvesterDrawMax; // 2.0
      const availableToDraw = Math.min(maxDrawPerTick, cell.producerBiomass);

      // Convert: 2.0 producerBiomass → 1 stockpiled Biomass
      const biomassIncome = availableToDraw / 2;

      // Update the tile: reduce producerBiomass
      const remainingBiomass = Math.max(0, cell.producerBiomass - availableToDraw);
      world.setCell(x, y, { producerBiomass: remainingBiomass });

      // Credit the ledger with harvested biomass (respects cap)
      ledger.credit('biomass', biomassIncome);
    }
  }
}

