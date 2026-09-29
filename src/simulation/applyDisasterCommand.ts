/**
 * Apply Disaster Command to Engine State
 *
 * Integrates disaster commands into the simulation engine, handling:
 * - RNG seeding for determinism
 * - World and creature state updates
 * - Event logging
 * - Validation
 */

import { World } from './world';
import { Creature } from './creature';
import { applyDisaster, getDisasterInfo } from './disasters';
import { validateDisasterCommand, type DisasterCommand } from './disasterCommand';
import { StreamedRng, RNG_STREAMS, RNG_STREAM_VERSION } from './rng';
import type { SimEvent } from './events';
import type { EngineState } from './engine';

/**
 * Result of applying a disaster command to engine state
 */
export interface DisasterApplicationResult {
  success: boolean;
  reason?: string;
  event?: SimEvent;
  affectedCreatureCount?: number;
  affectedCellCount?: number;
}

/**
 * Apply a disaster command to the engine state
 *
 * This function:
 * 1. Validates the command
 * 2. Creates a seeded RNG stream from the world seed and command ID
 * 3. Applies world and creature effects
 * 4. Logs the event
 * 5. Returns the result
 *
 * The disaster uses a derived RNG stream so multiple disasters in sequence
 * produce deterministic but different results.
 *
 * @param state - Current engine state
 * @param cmd - Disaster command to apply
 * @returns Result with success status, event, and affected counts
 */
export function applyDisasterCommand(
  state: EngineState,
  cmd: DisasterCommand
): DisasterApplicationResult {
  // Validate the command
  const validation = validateDisasterCommand(
    cmd,
    state.world.width,
    state.world.height
  );

  if (!validation.valid) {
    return {
      success: false,
      reason: validation.reason,
    };
  }

  const radius = validation.effectiveRadius ?? 8;

  // Create a deterministic RNG stream from world seed using StreamedRng
  // This ensures the same command applied to the same state produces the same result
  // and uses the shared RNG system across the engine for consistency
  const streamedRng = new StreamedRng(state.seed, state.tick, RNG_STREAM_VERSION);
  const disasterStream = streamedRng.getEntityStream(RNG_STREAMS.DISASTERS, cmd.id);
  const rng = disasterStream.fn;

  // Apply the disaster
  const disaster = {
    kind: cmd.disasterKind,
    tone: getDisasterInfo(cmd.disasterKind).tone,
    title: getDisasterInfo(cmd.disasterKind).title,
    description: getDisasterInfo(cmd.disasterKind).description,
    centerX: cmd.centerX,
    centerY: cmd.centerY,
    radius,
  };

  const outcome = applyDisaster(disaster, state.world, state.creatures, state.tick, rng);

  return {
    success: true,
    event: outcome.event,
    affectedCreatureCount: outcome.affectedCreatures.length,
    affectedCellCount: outcome.affectedCells,
  };
}

/**
 * Create a new engine state with a disaster applied
 *
 * This is an immutable operation that:
 * 1. Deep copies the current state
 * 2. Applies the disaster command
 * 3. Adds the event to the event log
 * 4. Returns the new state
 *
 * @param state - Current engine state
 * @param cmd - Disaster command to apply
 * @returns New engine state with disaster applied, or original state if validation fails
 */
export function tickEngineWithDisaster(
  state: EngineState,
  cmd: DisasterCommand
): EngineState {
  // Validate first
  const validation = validateDisasterCommand(
    cmd,
    state.world.width,
    state.world.height
  );

  if (!validation.valid) {
    console.warn('Disaster command validation failed:', validation.reason);
    return state;
  }

  const radius = validation.effectiveRadius ?? 8;

  // Create deep copies of mutable state
  const newWorld = World.fromJSON(state.world.toJSON());
  const creatures: Creature[] = state.creatures.map(
    (c) =>
      new Creature({
        speciesId: c.speciesId,
        lineageId: c.lineageId,
        parentId: c.parentId,
        traits: { ...c.traits },
        x: c.x,
        y: c.y,
        energy: c.energy,
        age: c.age,
        lifecycleState: c.lifecycleState,
        corpseDecayTicks: c.corpseDecayTicks,
        lastReproductionAge: c.lastReproductionAge,
        generation: c.generation,
        incipientSpeciesId: c.incipientSpeciesId,
        offspringCount: c.offspringCount,
        toxinExposure: c.toxinExposure,
        localResourcePressure: c.localResourcePressure,
        reproductionPressureMultiplier: c.reproductionPressureMultiplier,
        dispersalTargetX: c.dispersalTargetX,
        dispersalTargetY: c.dispersalTargetY,
        lastDispersalTick: c.lastDispersalTick,
        dispersalMoves: c.dispersalMoves,
      })
  );

  // Restore original creature IDs
  for (let i = 0; i < creatures.length; i++) {
    creatures[i].id = state.creatures[i].id;
  }

  // Create seeded RNG for disaster effects using StreamedRng
  const streamedRng = new StreamedRng(state.seed, state.tick, RNG_STREAM_VERSION);
  const disasterStream = streamedRng.getEntityStream(RNG_STREAMS.DISASTERS, cmd.id);
  const rng = disasterStream.fn;

  // Apply the disaster
  const disaster = {
    kind: cmd.disasterKind,
    tone: getDisasterInfo(cmd.disasterKind).tone,
    title: getDisasterInfo(cmd.disasterKind).title,
    description: getDisasterInfo(cmd.disasterKind).description,
    centerX: cmd.centerX,
    centerY: cmd.centerY,
    radius,
  };

  const outcome = applyDisaster(disaster, newWorld, creatures, state.tick, rng);

  return {
    ...state,
    world: newWorld,
    creatures,
    events: [...state.events, outcome.event],
  };
}
