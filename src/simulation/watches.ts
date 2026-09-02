/**
 * Ecosystem Watches and Alerts
 *
 * Allows players to monitor specific populations, regions, traits, and thresholds,
 * receiving actionable, rate-limited alerts with explicit causes.
 *
 * Deterministic: alerts do not change simulation state, depend only on world state,
 * and persist through pause/replay when the target still exists.
 */

import type { Traits } from '../utils/traits';

/**
 * Watch types: the different phenomena a player can monitor
 */
export type WatchType =
  | 'species-population'
  | 'species-energy'
  | 'species-biomass'
  | 'trait-frequency'
  | 'extinction-risk'
  | 'regional-pressure'
  | 'energy-depletion'
  | 'biomass-collapse';

/**
 * Severity levels for alerts
 */
export type AlertSeverity = 'info' | 'warning' | 'critical';

/**
 * Actions the player can take on an alert
 */
export type AlertAction = 'focus' | 'pause' | 'compare' | 'dismiss';

/**
 * A watch definition: what should trigger an alert and under what conditions
 */
export interface EcosystemWatch {
  id: string;
  createdAtTick: number;
  name: string;
  type: WatchType;
  enabled: boolean;

  // Subject of the watch
  speciesId?: string; // For species watches
  x?: number; // For regional watches
  y?: number;
  regionRadius?: number; // Region size in tiles
  trait?: keyof Traits; // For trait-frequency watches

  // Threshold conditions
  thresholdType: 'below' | 'above' | 'change-by'; // 'change-by' watches for % change
  thresholdValue: number; // Population count, energy/biomass amount, or % change
  changeWindow?: number; // Ticks for tracking change rate

  // Alert rate limiting: prevent alert storms
  minTicksBetweenAlerts: number; // Minimum ticks between duplicate alerts
  lastAlertTick?: number;
  lastAlertValue?: number;
}

/**
 * A generated alert: a real-time notice that something the player watches has changed
 */
export interface EcosystemAlert {
  id: string;
  watchId: string;
  tick: number;
  severity: AlertSeverity;
  type: WatchType;

  // Subject
  speciesId?: string;
  speciesName?: string;
  x?: number;
  y?: number;
  trait?: keyof Traits;

  // Explicit cause: why this alert fired
  cause: string; // Human-readable explanation
  evidence: {
    // Quantitative evidence for the alert
    currentValue: number;
    previousValue?: number;
    threshold: number;
    unit: string; // 'population', 'energy', 'biomass', 'trait %', etc.
  };

  // Available actions
  actions: AlertAction[];
  dismissed: boolean;
}

/**
 * Persistent watch state for a world
 */
export interface WatchState {
  watches: EcosystemWatch[];
  activeAlerts: EcosystemAlert[];
  dismissedAlerts: Set<string>;
  lastEvaluationTick: number;
}

/**
 * Create a new watch ID
 */
export function generateWatchId(): string {
  return `watch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new alert ID
 */
export function generateAlertId(): string {
  return `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Initialize empty watch state
 */
export function createEmptyWatchState(): WatchState {
  return {
    watches: [],
    activeAlerts: [],
    dismissedAlerts: new Set(),
    lastEvaluationTick: 0,
  };
}

/**
 * Determine alert severity based on the type of watch
 */
export function getSeverityForWatchType(
  type: WatchType,
  isExtreme: boolean
): AlertSeverity {
  if (type === 'extinction-risk') return isExtreme ? 'critical' : 'warning';
  if (type === 'energy-depletion') return isExtreme ? 'critical' : 'warning';
  if (type === 'biomass-collapse') return isExtreme ? 'critical' : 'warning';
  return isExtreme ? 'warning' : 'info';
}

/**
 * Format unit label for display
 */
export function formatWatchUnit(type: WatchType): string {
  switch (type) {
    case 'species-population':
      return 'individuals';
    case 'species-energy':
      return 'units';
    case 'species-biomass':
      return 'units';
    case 'trait-frequency':
      return '%';
    case 'extinction-risk':
      return 'risk level';
    case 'regional-pressure':
      return 'pressure index';
    case 'energy-depletion':
      return 'units';
    case 'biomass-collapse':
      return 'units';
    default:
      return 'units';
  }
}

/**
 * Generate a human-readable description of a watch
 */
export function describeWatch(watch: EcosystemWatch): string {
  const thresholdOp = watch.thresholdType === 'below' ? '<' : watch.thresholdType === 'above' ? '>' : 'changes by';
  const thresholdStr =
    watch.thresholdType === 'change-by' ? `${watch.thresholdValue}%` : watch.thresholdValue.toString();

  const subject = watch.speciesId ? `species (${watch.speciesId})` : 'region';

  return `Alert when ${subject} ${watch.type} ${thresholdOp} ${thresholdStr}`;
}
