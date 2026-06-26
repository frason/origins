import { createRng, randInt, randChoice, RngFn } from '../simulation/rng';

describe('RNG - Deterministic Seeded PRNG', () => {
  describe('createRng', () => {
    it('should return a function', () => {
      const rng = createRng(12345);
      expect(typeof rng).toBe('function');
    });

    it('should produce values in [0, 1)', () => {
      const rng = createRng(12345);
      for (let i = 0; i < 1000; i++) {
        const value = rng();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    it('should produce identical sequence with same seed', () => {
      const rng1 = createRng(42);
      const rng2 = createRng(42);

      const sequence1: number[] = [];
      const sequence2: number[] = [];

      for (let i = 0; i < 1000; i++) {
        sequence1.push(rng1());
        sequence2.push(rng2());
      }

      expect(sequence1).toEqual(sequence2);
    });

    it('should produce different sequences with different seeds', () => {
      const rng1 = createRng(42);
      const rng2 = createRng(43);

      const sequence1: number[] = [];
      const sequence2: number[] = [];

      for (let i = 0; i < 100; i++) {
        sequence1.push(rng1());
        sequence2.push(rng2());
      }

      // With very high probability, at least one value should differ
      // (if all 100 values are identical, that's essentially impossible)
      expect(sequence1).not.toEqual(sequence2);
    });

    it('should work with seed 0', () => {
      const rng = createRng(0);
      for (let i = 0; i < 10; i++) {
        const value = rng();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    it('should work with large seeds', () => {
      const rng = createRng(0xffffffff);
      for (let i = 0; i < 10; i++) {
        const value = rng();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    it('should have good distribution (basic test)', () => {
      const rng = createRng(999);
      const buckets = [0, 0, 0, 0];

      for (let i = 0; i < 4000; i++) {
        const value = rng();
        const bucket = Math.floor(value * 4);
        buckets[bucket]++;
      }

      // Each bucket should have roughly 1000 values
      // Allow some variance (900-1100)
      for (const count of buckets) {
        expect(count).toBeGreaterThan(800);
        expect(count).toBeLessThan(1200);
      }
    });
  });

  describe('randInt', () => {
    it('should return integers in [min, max)', () => {
      const rng = createRng(12345);
      for (let i = 0; i < 100; i++) {
        const value = randInt(rng, 5, 15);
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(5);
        expect(value).toBeLessThan(15);
      }
    });

    it('should work with negative ranges', () => {
      const rng = createRng(54321);
      for (let i = 0; i < 100; i++) {
        const value = randInt(rng, -10, 10);
        expect(value).toBeGreaterThanOrEqual(-10);
        expect(value).toBeLessThan(10);
      }
    });

    it('should produce deterministic sequence', () => {
      const rng1 = createRng(777);
      const rng2 = createRng(777);

      const seq1 = [];
      const seq2 = [];

      for (let i = 0; i < 50; i++) {
        seq1.push(randInt(rng1, 1, 100));
        seq2.push(randInt(rng2, 1, 100));
      }

      expect(seq1).toEqual(seq2);
    });
  });

  describe('randChoice', () => {
    it('should return an element from the array', () => {
      const rng = createRng(11111);
      const arr = ['a', 'b', 'c', 'd', 'e'];

      for (let i = 0; i < 50; i++) {
        const choice = randChoice(rng, arr);
        expect(arr).toContain(choice);
      }
    });

    it('should work with various types', () => {
      const rng = createRng(22222);

      const numbers = [1, 2, 3, 4, 5];
      const choice1 = randChoice(rng, numbers);
      expect(numbers).toContain(choice1);

      const objects = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const choice2 = randChoice(rng, objects);
      expect(objects).toContain(choice2);
    });

    it('should produce deterministic sequence', () => {
      const arr = ['x', 'y', 'z', 'w'];

      const rng1 = createRng(333);
      const rng2 = createRng(333);

      const seq1 = [];
      const seq2 = [];

      for (let i = 0; i < 30; i++) {
        seq1.push(randChoice(rng1, arr));
        seq2.push(randChoice(rng2, arr));
      }

      expect(seq1).toEqual(seq2);
    });

    it('should throw on empty array', () => {
      const rng = createRng(44444);
      expect(() => randChoice(rng, [])).toThrow();
    });

    it('should work with single-element array', () => {
      const rng = createRng(55555);
      const arr = ['only'];

      for (let i = 0; i < 10; i++) {
        const choice = randChoice(rng, arr);
        expect(choice).toBe('only');
      }
    });
  });
});
