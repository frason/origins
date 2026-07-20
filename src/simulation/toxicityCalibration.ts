import { SIMULATION_CONSTANTS } from '../utils/constants';
import { buildDemoEngine } from './demoWorld';
import { tickEngine } from './engine';
import { getToxicityHazard } from './toxicity';

export interface ToxicityCalibrationSample {
  tick: number;
  totalToxicity: number;
  maximumToxicity: number;
  severeCellCount: number;
  suppressedProducerCellCount: number;
  exposedCreatureCount: number;
  creatureExposureCost: number;
}

export interface ToxicityCalibrationResult {
  seed: number;
  samples: ToxicityCalibrationSample[];
}

/** Measure shared visual and ecological toxicity thresholds in a seeded live world. */
export function runToxicityCalibration(
  seed: number,
  horizons: readonly number[] = [60, 100]
): ToxicityCalibrationResult {
  const checkpoints = [...new Set(horizons.map((tick) => Math.max(0, Math.floor(tick))))]
    .sort((a, b) => a - b);
  const finalTick = checkpoints[checkpoints.length - 1] ?? 0;
  let state = buildDemoEngine(seed, { ...SIMULATION_CONSTANTS });
  const samples: ToxicityCalibrationSample[] = [];
  for (let tick = 1; tick <= finalTick; tick++) {
    state = tickEngine(state);
    if (!checkpoints.includes(tick)) continue;
    let totalToxicity = 0;
    let maximumToxicity = 0;
    let severeCellCount = 0;
    let suppressedProducerCellCount = 0;
    for (let y = 0; y < state.world.height; y++) {
      for (let x = 0; x < state.world.width; x++) {
        const cell = state.world.getCell(x, y);
        const hazard = getToxicityHazard(cell.toxicity);
        totalToxicity += cell.toxicity;
        maximumToxicity = Math.max(maximumToxicity, cell.toxicity);
        if (hazard.severity === 'severe') severeCellCount++;
        if (hazard.producerGrowthMultiplier <= 0.5) suppressedProducerCellCount++;
      }
    }
    let exposedCreatureCount = 0;
    let creatureExposureCost = 0;
    for (const creature of state.creatures) {
      if (creature.lifecycleState !== 'alive') continue;
      const cost = getToxicityHazard(
        state.world.getCell(creature.x, creature.y).toxicity
      ).creatureEnergyCost;
      if (cost > 0) exposedCreatureCount++;
      creatureExposureCost += cost;
    }
    samples.push({
      tick, totalToxicity, maximumToxicity, severeCellCount,
      suppressedProducerCellCount, exposedCreatureCount, creatureExposureCost,
    });
  }
  return { seed, samples };
}
