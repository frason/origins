import { describe, it, expect } from 'vitest';
import { createEngine, tickEngine } from '../simulation/engine';
import { Creature } from '../simulation/creature';
import { DEFAULT_TRAITS } from '../utils/traits';

// Verify claim: "Corpse accumulation and nutrient return can reach different
// equilibria across biomes" at the ENGINE integration level (not just by
// calling processDecomposition manually in a test harness).
describe('karen: engine-level biome equilibria check', () => {
  it('cold vs warm cell should decompose corpse biomass at different rates through real tickEngine', () => {
    const makeCorpse = (x: number, y: number) =>
      new Creature({
        speciesId: 'sp1', lineageId: 'l1', parentId: null,
        traits: { ...DEFAULT_TRAITS }, x, y, energy: 100, age: 0,
        lifecycleState: 'dead', corpseDecayTicks: 60,
      });

    let coldState = createEngine(1, [makeCorpse(5, 5)], 20, 20);
    let warmState = createEngine(2, [makeCorpse(5, 5)], 20, 20);

    // Force environmental extremes directly on the world cell.
    coldState.world.setCell(5, 5, { temperature: 0.02, moisture: 0.5, toxicity: 0 });
    warmState.world.setCell(5, 5, { temperature: 0.5, moisture: 0.6, toxicity: 0 });

    for (let i = 0; i < 20; i++) {
      coldState = tickEngine(coldState);
      warmState = tickEngine(warmState);
      // Re-assert temperature since world regen/weather may drift it each tick.
      coldState.world.setCell(5, 5, { temperature: 0.02 });
      warmState.world.setCell(5, 5, { temperature: 0.5 });
    }

    const coldBiomass = coldState.world.getCell(5, 5).corpseBiomass ?? -1;
    const warmBiomass = warmState.world.getCell(5, 5).corpseBiomass ?? -1;
    console.log('coldBiomass', coldBiomass, 'warmBiomass', warmBiomass);

    // Claim: cold biome should retain MORE corpse biomass than warm biome
    // because decomposer activity is temperature-gated.
    expect(coldBiomass).toBeGreaterThan(warmBiomass);
  });
});
