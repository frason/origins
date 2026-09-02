import { calculateProducerGrowth } from '../simulation/producer';
import { getProducerBiteCapacity } from '../simulation/energy';
import { getProducerTraits } from '../simulation/producerTypes';
import { measureBiomassCells, type BiomassMetrics } from '../simulation/biomassMetrics';
import type { CellSnapshot, CreatureSnapshot, WorldSnapshot } from '../state/store';
import type { SimulationConstants } from '../utils/constants';

export type RecoveryDirection = 'recovering' | 'declining' | 'steady' | 'insufficient';

export interface LocalBiomassSummary extends BiomassMetrics {
  recoveryDirection: RecoveryDirection;
  recoveryLabel: string;
}

export function buildLocalBiomassSummary(world: WorldSnapshot): LocalBiomassSummary {
  const metrics = measureBiomassCells(
    world.cells, world.width, world.height, world.creatures
  );
  const measuredHistory = (world.history ?? []).filter((sample) => sample.biomass);
  if (measuredHistory.length < 2) {
    return { ...metrics, recoveryDirection: 'insufficient', recoveryLabel: '—' };
  }
  const previous = measuredHistory[measuredHistory.length - 2].biomass!;
  const latest = measuredHistory[measuredHistory.length - 1].biomass!;
  const change = latest.averageOccupiedTileBiomass - previous.averageOccupiedTileBiomass;
  const threshold = Math.max(0.25, Math.abs(previous.averageOccupiedTileBiomass) * 0.02);
  if (change > threshold) {
    return { ...metrics, recoveryDirection: 'recovering', recoveryLabel: '↑ Recovering' };
  }
  if (change < -threshold) {
    return { ...metrics, recoveryDirection: 'declining', recoveryLabel: '↓ Declining' };
  }
  return { ...metrics, recoveryDirection: 'steady', recoveryLabel: '→ Steady' };
}

export interface TileBiomassContext {
  capacity: number;
  biomassShare: number;
  grazingCapacity: number;
  grazingLabel: string;
  recoveryPerTick: number;
  recoveryLabel: string;
}

export function buildTileBiomassContext(
  cell: CellSnapshot,
  living: CreatureSnapshot[],
  constants: SimulationConstants
): TileBiomassContext {
  const capacity = getProducerTraits(cell.producerArchetype).carryingCapacity;
  const grazers = living.filter((creature) =>
    creature.traits.energyStrategy === 'herbivore' ||
    creature.traits.energyStrategy === 'omnivore'
  );
  const grazingCapacity = grazers.reduce(
    (sum, creature) => sum + getProducerBiteCapacity(creature), 0
  );
  const pressureRatio = grazingCapacity / Math.max(1, cell.producerBiomass);
  const grazingLabel = grazingCapacity === 0
    ? 'None observed'
    : pressureRatio >= 1
      ? 'High'
      : pressureRatio >= 0.25 ? 'Moderate' : 'Low';
  const recoveryPerTick = calculateProducerGrowth(
    cell, 'solar', constants.producerGrowthRate, true, true
  ).growth;
  return {
    capacity,
    biomassShare: capacity > 0 ? cell.producerBiomass / capacity : 0,
    grazingCapacity,
    grazingLabel,
    recoveryPerTick,
    recoveryLabel: recoveryPerTick > 0.01
      ? 'Recovering'
      : recoveryPerTick < -0.01 ? 'Declining' : 'Stable',
  };
}

export interface TileDecompositionContext {
  corpseBiomass: number;
  decompserActivity: number; // 0-1
  decompserLabel: string;
  estimatedCycleTime: number; // ticks until fully decomposed
}

export function buildTileDecompositionContext(
  cell: CellSnapshot
): TileDecompositionContext {
  const corpseBiomass = cell.corpseBiomass ?? 0;
  const decompserActivity = cell.decompserActivity ?? 0;

  // Estimate how many ticks until corpses fully decompose
  let estimatedCycleTime = Number.POSITIVE_INFINITY;
  if (corpseBiomass > 0 && decompserActivity > 0) {
    // At typical rates (0.1 decay per tick), estimate time to consume corpus
    const typicalDecayRate = 0.1;
    const timeToDecompose = corpseBiomass / Math.max(0.001, corpseBiomass * typicalDecayRate * decompserActivity);
    estimatedCycleTime = Math.ceil(timeToDecompose);
  }

  const decompserLabel = corpseBiomass === 0
    ? 'No corpses'
    : decompserActivity < 0.1
      ? 'Stalled (cold/toxic)'
      : decompserActivity < 0.5
        ? 'Slow'
        : 'Active';

  return {
    corpseBiomass,
    decompserActivity,
    decompserLabel,
    estimatedCycleTime,
  };
}
