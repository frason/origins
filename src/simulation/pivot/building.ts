/**
 * Phase 0 Building System: Biomass Harvester Lifecycle
 *
 * Implements the full operational → dormant → demolished lifecycle for Phase 0's
 * single building type: the Biomass Harvester. Buildings decay when dormant and
 * can be recommissioned at increasing cost, manually demolished for partial refund,
 * or auto-demolished once decay crosses a threshold.
 *
 * See SPEC.md "Pivot: Crisis-Response Reframe" for Phase 0 building context.
 */

import type { ResourceLedger } from './economy';

/**
 * Building state representation
 *
 * A building placed at world grid position (x, y) with three possible lifecycle states:
 * - operational: actively producing/functioning
 * - dormant: inactive, decaying over time, can be recommissioned at cost
 * - demolished: removed, no refund possible
 *
 * @property id - Unique identifier for this building instance
 * @property x - Grid x-coordinate of building placement
 * @property y - Grid y-coordinate of building placement
 * @property state - Current lifecycle state
 * @property decayTicks - Number of ticks spent in dormant state; accumulates each tick while dormant
 * @property builtAtTick - Simulation tick when building was constructed (for logging/history)
 */
export interface Building {
  id: string;
  x: number;
  y: number;
  state: 'operational' | 'dormant' | 'demolished';
  decayTicks: number;
  builtAtTick: number;
}

/**
 * Phase 0 Building Constants
 * All tunable via playtesting; these are Phase 0 defaults
 */
export const PHASE0_BUILDING_CONSTANTS = {
  harvester: {
    buildCost: 100, // Energy cost to construct
    demolishRefundFraction: 0.4, // 40% of build cost refunded on manual demolish
    autoDemolishThreshold: 50, // decayTicks >= this value triggers auto-demolish
    recommissionBaseCost: 50, // Base cost to recommission from dormant state
    recommissionPerTickPenalty: 2, // Additional cost per decayTick accumulated
  },
} as const;

/**
 * Unique ID generator for buildings
 * (Simple counter; in production would use UUID or server-allocated IDs)
 */
let buildingIdCounter = 0;

/**
 * Reset the building ID counter (for testing)
 */
export function resetBuildingIdCounter(): void {
  buildingIdCounter = 0;
}

/**
 * Allocate a new unique building ID
 */
function allocateBuildingId(): string {
  return `building_${++buildingIdCounter}`;
}

/**
 * buildHarvester: Construct a new Biomass Harvester building
 *
 * Spends 100 Energy from the ledger (fixed build cost) and places a new harvester
 * at the specified world grid coordinates. Returns the constructed building in
 * operational state, or throws an error if insufficient Energy.
 *
 * @param ledger - ResourceLedger to charge the build cost to
 * @param x - Grid x-coordinate for placement
 * @param y - Grid y-coordinate for placement
 * @param tick - Current simulation tick (recorded in builtAtTick)
 * @returns Newly constructed Building in operational state
 * @throws Error if ledger has insufficient Energy
 *
 * Per SPEC.md, build cost is 100 Energy (fixed, same for all Phase 0 harvesters).
 * Action is rejected outright (no partial spend) if funds insufficient.
 */
export function buildHarvester(
  ledger: ResourceLedger,
  x: number,
  y: number,
  tick: number
): Building {
  // Attempt to spend the fixed build cost
  ledger.spend('energy', PHASE0_BUILDING_CONSTANTS.harvester.buildCost);

  // If spend() didn't throw, we have a new building
  const building: Building = {
    id: allocateBuildingId(),
    x,
    y,
    state: 'operational',
    decayTicks: 0,
    builtAtTick: tick,
  };

  return building;
}

/**
 * setDormant: Transition a building from operational to dormant state
 *
 * Phase 0 keeps this an explicit manual/caller-triggered transition (no automatic
 * idle-detection yet; that needs a damage system this phase doesn't have).
 * Does nothing if already dormant or demolished.
 *
 * @param building - Building to transition (mutated in-place)
 */
