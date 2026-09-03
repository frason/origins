import { describe, it, expect } from 'vitest';
import { World } from '../simulation/world';
import { Creature } from '../simulation/creature';
import { checkAgeAndStarvation, decayCorpse, aggregateCorpseBiomass, calculateDecomposerActivity, processDecomposition } from '../simulation/decomposition';
import { DEFAULT_TRAITS } from '../utils/traits';
import { CORPSE_DECAY_RATE, CORPSE_DECAY_DURATION_TICKS } from '../utils/constants';

describe('KAREN scratch2: double counting with favorable conditions', () => {
  it('demonstrates nutrient double counting over multiple ticks', () => {
    Creature.resetIdCounter();
    const world = new World();
    world.setCell(1, 1, { temperature: 0.5, moisture: 0.6, toxicity: 0, nutrients: 0 });
    const creature = new Creature({
      speciesId: 's1', lineageId: 'l1', parentId: null,
      traits: { ...DEFAULT_TRAITS }, x: 1, y: 1, energy: 0, age: 0, lifecycleState: 'alive',
    });
    creature.energy = 1000;
    creature.lifecycleState = 'dead';
    creature.corpseDecayTicks = CORPSE_DECAY_DURATION_TICKS;

    let totalTileNutrients = 0;
    let totalLegacyNutrients = 0;

    for (let tick = 0; tick < 5; tick++) {
      const before = world.getCell(1, 1).nutrients;
      aggregateCorpseBiomass([creature], world);
      const cell = world.getCell(1, 1);
      const activity = calculateDecomposerActivity(cell.temperature, cell.moisture, cell.toxicity, cell.corpseBiomass || 0);
      cell.decompserActivity = activity;
      processDecomposition(cell, activity, CORPSE_DECAY_RATE);
      const afterTile = world.getCell(1, 1).nutrients;
      totalTileNutrients += afterTile - before;

      decayCorpse(creature, world, CORPSE_DECAY_RATE);
      const afterLegacy = world.getCell(1, 1).nutrients;
      totalLegacyNutrients += afterLegacy - afterTile;

      console.log(`tick=${tick} activity=${activity.toFixed(3)} corpseBiomass(pre-consume)=${cell.corpseBiomass?.toFixed?.(2)} creature.energy=${creature.energy.toFixed(2)} tileNutrientsThisTick=${(afterTile-before).toFixed(2)} legacyNutrientsThisTick=${(afterLegacy-afterTile).toFixed(2)}`);
    }
    console.log('TOTALS: tile=', totalTileNutrients.toFixed(2), 'legacy=', totalLegacyNutrients.toFixed(2), 'combined=', (totalTileNutrients+totalLegacyNutrients).toFixed(2), 'creature.energy remaining=', creature.energy.toFixed(2));
  });
});
