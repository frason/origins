import { describe, it, expect } from 'vitest';
import { World } from '../simulation/world';
import { Creature } from '../simulation/creature';
import { DEFAULT_TRAITS } from '../utils/traits';
import {
  aggregateCorpseBiomass,
  calculateDecomposerActivity,
  processDecomposition,
  syncCreatureEnergyWithDecomposition,
} from '../simulation/decomposition';
import { SIMULATION_CONSTANTS } from '../utils/constants';

describe('karen perf 168 isolated decomposition cost', () => {
  it('measures decomposition-only overhead per tick, isolated from rest of engine', () => {
    const world = new World(100, 100, SIMULATION_CONSTANTS, 1);
    const N = 1500;
    const creatures: Creature[] = [];
    for (let i = 0; i < N; i++) {
      const c = new Creature({
        speciesId: 'sp1',
        lineageId: 'l1',
        parentId: null,
        traits: { ...DEFAULT_TRAITS },
        x: i % 100,
        y: Math.floor(i / 100) % 100,
        energy: 50,
        age: 0,
        lifecycleState: i % 3 === 0 ? 'dead' : 'alive',
        corpseDecayTicks: 40,
      });
      creatures.push(c);
    }

    const TICKS = 20;
    const start = performance.now();
    for (let t = 0; t < TICKS; t++) {
      aggregateCorpseBiomass(creatures, world, SIMULATION_CONSTANTS.corpseDecayDurationTicks);

      const consumptionPerCell = new Map<string, number>();
      for (let y = 0; y < world.height; y++) {
        for (let x = 0; x < world.width; x++) {
          const cell = world.getCell(x, y);
          const activity = calculateDecomposerActivity(
            cell.temperature, cell.moisture, cell.toxicity, cell.corpseBiomass || 0, SIMULATION_CONSTANTS
          );
          const consumed = processDecomposition(cell, activity, SIMULATION_CONSTANTS.corpseDecayRate);
          consumptionPerCell.set(`${x},${y}`, consumed);
          world.setCell(x, y, { decompserActivity: activity, corpseBiomass: cell.corpseBiomass, nutrients: cell.nutrients });
        }
      }

      for (let y = 0; y < world.height; y++) {
        for (let x = 0; x < world.width; x++) {
          const consumed = consumptionPerCell.get(`${x},${y}`) ?? 0;
          if (consumed > 0) {
            syncCreatureEnergyWithDecomposition(x, y, consumed, creatures);
          }
        }
      }
    }
    const elapsed = performance.now() - start;
    console.log(`Isolated decomposition-only cost: ${(elapsed / TICKS).toFixed(3)}ms/tick with ${N} creatures on 100x100 grid`);
    expect(true).toBe(true);
  });
});
