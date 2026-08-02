import { describe, expect, it } from 'vitest';
import { buildDemoEngine } from '../simulation/demoWorld';
import {
  createDiagnosticBundle,
  diagnosticBundleByteSize,
  diagnosticBundleFileName,
  DIAGNOSTIC_UPLOAD_LIMIT_BYTES,
  parseDiagnosticBundle,
  restoreEngineFromDiagnosticBundle,
  serializeDiagnosticBundle,
} from '../simulation/diagnosticBundle';
import { tickEngine } from '../simulation/engine';
import { SIMULATION_CONSTANTS } from '../utils/constants';

function advancedWorld(ticks = 12) {
  let state = buildDemoEngine(12345, { ...SIMULATION_CONSTANTS });
  for (let tick = 0; tick < ticks; tick += 1) state = tickEngine(state);
  return state;
}

describe('diagnostic bundles', () => {
  it('captures explicit reproduction context without browser identity data', () => {
    const state = advancedWorld();
    const bundle = createDiagnosticBundle(state, {
      generatedAt: '2026-08-01T12:00:00.000Z',
      appVersion: 'test-build',
    });

    expect(bundle.kind).toBe('origins-diagnostic');
    expect(bundle.world).toMatchObject({ seed: 12345, tick: 12 });
    expect(bundle.application.version).toBe('test-build');
    expect(bundle.engineSave.state.constants).toEqual(state.constants);
    expect(bundle.recentEvents).toEqual(state.events.slice(-100));
    expect(bundle.interventions.every((event) => event.type === 'intervention')).toBe(true);

    const serialized = serializeDiagnosticBundle(bundle);
    expect(serialized).not.toMatch(/userAgent|localStorage|owner_id|auth\.uid/i);
    expect(diagnosticBundleByteSize(serialized)).toBeGreaterThan(0);
    expect(diagnosticBundleByteSize(serialized)).toBeLessThanOrEqual(
      DIAGNOSTIC_UPLOAD_LIMIT_BYTES,
    );
    expect(diagnosticBundleFileName(bundle)).toBe(
      'juniperhaven-tick-12.origins-diagnostic.json',
    );
  });

  it('restores the exact captured state and continues deterministically', () => {
    const state = advancedWorld(20);
    const serialized = serializeDiagnosticBundle(
      createDiagnosticBundle(state, {
        generatedAt: '2026-08-01T12:00:00.000Z',
      }),
    );
    const restored = restoreEngineFromDiagnosticBundle(serialized);

    expect(JSON.stringify(restored)).toBe(JSON.stringify(state));
    expect(tickEngine(restored)).toEqual(tickEngine(state));
  });

  it('serializes identically when simulation state and metadata match', () => {
    const state = advancedWorld(4);
    const options = { generatedAt: '2026-08-01T12:00:00.000Z' };

    expect(serializeDiagnosticBundle(createDiagnosticBundle(state, options))).toBe(
      serializeDiagnosticBundle(createDiagnosticBundle(state, options)),
    );
  });

  it('keeps a representative tick-100 report inside the beta upload bound', () => {
    const state = advancedWorld(100);
    const serialized = serializeDiagnosticBundle(
      createDiagnosticBundle(state, {
        generatedAt: '2026-08-01T12:00:00.000Z',
      }),
    );

    expect(diagnosticBundleByteSize(serialized)).toBeLessThanOrEqual(
      DIAGNOSTIC_UPLOAD_LIMIT_BYTES,
    );
  });

  it('rejects corrupt, unsupported, or unreplayable reports', () => {
    expect(() => parseDiagnosticBundle('not json')).toThrow('valid JSON');
    expect(() =>
      parseDiagnosticBundle(JSON.stringify({
        kind: 'origins-diagnostic',
        version: 99,
      })),
    ).toThrow('unsupported version');
    expect(() =>
      parseDiagnosticBundle(JSON.stringify({
        kind: 'origins-diagnostic',
        version: 1,
        engineSave: { version: 99, state: {} },
      })),
    ).toThrow('unsupported version');
  });
});
