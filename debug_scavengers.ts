import { buildDemoEngine } from './src/simulation/demoWorld';
import { tickEngine } from './src/simulation/engine';
import { SIMULATION_CONSTANTS } from './src/utils/constants';

function analyzeScavengersAt(seed: number, targetTick: number = 100) {
  let state = buildDemoEngine(seed, { ...SIMULATION_CONSTANTS });

  for (let tick = 1; tick <= targetTick; tick++) {
    state = tickEngine(state);

    const living = state.creatures.filter(c => c.lifecycleState === 'alive');
    const scavengers = living.filter(c => c.traits.energyStrategy === 'scavenger');

    // Print interesting ticks
    if (tick % 10 === 0 || (tick >= 55 && tick <= 65) || scavengers.length === 0) {
      const corpses = state.creatures.filter(c => c.lifecycleState === 'dead');
      const allCorpses = corpses.filter(c => c.corpseDecayTicks > 0);
      const generatedCorpses = allCorpses.filter(c => !c.lineageId.endsWith('_starter_carrion'));
      const starterCarrion = allCorpses.filter(c => c.lineageId.endsWith('_starter_carrion'));

      console.log(`Tick ${tick}: ` +
        `Scavengers=${scavengers.length} ` +
        `Living=${living.length} ` +
        `StarterCarrion=${starterCarrion.length} ` +
        `GeneratedCorpses=${generatedCorpses.length} ` +
        `AllCorpses=${allCorpses.length}`
      );

      if (scavengers.length > 0 && scavengers.length <= 2) {
        scavengers.forEach(s => {
          console.log(`  Scavenger ${s.id}: energy=${s.energy.toFixed(1)}, age=${s.age}`);
        });
      }
    }

    if (scavengers.length === 0 && tick < targetTick) {
      console.log(`\n*** Scavengers extinct at tick ${tick} ***\n`);
      break;
    }
  }
}

console.log('=== Seed 54321 ===');
analyzeScavengersAt(54321, 100);

console.log('\n=== Seed 12345 ===');
analyzeScavengersAt(12345, 100);
