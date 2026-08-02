import type { EngineState } from './engine';
import type { SimEvent, SimEventType } from './events';
import {
  deserializeEngineState,
  createPersistedEngineState,
  ENGINE_SAVE_VERSION,
  type PersistedEngineState,
} from './enginePersistence';
import { worldNameFromSeed } from '../ui/worldName';

export const DIAGNOSTIC_BUNDLE_VERSION = 1;
export const DIAGNOSTIC_RECENT_EVENT_LIMIT = 100;
export const DIAGNOSTIC_UPLOAD_LIMIT_BYTES = 8 * 1024 * 1024;
export const ORIGINS_APP_VERSION = '0.1.0';

export interface DiagnosticSummary {
  livingCreatures: number;
  corpses: number;
  livingSpecies: number;
  producerBiomass: number;
  eventCounts: Record<SimEventType, number>;
}

export interface OriginsDiagnosticBundle {
  kind: 'origins-diagnostic';
  version: number;
  generatedAt: string;
  application: {
    name: 'Project Origins';
    version: string;
  };
  world: {
    name: string;
    seed: number;
    tick: number;
    engineSaveVersion: number;
  };
  summary: DiagnosticSummary;
  interventions: SimEvent[];
  recentEvents: SimEvent[];
  engineSave: PersistedEngineState;
}

export interface DiagnosticBundleOptions {
  generatedAt?: string;
  appVersion?: string;
}

function eventCounts(events: SimEvent[]): Record<SimEventType, number> {
  const counts: Record<SimEventType, number> = {
    birth: 0,
    death: 0,
    mutation: 0,
    speciation: 0,
    extinction: 0,
    intervention: 0,
  };
  for (const event of events) counts[event.type] += 1;
  return counts;
}

function diagnosticSummary(state: EngineState): DiagnosticSummary {
  const living = state.creatures.filter(
    (creature) => creature.lifecycleState === 'alive',
  );
  let producerBiomass = 0;
  for (let y = 0; y < state.world.height; y += 1) {
    for (let x = 0; x < state.world.width; x += 1) {
      producerBiomass += state.world.getCell(x, y).producerBiomass;
    }
  }
  return {
    livingCreatures: living.length,
    corpses: state.creatures.length - living.length,
    livingSpecies: new Set(living.map((creature) => creature.speciesId)).size,
    producerBiomass,
    eventCounts: eventCounts(state.events),
  };
}

/** Build a privacy-bounded report containing everything needed for exact replay. */
export function createDiagnosticBundle(
  state: EngineState,
  options: DiagnosticBundleOptions = {},
): OriginsDiagnosticBundle {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(generatedAt))) {
    throw new Error('Diagnostic timestamp must be a valid ISO date');
  }
  const appVersion = options.appVersion?.trim() || ORIGINS_APP_VERSION;
  const engineSave = createPersistedEngineState(state);
  const savedEvents = engineSave.state.events;

  return {
    kind: 'origins-diagnostic',
    version: DIAGNOSTIC_BUNDLE_VERSION,
    generatedAt,
    application: {
      name: 'Project Origins',
      version: appVersion,
    },
    world: {
      name: worldNameFromSeed(state.seed),
      seed: state.seed,
      tick: state.tick,
      engineSaveVersion: ENGINE_SAVE_VERSION,
    },
    summary: diagnosticSummary(state),
    interventions: savedEvents.filter(
      (event) => event.type === 'intervention',
    ),
    recentEvents: savedEvents.slice(-DIAGNOSTIC_RECENT_EVENT_LIMIT),
    engineSave,
  };
}

export function serializeDiagnosticBundle(
  bundle: OriginsDiagnosticBundle,
): string {
  return JSON.stringify(bundle);
}

export function diagnosticBundleByteSize(serializedBundle: string): number {
  return new TextEncoder().encode(serializedBundle).byteLength;
}

export function diagnosticBundleFileName(bundle: OriginsDiagnosticBundle): string {
  const worldSlug = bundle.world.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${worldSlug}-tick-${bundle.world.tick}.origins-diagnostic.json`;
}

export function parseDiagnosticBundle(value: string): OriginsDiagnosticBundle {
  let bundle: OriginsDiagnosticBundle;
  try {
    bundle = JSON.parse(value) as OriginsDiagnosticBundle;
  } catch {
    throw new Error('Diagnostic bundle is not valid JSON');
  }
  if (
    !bundle ||
    bundle.kind !== 'origins-diagnostic' ||
    bundle.version !== DIAGNOSTIC_BUNDLE_VERSION ||
    !bundle.engineSave
  ) {
    throw new Error('Diagnostic bundle uses an unsupported version');
  }
  deserializeEngineState(JSON.stringify(bundle.engineSave));
  return bundle;
}

/** Restore the exact engine state captured by a diagnostic report. */
export function restoreEngineFromDiagnosticBundle(value: string): EngineState {
  const bundle = parseDiagnosticBundle(value);
  return deserializeEngineState(JSON.stringify(bundle.engineSave));
}
