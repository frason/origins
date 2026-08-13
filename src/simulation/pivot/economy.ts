/**
 * Phase 0 Core Economy Ledger
 *
 * Tracks two resources: Energy and Biomass
 * Both have starting values, storage caps, and validation rules
 * based on the Phase 0 vertical slice design (see SPEC.md)
 */

export type ResourceType = 'energy' | 'biomass';

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
