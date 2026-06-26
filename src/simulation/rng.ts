/**
 * Deterministic seeded PRNG using Mulberry32 algorithm.
 * Produces identical sequences for the same seed.
 * Fast, portable, and requires no external dependencies.
 */

/**
 * RNG function signature: returns a float in [0, 1)
 */
export type RngFn = () => number;

/**
 * Creates a deterministic RNG instance with the given seed.
 * Same seed produces identical sequence of values.
 *
 * @param seed - A 32-bit unsigned integer seed
 * @returns An RngFn that produces floats in [0, 1)
 */
export function createRng(seed: number): RngFn {
  let state = seed >>> 0; // Ensure 32-bit unsigned integer

  return function () {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Returns a random integer in [min, max)
 * @param rng - An RNG function
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (exclusive)
 * @returns A random integer
 */
export function randInt(rng: RngFn, min: number, max: number): number {
  return Math.floor(rng() * (max - min)) + min;
}

/**
 * Returns a random element from an array
 * @param rng - An RNG function
 * @param arr - An array to choose from
 * @returns A random element from the array
 */
export function randChoice<T>(rng: RngFn, arr: T[]): T {
  if (arr.length === 0) {
    throw new Error('randChoice: array must not be empty');
  }
  return arr[randInt(rng, 0, arr.length)];
}
