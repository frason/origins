/**
 * DEBUG TEST - Scavenger extinction diagnosis for seed 54321
 * Only enabled when DEBUG_SCAVENGER env var is set
 * Tracks scavenger population, carrion availability, and energy levels per tick
 */

import { describe, it } from 'vitest';

describe('scavenger extinction debug', () => {
  it.skipIf(!process.env.DEBUG_SCAVENGER)(
    'tracks scavenger population, carrion, and energy for seed 54321 ticks 0-100',
    async () => {
      const { buildDemoEngine } = await import('../simulation/demoWorld');
      const { tickEngine } = await import('../simulation/engine');
      const { SIMULATION_CONSTANTS } = await import('../utils/constants');

      const snapshots: Array<{
        tick: number;
        population: number;
        minEnergy: number;
        avgEnergy: number;
        maxEnergy: number;
        totalCarrionBiomass: number;
        corpseCount: number;
      }> = [];

      function analyzeState(state: any, tick: number) {
        const livingScavengers = state.creatures.filter(
          (c: any) => c.lifecycleState === 'alive' && c.traits.energyStrategy === 'scavenger'
        );

        const corpses = state.creatures.filter(
          (c: any) =>
            (c.lifecycleState === 'dead' || c.lifecycleState === 'corpse') &&
            c.corpseDecayTicks > 0
        );

        const energies = livingScavengers.map((c: any) => c.energy);
        const minEnergy = energies.length > 0 ? Math.min(...energies) : 0;
        const maxEnergy = energies.length > 0 ? Math.max(...energies) : 0;
        const avgEnergy =
          energies.length > 0
            ? energies.reduce((a: number, b: number) => a + b, 0) / energies.length
            : 0;

        const totalCarrionBiomass = corpses.reduce((sum: number, c: any) => sum + (c.energy || 0), 0);

        const snapshot = {
          tick,
          population: livingScavengers.length,
          minEnergy: Number(minEnergy.toFixed(2)),
          avgEnergy: Number(avgEnergy.toFixed(2)),
          maxEnergy: Number(maxEnergy.toFixed(2)),
          totalCarrionBiomass: Number(totalCarrionBiomass.toFixed(2)),
          corpseCount: corpses.length,
        };

        snapshots.push(snapshot);
        return snapshot;
      }

      console.log('\n=== SCAVENGER EXTINCTION DIAGNOSIS (SEED 54321) ===\n');

      let state = buildDemoEngine(54321, { ...SIMULATION_CONSTANTS });
      const initial = analyzeState(state, 0);
      console.log(
        `Tick 0: pop=${initial.population}, carrion=${initial.totalCarrionBiomass}, ` +
          `energy=[${initial.minEnergy}-${initial.maxEnergy}] avg=${initial.avgEnergy}`
      );

      let firstZeroTick = -1;
      for (let tick = 1; tick <= 100; tick++) {
        state = tickEngine(state);
        const snapshot = analyzeState(state, tick);

        // Log critical transitions and early ticks
        const shouldLog =
          tick <= 15 ||
          snapshot.population === 0 ||
          (snapshots.length >= 2 && snapshots[snapshots.length - 2].population > snapshot.population);

        if (shouldLog) {
          console.log(
            `Tick ${tick}: pop=${snapshot.population}, carrion=${snapshot.totalCarrionBiomass}, ` +
              `corpses=${snapshot.corpseCount}, energy=[${snapshot.minEnergy}-${snapshot.maxEnergy}] ` +
              `avg=${snapshot.avgEnergy}`
          );
        }

        if (snapshot.population === 0 && firstZeroTick === -1) {
          firstZeroTick = tick;
          console.log(`\n>>> EXTINCTION: Scavengers reach 0 at tick ${firstZeroTick}\n`);
        }
      }

      // Analysis
      console.log('\n=== DIAGNOSIS SUMMARY ===\n');
      if (firstZeroTick > 0) {
        const preExtinct = snapshots[firstZeroTick - 1];
        const extinct = snapshots[firstZeroTick];
        console.log(`Scavenger extinction occurs at tick ${firstZeroTick}`);
        console.log(
          `Tick ${firstZeroTick - 1}: pop=${preExtinct.population}, ` +
            `carrion=${preExtinct.totalCarrionBiomass}, avg_energy=${preExtinct.avgEnergy}`
        );
        console.log(
          `Tick ${firstZeroTick}: pop=${extinct.population}, ` +
            `carrion=${extinct.totalCarrionBiomass}, avg_energy=${extinct.avgEnergy}`
        );
      }

      console.log('\nFull data available above');
    }
  );
});
