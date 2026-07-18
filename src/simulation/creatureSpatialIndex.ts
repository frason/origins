import type { Creature } from './creature';

const DEFAULT_BUCKET_SIZE = 8;

function bucketCoordinate(value: number, bucketSize: number): number {
  return Math.floor(value / bucketSize);
}

function bucketKey(x: number, y: number, bucketSize: number): string {
  return `${bucketCoordinate(x, bucketSize)},${bucketCoordinate(y, bucketSize)}`;
}

/**
 * Mutable per-tick index for local creature queries.
 *
 * Results always follow the original creature-array order. That ordering is part
 * of simulation behavior: it controls camouflage RNG calls and which same-tile
 * prey or corpse is selected first.
 */
export class CreatureSpatialIndex {
  private readonly buckets = new Map<string, Creature[]>();
  private readonly order = new Map<Creature, number>();

  constructor(
    creatures: Creature[],
    private readonly bucketSize = DEFAULT_BUCKET_SIZE
  ) {
    if (!Number.isInteger(bucketSize) || bucketSize <= 0) {
      throw new RangeError('Spatial bucket size must be a positive integer');
    }
    creatures.forEach((creature, index) => {
      this.order.set(creature, index);
      this.add(creature);
    });
  }

  private add(creature: Creature): void {
    const key = bucketKey(creature.x, creature.y, this.bucketSize);
    const bucket = this.buckets.get(key);
    if (bucket) bucket.push(creature);
    else this.buckets.set(key, [creature]);
  }

  /** Keep queries current when sequential movement mutates a creature position. */
  move(creature: Creature, previousX: number, previousY: number): void {
    const previousKey = bucketKey(previousX, previousY, this.bucketSize);
    const nextKey = bucketKey(creature.x, creature.y, this.bucketSize);
    if (previousKey === nextKey) return;

    const previousBucket = this.buckets.get(previousKey);
    if (previousBucket) {
      const index = previousBucket.indexOf(creature);
      if (index >= 0) previousBucket.splice(index, 1);
      if (previousBucket.length === 0) this.buckets.delete(previousKey);
    }
    this.add(creature);
  }

  /** Return possible candidates in a Chebyshev-radius square. */
  querySquare(x: number, y: number, radius: number): Creature[] {
    const boundedRadius = Math.max(0, radius);
    const minBucketX = bucketCoordinate(x - boundedRadius, this.bucketSize);
    const maxBucketX = bucketCoordinate(x + boundedRadius, this.bucketSize);
    const minBucketY = bucketCoordinate(y - boundedRadius, this.bucketSize);
    const maxBucketY = bucketCoordinate(y + boundedRadius, this.bucketSize);
    const candidates: Creature[] = [];

    for (let bucketY = minBucketY; bucketY <= maxBucketY; bucketY++) {
      for (let bucketX = minBucketX; bucketX <= maxBucketX; bucketX++) {
        const bucket = this.buckets.get(`${bucketX},${bucketY}`);
        if (bucket) candidates.push(...bucket);
      }
    }
    return candidates.sort((a, b) => this.order.get(a)! - this.order.get(b)!);
  }

  at(x: number, y: number): Creature[] {
    return this.querySquare(x, y, 0).filter(
      (creature) => creature.x === x && creature.y === y
    );
  }
}
