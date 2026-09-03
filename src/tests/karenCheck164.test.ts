import { describe, it, expect } from 'vitest';
import { toRenderSnapshot } from '../prototype/renderSnapshot';

describe('karen check: WorldView compatibility with store WorldSnapshot', () => {
  it('toRenderSnapshot on a flat WorldSnapshot (as used by WorldView/store) either works or throws', () => {
    const worldSnapshot = {
      width: 2,
      height: 2,
      cells: [
        { energy: 1, elevation: 0, moisture: 0, temperature: 0, producerBiomass: 0, toxicity: 0, biome: 'ocean' },
        { energy: 1, elevation: 0, moisture: 0, temperature: 0, producerBiomass: 0, toxicity: 0, biome: 'ocean' },
        { energy: 1, elevation: 0, moisture: 0, temperature: 0, producerBiomass: 0, toxicity: 0, biome: 'ocean' },
        { energy: 1, elevation: 0, moisture: 0, temperature: 0, producerBiomass: 0, toxicity: 0, biome: 'ocean' },
      ],
      creatures: [],
      events: [],
      seed: 1,
      tick: 1,
    };

    let threw = false;
    let message = '';
    try {
      // @ts-expect-error - intentionally passing a WorldSnapshot, not an EngineState
      toRenderSnapshot(worldSnapshot as any);
    } catch (e) {
      threw = true;
      message = (e as Error).message;
    }
    console.log('threw:', threw, 'message:', message);
    expect(true).toBe(true);
  });
});
