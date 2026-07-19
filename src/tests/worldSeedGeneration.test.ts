import { describe, expect, it } from 'vitest';
import {
  MAX_WORLD_SEED,
  worldSeedFromEntropy,
} from '../ui/worldSeed';

describe('fresh world seed generation', () => {
  it('maps entropy into the supported seed range', () => {
    expect(worldSeedFromEntropy(0xffffffff, 12345)).toBe(MAX_WORLD_SEED);
    expect(worldSeedFromEntropy(42, 12345)).toBe(42);
  });

  it('never returns the current seed, even when entropy repeats it', () => {
    expect(worldSeedFromEntropy(42, 42)).toBe(43);
    expect(worldSeedFromEntropy(MAX_WORLD_SEED, MAX_WORLD_SEED)).toBe(0);
  });

  it('keeps entropy conversion deterministic for testing and replay boundaries', () => {
    expect(worldSeedFromEntropy(987654321, 42)).toBe(
      worldSeedFromEntropy(987654321, 42)
    );
  });
});
