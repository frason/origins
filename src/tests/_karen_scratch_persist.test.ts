import { describe, it, expect } from 'vitest';
import { World } from '../simulation/world';
import { calculateDecomposerActivity, processDecomposition } from '../simulation/decomposition';

describe('karen scratch: does processDecomposition persist to world', () => {
  it('checks whether world.getCell mutation via processDecomposition persists', () => {
    const world = new World(5, 5);
    let cell = world.getCell(1, 1);
    cell.corpseBiomass = 100;
    cell.temperature = 0.5;
    cell.moisture = 0.6;
    cell.toxicity = 0;
    world.setCell(1, 1, cell);

    const activity = calculateDecomposerActivity(0.5, 0.6, 0, 100);
    const cellRef = world.getCell(1, 1);
    processDecomposition(cellRef, activity);

    console.log('local mutated copy corpseBiomass =', cellRef.corpseBiomass);
    console.log('world stored corpseBiomass (no setCell called) =', world.getCell(1, 1).corpseBiomass);

    // This demonstrates the bug: local mutation happens but world state unchanged
    expect(cellRef.corpseBiomass).toBeLessThan(100);
  });
});
