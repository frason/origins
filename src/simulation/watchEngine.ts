/**
 * Watch Engine: Evaluates ecosystem watches and generates alerts
 *
 * Provides deterministic watch evaluation against world state without
 * modifying simulation state. Implements rate-limiting to prevent alert storms.
 */

import type { EngineState } from './engine';
import type { WorldSnapshot, CreatureSnapshot } from '../state/store';
import type {
  EcosystemWatch,
  EcosystemAlert,
  AlertSeverity,
  WatchType,
} from './watches';
import {
  generateAlertId,
  getSeverityForWatchType,
  formatWatchUnit,
} from './watches';
import type { Traits } from '../utils/traits';
import { speciesDisplayName } from './speciesNames';

// Helper to safely get species name from the speciesProfiles map
function getSpeciesName(speciesId: string | undefined, speciesProfiles: Map<string, { name: string }>): string | undefined {
  if (!speciesId) return undefined;
  const entry = speciesProfiles.get(speciesId);
  return entry?.name || speciesDisplayName(speciesId);
}

/**
 * Metrics snapshot for evaluating a specific watch
 */
interface WatchMetrics {
  speciesId?: string;
  speciesName?: string;
  currentValue: number;
  previousValue?: number;
  timestamp: number;
}

/**
 * Evaluate a single watch against current engine state
 * Returns an alert if threshold is exceeded, or null if no alert needed
 */
export function evaluateWatch(
  watch: EcosystemWatch,
  engineState: EngineState,
  speciesProfiles: Map<string, { name: string }>
): EcosystemAlert | null {
  if (!watch.enabled) return null;

  const currentTick = engineState.tick;

  // Rate limiting: skip if too soon since last alert
  if (
    watch.lastAlertTick !== undefined &&
    currentTick - watch.lastAlertTick < watch.minTicksBetweenAlerts
  ) {
    return null;
  }

  const metrics = getWatchMetrics(watch, engineState, speciesProfiles);
  if (!metrics) return null;

  // Check if threshold is exceeded
  const shouldAlert = checkThreshold(watch, metrics);
  if (!shouldAlert) return null;

  // Generate alert
  const alert = createAlert(watch, metrics, engineState.tick, speciesProfiles);
  return alert;
}

/**
 * Evaluate all watches and return new alerts
 */
export function evaluateAllWatches(
  watches: EcosystemWatch[],
  engineState: EngineState,
  speciesProfiles: Map<string, { name: string }>
): EcosystemAlert[] {
  const alerts: EcosystemAlert[] = [];

  for (const watch of watches) {
    const alert = evaluateWatch(watch, engineState, speciesProfiles);
    if (alert) {
      alerts.push(alert);
    }
  }

  return alerts;
}

/**
 * Extract metrics for a specific watch type
 */
function getWatchMetrics(
  watch: EcosystemWatch,
  engineState: EngineState,
  speciesProfiles: Map<string, { name: string }>
): WatchMetrics | null {
  switch (watch.type) {
    case 'species-population':
      return getSpeciesPopulationMetrics(watch, engineState, speciesProfiles);
    case 'species-energy':
      return getSpeciesEnergyMetrics(watch, engineState, speciesProfiles);
    case 'species-biomass':
      return getSpeciesBiomassMetrics(watch, engineState, speciesProfiles);
    case 'trait-frequency':
      return getTraitFrequencyMetrics(watch, engineState, speciesProfiles);
    case 'extinction-risk':
      return getExtinctionRiskMetrics(watch, engineState, speciesProfiles);
    case 'regional-pressure':
      return getRegionalPressureMetrics(watch, engineState, speciesProfiles);
    case 'energy-depletion':
      return getEnergyDepletionMetrics(watch, engineState, speciesProfiles);
    case 'biomass-collapse':
      return getBiomassCollapseMetrics(watch, engineState, speciesProfiles);
    default:
      return null;
  }
}

/**
 * Species population: count of living creatures
 */
function getSpeciesPopulationMetrics(
  watch: EcosystemWatch,
  engineState: EngineState,
  speciesProfiles: Map<string, { name: string }>
): WatchMetrics | null {
  if (!watch.speciesId) return null;

  const population = engineState.creatures.filter(
    (c) => c.speciesId === watch.speciesId && c.lifecycleState === 'alive'
  ).length;

  return {
    speciesId: watch.speciesId,
    speciesName: getSpeciesName(watch.speciesId, speciesProfiles),
    currentValue: population,
    previousValue: watch.lastAlertValue,
    timestamp: engineState.tick,
  };
}

/**
 * Species energy: total energy of all creatures in species
 */
