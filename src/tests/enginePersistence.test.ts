import { describe, expect, it } from 'vitest';
import { buildDemoEngine } from '../simulation/demoWorld';
import { deserializeEngineState, serializeEngineState } from '../simulation/enginePersistence';
import { tickEngine } from '../simulation/engine';
import { SIMULATION_CONSTANTS } from '../utils/constants';

describe('versioned engine persistence', () => {
  it('restores an exact world that continues deterministically', () => {
    let source = buildDemoEngine(12345, { ...SIMULATION_CONSTANTS });
    for (let tick = 0; tick < 30; tick++) source = tickEngine(source);
    const restored = deserializeEngineState(serializeEngineState(source));
    expect(JSON.stringify(restored)).toBe(JSON.stringify(source));
    expect(tickEngine(restored)).toEqual(tickEngine(source));
  });

  it('rejects corrupt and unsupported saves with recoverable errors', () => {
    expect(() => deserializeEngineState('not json')).toThrow('valid JSON');
    expect(() => deserializeEngineState(JSON.stringify({ version: 99, state: {} })))
      .toThrow('unsupported version');
  });
});
