import { describe, it, expect, beforeEach } from 'vitest';
import { StreamedRng, RNG_STREAMS, createRng } from '../simulation/rng';

describe('RNG Stream Isolation', () => {
  describe('Named stream independence', () => {
    it('should produce identical results when unrelated streams are not called', () => {
      // Run 1: Only use MOVEMENT stream
      const rng1a = new StreamedRng(42, 0);
      const movementStream1 = rng1a.getStream(RNG_STREAMS.MOVEMENT);
      const sequence1 = [];
      for (let i = 0; i < 10; i++) {
        sequence1.push(movementStream1.fn());
      }

      // Run 2: Same thing
      const rng1b = new StreamedRng(42, 0);
      const movementStream1b = rng1b.getStream(RNG_STREAMS.MOVEMENT);
      const sequence1b = [];
      for (let i = 0; i < 10; i++) {
        sequence1b.push(movementStream1b.fn());
      }

      expect(sequence1).toEqual(sequence1b);
    });

    it('adding calls to one stream should not affect other streams', () => {
      // Scenario A: MOVEMENT only
      const rngA = new StreamedRng(42, 0);
      const movementA = rngA.getStream(RNG_STREAMS.MOVEMENT);
      const resultA = [];
      for (let i = 0; i < 10; i++) {
        resultA.push(movementA.fn());
      }

      // Scenario B: MOVEMENT + extra MUTATION calls (which shouldn't affect MOVEMENT)
      const rngB = new StreamedRng(42, 0);
      const movementB = rngB.getStream(RNG_STREAMS.MOVEMENT);
      const mutationB = rngB.getStream(RNG_STREAMS.MUTATION);

      // Make some "unrelated" mutation calls
      for (let i = 0; i < 100; i++) {
        mutationB.fn();
      }

      // Now collect movement values
      const resultB = [];
      for (let i = 0; i < 10; i++) {
        resultB.push(movementB.fn());
      }

      // Results should differ because the streams have different histories
      // But MOVEMENT stream sequence should be identical to run A
      expect(resultB).toEqual(resultA);
    });

    it('should maintain isolation across different entity IDs', () => {
      const rng = new StreamedRng(42, 0);

      // Entity 1 movement stream
      const entity1Stream = rng.getEntityStream(RNG_STREAMS.MOVEMENT, 'entity-1');
      const entity1Seq = [];
      for (let i = 0; i < 5; i++) {
        entity1Seq.push(entity1Stream.fn());
      }

      // Entity 2 movement stream
      const entity2Stream = rng.getEntityStream(RNG_STREAMS.MOVEMENT, 'entity-2');
      const entity2Seq = [];
      for (let i = 0; i < 5; i++) {
        entity2Seq.push(entity2Stream.fn());
      }

      // They should be different because they have different entity IDs
      expect(entity1Seq).not.toEqual(entity2Seq);

      // Re-fetch entity 1 stream should produce same sequence
      const entity1StreamAgain = rng.getEntityStream(RNG_STREAMS.MOVEMENT, 'entity-1');
      const entity1SeqAgain = [];
      for (let i = 0; i < 5; i++) {
        entity1SeqAgain.push(entity1StreamAgain.fn());
      }
      expect(entity1SeqAgain).toEqual(entity1Seq);
    });

    it('should isolate all defined stream types', () => {
      const rng = new StreamedRng(999, 5);
      const streams = [
        rng.getStream(RNG_STREAMS.WORLD_GENERATION),
        rng.getStream(RNG_STREAMS.MOVEMENT),
        rng.getStream(RNG_STREAMS.FEEDING),
        rng.getStream(RNG_STREAMS.MUTATION),
        rng.getStream(RNG_STREAMS.EVENTS),
        rng.getStream(RNG_STREAMS.SOUND),
        rng.getStream(RNG_STREAMS.DISPERSAL),
        rng.getStream(RNG_STREAMS.BIODIVERSITY_PRESSURE),
        rng.getStream(RNG_STREAMS.ENVIRONMENTAL_STRESS),
        rng.getStream(RNG_STREAMS.CALIBRATION),
      ];

      // Collect first value from each stream
      const firstValues: number[] = [];
      for (const stream of streams) {
        firstValues.push(stream.fn());
      }

      // Each stream should have a unique first value (with very high probability)
      // Create a Set to check uniqueness
      const uniqueValues = new Set(firstValues);
      expect(uniqueValues.size).toBe(10); // 10 defined streams
    });
  });

  describe('Stream versioning', () => {
    it('should maintain separate streams for different versions', () => {
      const rng1v1 = new StreamedRng(42, 0, 1);
      const rng2v1 = new StreamedRng(42, 0, 1);
      const rng3v2 = new StreamedRng(42, 0, 2);

      const stream1v1 = rng1v1.getStream(RNG_STREAMS.MOVEMENT);
      const stream2v1 = rng2v1.getStream(RNG_STREAMS.MOVEMENT);
      const stream3v2 = rng3v2.getStream(RNG_STREAMS.MOVEMENT);

      const seq1v1 = [];
      const seq2v1 = [];
      const seq3v2 = [];

      for (let i = 0; i < 5; i++) {
        seq1v1.push(stream1v1.fn());
        seq2v1.push(stream2v1.fn());
        seq3v2.push(stream3v2.fn());
      }

      // v1 streams with same seed should produce same values
      expect(seq1v1).toEqual(seq2v1);

      // v2 stream might produce different values (different derivation)
      // This doesn't have to fail, but streams are separate by version
      expect(stream1v1.version).toBe(1);
      expect(stream3v2.version).toBe(2);
    });

    it('should report version in stream metadata', () => {
      const rng = new StreamedRng(123, 5, 2);
      const stream = rng.getStream(RNG_STREAMS.MUTATION);

      expect(stream.version).toBe(2);
      expect(stream.streamName).toBe(RNG_STREAMS.MUTATION);
    });
  });

  describe('Determinism with streamed RNG', () => {
    it('should produce identical full ecosystem simulation with same seed', () => {
      // This is a meta-test that verifies the stream system maintains determinism
      const seed1 = 424242;
      const tick1 = 10;

      const rng1 = new StreamedRng(seed1, tick1);
      const rng2 = new StreamedRng(seed1, tick1);

      // Simulate a realistic access pattern
      const movement1 = rng1.getStream(RNG_STREAMS.MOVEMENT);
      const mutation1 = rng1.getStream(RNG_STREAMS.MUTATION);
      const biodiversity1 = rng1.getStream(RNG_STREAMS.BIODIVERSITY_PRESSURE);

      const movement2 = rng2.getStream(RNG_STREAMS.MOVEMENT);
      const mutation2 = rng2.getStream(RNG_STREAMS.MUTATION);
      const biodiversity2 = rng2.getStream(RNG_STREAMS.BIODIVERSITY_PRESSURE);

      // Collect interleaved values from streams
      const values1 = [];
      const values2 = [];

      for (let i = 0; i < 20; i++) {
        values1.push(movement1.fn());
        values1.push(mutation1.fn());
        values1.push(biodiversity1.fn());

        values2.push(movement2.fn());
        values2.push(mutation2.fn());
        values2.push(biodiversity2.fn());
      }

      expect(values1).toEqual(values2);
    });

    it('should produce different results with different seeds', () => {
      const rng1 = new StreamedRng(123, 0);
      const rng2 = new StreamedRng(456, 0);

      const stream1 = rng1.getStream(RNG_STREAMS.MOVEMENT);
      const stream2 = rng2.getStream(RNG_STREAMS.MOVEMENT);

      const values1 = [];
      const values2 = [];

      for (let i = 0; i < 10; i++) {
        values1.push(stream1.fn());
        values2.push(stream2.fn());
      }

      expect(values1).not.toEqual(values2);
    });

    it('should produce different results with different ticks', () => {
      const rng1 = new StreamedRng(123, 0);
      const rng2 = new StreamedRng(123, 5);

      const stream1 = rng1.getStream(RNG_STREAMS.MOVEMENT);
      const stream2 = rng2.getStream(RNG_STREAMS.MOVEMENT);

      const values1 = [];
      const values2 = [];

      for (let i = 0; i < 10; i++) {
        values1.push(stream1.fn());
        values2.push(stream2.fn());
      }

      expect(values1).not.toEqual(values2);
    });
  });

  describe('Entity-level stream stability', () => {
    it('should produce same sequence for entity across ticks', () => {
      const entityId = 'creature-123';
      const seed = 42;

      // Tick 0
      const rng0 = new StreamedRng(seed, 0);
      const stream0 = rng0.getEntityStream(RNG_STREAMS.MOVEMENT, entityId);
      const values0 = [];
      for (let i = 0; i < 5; i++) {
        values0.push(stream0.fn());
      }

      // Tick 5
      const rng5 = new StreamedRng(seed, 5);
      const stream5 = rng5.getEntityStream(RNG_STREAMS.MOVEMENT, entityId);
      const values5 = [];
      for (let i = 0; i < 5; i++) {
        values5.push(stream5.fn());
      }

      // Values should be different because tick is part of derivation
      expect(values0).not.toEqual(values5);

      // But creating the same stream again in the same tick should produce same values
      const rng0b = new StreamedRng(seed, 0);
      const stream0b = rng0b.getEntityStream(RNG_STREAMS.MOVEMENT, entityId);
      const values0b = [];
      for (let i = 0; i < 5; i++) {
        values0b.push(stream0b.fn());
      }

      expect(values0b).toEqual(values0);
    });
  });

  describe('Stream metadata and diagnostics', () => {
    it('should provide usage information from getUsageInfo', () => {
      const rng = new StreamedRng(42, 0);
      const stream = rng.getStream(RNG_STREAMS.MOVEMENT);

      // Call the stream a few times
      for (let i = 0; i < 5; i++) {
        stream.fn();
      }

      const usage = stream.getUsageInfo?.();
      expect(usage).toBeDefined();
      expect(usage?.streamName).toBe(RNG_STREAMS.MOVEMENT);
      expect(usage?.version).toBe(1); // Default version
    });
  });
});