function getSpeciesEnergyMetrics(
  watch: EcosystemWatch,
  engineState: EngineState,
  speciesProfiles: Map<string, { name: string }>
): WatchMetrics | null {
  if (!watch.speciesId) return null;

  const totalEnergy = engineState.creatures
    .filter((c) => c.speciesId === watch.speciesId && c.lifecycleState === 'alive')
    .reduce((sum, c) => sum + c.energy, 0);

  return {
    speciesId: watch.speciesId,
    speciesName: getSpeciesName(watch.speciesId, speciesProfiles),
    currentValue: totalEnergy,
    previousValue: watch.lastAlertValue,
    timestamp: engineState.tick,
  };
}

/**
 * Species biomass: estimated biomass from population and size traits
 */
function getSpeciesBiomassMetrics(
  watch: EcosystemWatch,
  engineState: EngineState,
  speciesProfiles: Map<string, { name: string }>
): WatchMetrics | null {
  if (!watch.speciesId) return null;

  const creatures = engineState.creatures.filter(
    (c) => c.speciesId === watch.speciesId && c.lifecycleState === 'alive'
  );

  const totalBiomass = creatures.reduce((sum, c) => {
    const sizeContribution = c.traits.size || 1;
    return sum + (sizeContribution * c.energy);
  }, 0);

  return {
    speciesId: watch.speciesId,
    speciesName: getSpeciesName(watch.speciesId, speciesProfiles),
    currentValue: totalBiomass,
    previousValue: watch.lastAlertValue,
    timestamp: engineState.tick,
  };
}

/**
 * Trait frequency: percentage of species with a specific trait value
 */
function getTraitFrequencyMetrics(
  watch: EcosystemWatch,
  engineState: EngineState,
  speciesProfiles: Map<string, { name: string }>
): WatchMetrics | null {
  if (!watch.speciesId || !watch.trait) return null;

  const creatures = engineState.creatures.filter(
    (c) => c.speciesId === watch.speciesId && c.lifecycleState === 'alive'
  );

  if (creatures.length === 0) {
    return {
      speciesId: watch.speciesId,
      currentValue: 0,
      previousValue: watch.lastAlertValue,
      timestamp: engineState.tick,
    };
  }

  // Get average value of the trait
  const traitValues = creatures
    .map((c) => {
      const val = c.traits[watch.trait as keyof Traits];
      return typeof val === 'number' ? val : 0;
    })
    .filter((v) => v !== undefined);

  const avgTraitValue = traitValues.length > 0
    ? traitValues.reduce((a, b) => a + b) / traitValues.length
    : 0;

  return {
    speciesId: watch.speciesId,
    speciesName: getSpeciesName(watch.speciesId, speciesProfiles),
    currentValue: avgTraitValue,
    previousValue: watch.lastAlertValue,
    timestamp: engineState.tick,
  };
}

/**
 * Extinction risk: likelihood species will go extinct soon
 * Based on population size and recent trend
 */
function getExtinctionRiskMetrics(
  watch: EcosystemWatch,
  engineState: EngineState,
  speciesProfiles: Map<string, { name: string }>
): WatchMetrics | null {
  if (!watch.speciesId) return null;

  const population = engineState.creatures.filter(
    (c) => c.speciesId === watch.speciesId && c.lifecycleState === 'alive'
  ).length;

  // Risk score: 0-100 where 100 is certain extinction
  let riskScore = 0;

  if (population === 0) {
    riskScore = 100; // Already extinct
  } else if (population <= 5) {
    riskScore = 80; // Critical
  } else if (population <= 20) {
    riskScore = 50; // High risk
  } else if (population <= 100) {
    riskScore = 25; // Moderate risk
  } else {
    riskScore = 5; // Low risk
  }

  return {
    speciesId: watch.speciesId,
    speciesName: getSpeciesName(watch.speciesId, speciesProfiles),
    currentValue: riskScore,
    previousValue: watch.lastAlertValue,
    timestamp: engineState.tick,
  };
}

/**
 * Regional pressure: aggregate energy availability in a region
 */
function getRegionalPressureMetrics(
  watch: EcosystemWatch,
  engineState: EngineState,
  speciesProfiles: Map<string, { name: string }>
): WatchMetrics | null {
  if (watch.x === undefined || watch.y === undefined || !watch.regionRadius) {
    return null;
  }

  const radius = watch.regionRadius;
  let totalEnergy = 0;
  let cellCount = 0;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = watch.x + dx;
      const y = watch.y + dy;
      if (x >= 0 && x < engineState.world.width && y >= 0 && y < engineState.world.height) {
        const cell = engineState.world.getCell(x, y);
        totalEnergy += cell.energy;
        cellCount++;
      }
    }
  }

  const avgPressure = cellCount > 0 ? totalEnergy / cellCount : 0;

  return {
    currentValue: avgPressure,
    previousValue: watch.lastAlertValue,
    timestamp: engineState.tick,
  };
}

/**
 * Global energy depletion: total energy across all cells
 */
