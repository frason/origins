import { describe, it, expect } from 'vitest';
import { mutateTraits } from '../simulation/species';
import { DEFAULT_TRAITS } from '../utils/traits';

describe('auditorySteal mutation check', () => {
  it('never mutates auditorySteal across many seeds (forced mutation every call)', () => {
    let changed = false;
    let s = 1;
    const rng = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return (s % 10000) / 10000;
    };
    const traits = { ...DEFAULT_TRAITS, auditorySteal: 0.3 };
    for (let i = 0; i < 5000; i++) {
      const mutated = mutateTraits(traits, rng, 0.5, 1.0); // mutationRate=1.0 forces a mutation every call
      if (mutated.auditorySteal !== 0.3) {
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
  });
});
