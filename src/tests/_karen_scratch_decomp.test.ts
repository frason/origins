import { describe, it, expect } from 'vitest';
import { World } from '../simulation/world';
import { Creature } from '../simulation/creature';
import { checkAgeAndStarvation, decayCorpse, aggregateCorpseBiomass, calculateDecomposerActivity, processDecomposition } from '../simulation/decomposition';
import { DEFAULT_TRAITS } from '../utils/traits';
import { CORPSE_DECAY_RATE, CORPSE_DECAY_DURATION_TICKS } from '../utils/constants';

describe('KAREN scratch: double counting check', () => {
  it('checks whether nutrients are double-counted after 1 tick of both mechanisms', () => {
    Creature.resetIdCounter();
    const world = new World();
    const creature = new Creature({
      speciesId: 's1', lineageId: 'l1', parentId: null,
      traits: { ...DEFAULT_TRAITS }, x: 1, y: 1, energy: 0, age: 0, lifecycleState: 'alive',
    });
    creature.energy = 100;
    creature.lifecycleState = 'dead';
    creature.corpseDecayTicks = CORPSE_DECAY_DURATION_TICKS;
    expect(creature.lifecycleState).toBe('dead');

    const startNutrients = world.getCell(1, 1).nutrients;

    aggregateCorpseBiomass([creature], world);
    const cell = world.getCell(1, 1);
    const activity = calculateDecomposerActivity(cell.temperature, cell.moisture, cell.toxicity, cell.corpseBiomass || 0);
    cell.decompserActivity = activity;
    processDecomposition(cell, activity, CORPSE_DECAY_RATE);

    const afterTileDecomp = world.getCell(1, 1).nutrients;
    const tileNutrients = afterTileDecomp - startNutrients;

    decayCorpse(creature, world, CORPSE_DECAY_RATE);
    const afterLegacy = world.getCell(1, 1).nutrients;
    const legacyNutrients = afterLegacy - afterTileDecomp;

    console.log('activity=', activity, 'tileNutrients=', tileNutrients, 'legacyNutrients=', legacyNutrients, 'totalNutrientsAdded=', afterLegacy - startNutrients, 'creatureEnergyRemaining=', creature.energy, 'cell.corpseBiomass(stale)=', world.getCell(1, 1).corpseBiomass);
  });
});