export function setDormant(building: Building): void {
  if (building.state === 'operational') {
    building.state = 'dormant';
  }
}

/**
 * tickBuildingDecay: Apply one tick of decay to a building
 *
 * If the building is in dormant state, increments decayTicks by 1.
 * Does nothing if operational or demolished.
 *
 * @param building - Building to decay (mutated in-place)
 */
export function tickBuildingDecay(building: Building): void {
  if (building.state === 'dormant') {
    building.decayTicks += 1;
  }
}

/**
 * recommission: Restore a dormant building to operational state
 *
 * Spends Energy from the ledger to recommission, with cost scaling based on
 * how long the building has been dormant:
 *   cost = baseCost + (decayTicks * perTickPenalty)
 *   cost = 50 + (decayTicks * 2)
 *
 * On success, sets state to 'operational' and resets decayTicks to 0.
 * Does nothing and throws error if building is already operational or demolished,
 * or if ledger has insufficient funds.
 *
 * @param building - Building to recommission (mutated on success)
 * @param ledger - ResourceLedger to charge cost to
 * @param tick - Current simulation tick (not used, present for consistency)
 * @throws Error if building is not dormant, or if insufficient funds
 */
export function recommission(
  building: Building,
  ledger: ResourceLedger,
  tick: number
): void {
  if (building.state !== 'dormant') {
    throw new Error(`Cannot recommission building in state "${building.state}"; must be dormant`);
  }

  // Calculate cost based on decay
  const cost =
    PHASE0_BUILDING_CONSTANTS.harvester.recommissionBaseCost +
    building.decayTicks * PHASE0_BUILDING_CONSTANTS.harvester.recommissionPerTickPenalty;

  // Attempt to spend (will throw if insufficient)
  ledger.spend('energy', cost);

  // If spend() succeeded, restore building to operational state
  building.state = 'operational';
  building.decayTicks = 0;
}

/**
 * demolishManual: Manually demolish a building and refund partial cost
 *
 * Instantly demolishes a building (regardless of state) and refunds a fixed
 * fraction (40%) of the original build cost (100 Energy) to the ledger.
 *
 * Refund amount: 100 * 0.4 = 40 Energy
 *
 * @param building - Building to demolish (mutated in-place)
 * @param ledger - ResourceLedger to credit refund to
 */
export function demolishManual(building: Building, ledger: ResourceLedger): void {
  building.state = 'demolished';

  // Refund a fixed fraction of the original build cost
  const refundAmount =
    PHASE0_BUILDING_CONSTANTS.harvester.buildCost *
    PHASE0_BUILDING_CONSTANTS.harvester.demolishRefundFraction;

  ledger.credit('energy', refundAmount);
}

/**
 * tickAutoDemolish: Check and apply auto-demolish based on decay threshold
 *
 * If a building is dormant and decayTicks >= threshold (50 by default),
 * automatically demolishes it with no refund.
 *
 * Does nothing if building is operational or already demolished.
 *
 * @param building - Building to check and potentially auto-demolish (mutated if threshold crossed)
 */
export function tickAutoDemolish(building: Building): void {
  if (
    building.state === 'dormant' &&
    building.decayTicks >= PHASE0_BUILDING_CONSTANTS.harvester.autoDemolishThreshold
  ) {
    building.state = 'demolished';
    // No refund on auto-demolish; decayTicks retained for historical purposes
  }
}

/**
 * calculateRecommissionCost: Calculate the cost to recommission a dormant building
 *
 * Utility function for UI/preview purposes. Returns the energy cost that would be
 * charged to recommission the given building based on its current decay state.
 *
 * @param building - Building in dormant state
 * @returns Energy cost for recommissioning
 */
export function calculateRecommissionCost(building: Building): number {
  return (
    PHASE0_BUILDING_CONSTANTS.harvester.recommissionBaseCost +
    building.decayTicks * PHASE0_BUILDING_CONSTANTS.harvester.recommissionPerTickPenalty
  );
}
