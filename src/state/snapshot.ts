import type { EngineState } from '../simulation/engine';
import type { CreatureSnapshot, WorldSnapshot } from './store';

/**
 * Create an isolated render snapshot while reusing append-only engine history arrays.
 * Engine ticks always replace events/history arrays rather than mutating them.
 */
export function snapshotEngine(engine: EngineState): WorldSnapshot {
  const worldJSON = engine.world.toJSON() as {
    width: number;
    height: number;
    cells: WorldSnapshot['cells'];
  };
  return {
    width: worldJSON.width,
    height: worldJSON.height,
    cells: worldJSON.cells,
    creatures: engine.creatures.map(
      (creature): CreatureSnapshot => ({
        id: creature.id,
        speciesId: creature.speciesId,
        lineageId: creature.lineageId,
        parentId: creature.parentId,
        traits: { ...creature.traits },
        x: creature.x,
        y: creature.y,
        energy: creature.energy,
        age: creature.age,
        lifecycleState: creature.lifecycleState,
        corpseDecayTicks: creature.corpseDecayTicks,
        lastReproductionAge: creature.lastReproductionAge,
        generation: creature.generation,
        incipientSpeciesId: creature.incipientSpeciesId,
      })
    ),
    events: engine.events,
    seed: engine.seed,
    tick: engine.tick,
    constants: { ...engine.constants },
    history: engine.history,
    speciesProfiles: engine.speciesProfiles,
    incipientSpecies: engine.incipientSpecies,
  };
}
