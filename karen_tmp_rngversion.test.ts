import { describe, it, expect } from 'vitest';
import { deserializeEngineState, serializeEngineState } from './src/simulation/enginePersistence';
import { buildDemoEngine } from './src/simulation/demoWorld';
import { SIMULATION_CONSTANTS } from './src/utils/constants';

describe('karen manual check: rngStreamVersion mismatch', () => {
  it('throws explicitly on rngStreamVersion mismatch', () => {
    const engine = buildDemoEngine(1, { ...SIMULATION_CONSTANTS });
    const serialized = serializeEngineState(engine);
    const payload = JSON.parse(serialized);
    payload.rngStreamVersion = payload.rngStreamVersion + 999;
    expect(() => deserializeEngineState(JSON.stringify(payload))).toThrow(/incompatible RNG stream version/);
  });
});