function getEnergyDepletionMetrics(
  watch: EcosystemWatch,
  engineState: EngineState,
  speciesProfiles: Map<string, { name: string }>
): WatchMetrics | null {
  let totalEnergy = 0;
  for (let y = 0; y < engineState.world.height; y++) {
    for (let x = 0; x < engineState.world.width; x++) {
      const cell = engineState.world.getCell(x, y);
      totalEnergy += cell.energy;
    }
  }

  return {
    currentValue: totalEnergy,
    previousValue: watch.lastAlertValue,
    timestamp: engineState.tick,
  };
}

/**
 * Biomass collapse: total producer biomass across all cells
 */
function getBiomassCollapseMetrics(
  watch: EcosystemWatch,
  engineState: EngineState,
  speciesProfiles: Map<string, { name: string }>
): WatchMetrics | null {
  let totalBiomass = 0;
  for (let y = 0; y < engineState.world.height; y++) {
    for (let x = 0; x < engineState.world.width; x++) {
      const cell = engineState.world.getCell(x, y);
      totalBiomass += cell.producerBiomass;
    }
  }

  return {
    currentValue: totalBiomass,
    previousValue: watch.lastAlertValue,
    timestamp: engineState.tick,
  };
}

/**
 * Check if a metric exceeds the watch threshold
 */
function checkThreshold(watch: EcosystemWatch, metrics: WatchMetrics): boolean {
  const value = metrics.currentValue;

  if (watch.thresholdType === 'below') {
    return value < watch.thresholdValue;
  } else if (watch.thresholdType === 'above') {
    return value > watch.thresholdValue;
  } else if (watch.thresholdType === 'change-by') {
    if (metrics.previousValue === undefined) return false;
    const percentChange = ((value - metrics.previousValue) / metrics.previousValue) * 100;
    return Math.abs(percentChange) >= watch.thresholdValue;
  }

  return false;
}

/**
 * Create an alert from watch and metrics
 */
function createAlert(
  watch: EcosystemWatch,
  metrics: WatchMetrics,
  tick: number,
  speciesProfiles: Map<string, { name: string }>
): EcosystemAlert {
  const unit = formatWatchUnit(watch.type);
  const isExtreme = isExtremeThreshold(watch, metrics);
  const severity = getSeverityForWatchType(watch.type, isExtreme);
  const cause = generateCauseDescription(watch, metrics);

  return {
    id: generateAlertId(),
    watchId: watch.id,
    tick,
    severity,
    type: watch.type,
    speciesId: watch.speciesId,
    speciesName: metrics.speciesName,
    x: watch.x,
    y: watch.y,
    trait: watch.trait,
    cause,
    evidence: {
      currentValue: Math.round(metrics.currentValue * 100) / 100,
      previousValue:
        metrics.previousValue !== undefined
          ? Math.round(metrics.previousValue * 100) / 100
          : undefined,
      threshold: watch.thresholdValue,
      unit,
    },
    actions: ['focus', 'pause', 'compare', 'dismiss'],
    dismissed: false,
  };
}

/**
 * Generate human-readable description of why alert fired
 */
function generateCauseDescription(watch: EcosystemWatch, metrics: WatchMetrics): string {
  const subject = metrics.speciesName || watch.speciesId || 'region';
  const unit = formatWatchUnit(watch.type);

  if (watch.thresholdType === 'below') {
    return `${subject} ${watch.type} fell below ${watch.thresholdValue} ${unit}`;
  } else if (watch.thresholdType === 'above') {
    return `${subject} ${watch.type} exceeded ${watch.thresholdValue} ${unit}`;
  } else {
    const change = metrics.previousValue
      ? (((metrics.currentValue - metrics.previousValue) / metrics.previousValue) * 100).toFixed(1)
      : 'unknown';
    return `${subject} ${watch.type} changed by ${change}%`;
  }
}

/**
 * Determine if a threshold crossing is "extreme" (warrants higher severity)
 */
function isExtremeThreshold(watch: EcosystemWatch, metrics: WatchMetrics): boolean {
  const ratio = metrics.currentValue / (watch.thresholdValue || 1);

  if (watch.thresholdType === 'below') {
    return ratio < 0.5; // Less than half the threshold
  } else if (watch.thresholdType === 'above') {
    return ratio > 2; // More than double the threshold
  } else if (watch.thresholdType === 'change-by') {
    return Math.abs((metrics.currentValue - (metrics.previousValue || 0)) / (metrics.previousValue || 1)) > 0.5;
  }

  return false;
}

/**
 * Update watch state after alert generation (for rate limiting)
 */
export function updateWatchAfterAlert(
  watch: EcosystemWatch,
  alert: EcosystemAlert
): EcosystemWatch {
  return {
    ...watch,
    lastAlertTick: alert.tick,
    lastAlertValue: alert.evidence.currentValue,
  };
}
