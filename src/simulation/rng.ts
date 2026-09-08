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
 * Stream usage record for diagnostics.
 */
export interface StreamUsage {
  streamName: string;
  version: number;
  callCount: number;
  callSite?: string;
}

/**
 * Named RNG stream: includes the stream name for diagnostics.
 */
export interface NamedRng {
  fn: RngFn;
  streamName: string;
  version: number;
  /** Optional: diagnostic information about stream usage */
  getUsageInfo?: () => StreamUsage;
}

/**
 * Stream names for simulation subsystems.
 * Each stream gets an independent RNG, preventing unrelated implementation
 * changes from perturbing all downstream random values.
 */
export const RNG_STREAMS = {
  WORLD_GENERATION: 'world-generation',
  MOVEMENT: 'movement',
  FEEDING: 'feeding',
  MUTATION: 'mutation',
  EVENTS: 'events',
  SOUND: 'sound',
  DISPERSAL: 'dispersal',
  BIODIVERSITY_PRESSURE: 'biodiversity-pressure',
  ENVIRONMENTAL_STRESS: 'environmental-stress',
  CALIBRATION: 'calibration',
} as const;

/**
 * Current version of stream derivation.
 * Increment when changing how streams are derived (for replay compatibility).
 */
export const RNG_STREAM_VERSION = 1;

/**
 * Simple hash function to combine values into a 32-bit seed.
 */
function hashCombine(a: number, b: number | string): number {
  let h = a >>> 0;
  const s = typeof b === 'string' ? b : String(b);
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

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

/**
 * Manages named RNG streams for deterministic simulation.
 * Provides independent random streams for different subsystems, preventing
 * unrelated implementation changes from affecting unrelated subsystems.
 */
export class StreamedRng {
  private baseSeed: number;
  private tick: number;
  private version: number;
  private streamSeeds: Map<string, number> = new Map();
  private callCounts: Map<string, number> = new Map();

  /**
   * Creates a StreamedRng instance.
   * @param baseSeed - Base seed for determinism
   * @param tick - Current simulation tick (used for stream derivation)
   * @param version - Version of stream derivation (for replay compatibility)
   */
  constructor(baseSeed: number, tick: number, version: number = RNG_STREAM_VERSION) {
    this.baseSeed = baseSeed >>> 0;
    this.tick = tick;
    this.version = version;
  }

  /**
   * Gets or creates a named stream.
   * Same (streamName, tick, version) always produces same sequence.
   * Each call returns a fresh generator seeded identically for reproducibility.
   */
  getStream(streamName: string): NamedRng {
    const key = `${streamName}@v${this.version}`;

    // Derive or retrieve the cached seed for this stream
    if (!this.streamSeeds.has(key)) {
      let seed = this.baseSeed;
      seed = hashCombine(seed, streamName);
      seed = hashCombine(seed, this.tick);
      seed = hashCombine(seed, this.version);
      this.streamSeeds.set(key, seed);
      this.callCounts.set(key, 0);
    }

    const seed = this.streamSeeds.get(key)!;
    const fn = createRng(seed);

    return {
      fn: () => {
        const callCountKey = key;
        this.callCounts.set(callCountKey, (this.callCounts.get(callCountKey) ?? 0) + 1);
        return fn();
      },
      streamName,
      version: this.version,
      getUsageInfo: () => ({
        streamName,
        version: this.version,
        callCount: this.callCounts.get(key) ?? 0,
      }),
    };
  }

  /**
   * Gets or creates an entity-level stream.
   * Ensures stable randomness for a specific entity across refactors.
   * Each call returns a fresh generator seeded identically for reproducibility.
   */
  getEntityStream(streamName: string, entityId: string): NamedRng {
    const key = `${streamName}:${entityId}@v${this.version}`;

    // Derive or retrieve the cached seed for this entity stream
    if (!this.streamSeeds.has(key)) {
      let seed = this.baseSeed;
      seed = hashCombine(seed, streamName);
      seed = hashCombine(seed, entityId);
      seed = hashCombine(seed, this.tick);
      seed = hashCombine(seed, this.version);
      this.streamSeeds.set(key, seed);
      this.callCounts.set(key, 0);
    }

    const seed = this.streamSeeds.get(key)!;
    const fn = createRng(seed);

    return {
      fn: () => {
        const callCountKey = key;
        this.callCounts.set(callCountKey, (this.callCounts.get(callCountKey) ?? 0) + 1);
        return fn();
      },
      streamName,
      version: this.version,
      getUsageInfo: () => ({
        streamName,
        version: this.version,
        callCount: this.callCounts.get(key) ?? 0,
      }),
    };
  }

  /**
   * Returns the tick this StreamedRng was created for.
   */
  getTick(): number {
    return this.tick;
  }

  /**
   * Returns the version of this StreamedRng.
   */
  getVersion(): number {
    return this.version;
  }

  /**
   * Returns the base seed.
   */
  getBaseSeed(): number {
    return this.baseSeed;
  }
}
