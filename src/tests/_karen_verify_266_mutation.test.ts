import { describe, it, expect } from 'vitest';
import { mutateTraits } from '../simulation/species';
import { DEFAULT_TRAITS } from '../utils/traits';
import { createRng } from '../simulation/rng';

describe('karen verify #266 mutation wiring', () => {
  it('aquaticAdaptation should be able to mutate via mutateTraits over many forced trials', () => {
    let changed = false;
    const rng = createRng(1234);
    let traits = { ...DEFAULT_TRAITS, aquaticAdaptation: 0.3 };
    for (let i = 0; i < 5000; i++) {
      const m = mutateTraits(traits, rng, 0.1, 1.0); // mutationRate=1.0 forces a mutation every call
      if (m.aquaticAdaptation !== traits.aquaticAdaptation) changed = true;
      traits = m;
    }
    // eslint-disable-next-line no-console
    console.log('KAREN_RESULT changed=', changed, 'final=', traits.aquaticAdaptation);
    expect(changed).toBe(true);
  });
});
