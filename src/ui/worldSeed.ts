export const DEFAULT_WORLD_SEED = 12345;
export const MIN_WORLD_SEED = 0;
export const MAX_WORLD_SEED = 2147483647;

export interface WorldSeedResult {
  seed: number | null;
  message: string | null;
}

/** Convert player input to the stable integer range supported by the seeded RNG. */
export function parseWorldSeed(raw: string): WorldSeedResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { seed: null, message: 'Enter a whole-number seed' };
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return { seed: null, message: 'Enter a valid number' };

  const integer = Math.trunc(numeric);
  const seed = Math.max(MIN_WORLD_SEED, Math.min(MAX_WORLD_SEED, integer));
  if (seed !== numeric) {
    return {
      seed,
      message: `Seed adjusted to ${seed.toLocaleString()} (whole numbers from ${MIN_WORLD_SEED} to ${MAX_WORLD_SEED.toLocaleString()})`,
    };
  }
  return { seed, message: null };
}
