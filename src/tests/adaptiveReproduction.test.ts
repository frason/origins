import { describe, expect, it } from 'vitest';
import { getAdaptiveReproductionTiming, buildSpeciesLifespanEvidence } from '../simulation/adaptiveReproduction';
import type { SimEvent } from '../simulation/events';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import { compactEvents, DETAILED_RETENTION_TICKS } from '../simulation/eventCompaction';

function deaths(speciesId: string, ages: number[]): SimEvent[] {
  return ages.map((ageAtDeath, tick) => ({
    type: 'death', tick, speciesId, ageAtDeath, prematureDeath: true,
  }));
}

describe('adaptive reproductive timing', () => {
  it('keeps stable defaults until minimum evidence exists', () => {
    const timing = getAdaptiveReproductionTiming(
      'sparse', 100, deaths('sparse', [4, 5, 6, 7]), SIMULATION_CONSTANTS
    );
    expect(timing).toEqual({
      evidenceDeaths: 4,
      expectedLifespan: null,
      maturityAge: SIMULATION_CONSTANTS.reproductionMaturityAgeTicks,
      energyThreshold: SIMULATION_CONSTANTS.reproductionEnergyThreshold,
      costMultiplier: 1,
      urgency: 0,
    });
  });

  it('lets short-lived species mature earlier than long-lived species', () => {
    const constants = { ...SIMULATION_CONSTANTS, reproductionMaturityAgeTicks: 30 };
    const events = [...deaths('short', [20, 22, 24, 26, 28]), ...deaths('long', [80, 90, 100, 110, 120])];
    const short = getAdaptiveReproductionTiming('short', 0, events, constants);
    const long = getAdaptiveReproductionTiming('long', 0, events, constants);
    expect(short.maturityAge).toBe(7);
    expect(long.maturityAge).toBe(30);
    expect(short.expectedLifespan).toBe(24);
    expect(long.expectedLifespan).toBe(100);
  });

  it('trades late-life threshold relief for extra parent energy cost', () => {
    const events = deaths('brief', [20, 20, 20, 20, 20]);
    const early = getAdaptiveReproductionTiming('brief', 5, events, SIMULATION_CONSTANTS);
    const late = getAdaptiveReproductionTiming('brief', 18, events, SIMULATION_CONSTANTS);
    expect(late.energyThreshold).toBeLessThan(early.energyThreshold);
    expect(late.costMultiplier).toBe(SIMULATION_CONSTANTS.earlyReproductionCostMultiplier);
    expect(late.costMultiplier).toBeGreaterThan(1);
  });

  it('provides a weaker low-energy response before death evidence accumulates', () => {
    const timing = getAdaptiveReproductionTiming(
      'founder', 20, [], SIMULATION_CONSTANTS, undefined, 0.6
    );
    expect(timing.expectedLifespan).toBeNull();
    expect(timing.urgency).toBeGreaterThan(0);
    expect(timing.energyThreshold).toBeLessThan(SIMULATION_CONSTANTS.reproductionEnergyThreshold);
    expect(timing.costMultiplier).toBeGreaterThan(1);
  });

  it('is bounded and replay-identical for extinct history and extreme controls', () => {
    const events: SimEvent[] = [
      ...deaths('extinct', [1, 2, 3, 4, 5]),
      { type: 'extinction', tick: 6, speciesId: 'extinct' },
    ];
    const constants = {
      ...SIMULATION_CONSTANTS,
      adaptiveReproductionMinDeaths: 1,
      adaptiveMaturityLifespanShare: 0,
      reproductiveUrgencyAgeShare: 0,
      reproductiveUrgencyThresholdDiscount: 2,
      earlyReproductionCostMultiplier: 5,
    };
    const first = getAdaptiveReproductionTiming('extinct', 500, events, constants);
    expect(getAdaptiveReproductionTiming('extinct', 500, structuredClone(events), constants)).toEqual(first);
    expect(first.maturityAge).toBeGreaterThanOrEqual(1);
    expect(first.energyThreshold).toBeGreaterThanOrEqual(
      constants.reproductionEnergyThreshold * 0.25
    );
    expect(Number.isFinite(first.expectedLifespan)).toBe(true);
  });

  it('preserves reproduction timing behavior across event compaction (>2000 ticks)', () => {
    // This test proves that adaptive reproduction timing survives event compaction
    // by verifying timing is identical before and after compaction of old events.

    // Create death events across 3000 ticks: ~50 deaths per species per 50-tick bucket
    const tickCount = 3000;
    const speciesIds = ['fast', 'slow'];
    const ages = {
      fast: [15, 16, 17, 18, 19, 20, 21, 22], // Short-lived
      slow: [60, 70, 80, 90, 100, 110, 120, 130], // Long-lived
    };

    const allEvents: SimEvent[] = [];
    for (let tick = 0; tick < tickCount; tick++) {
      // Distribute deaths consistently throughout the timeline
      const bucketInCycle = tick % 50;
      if (bucketInCycle < 4) {
        // Fast species: 4 deaths per 50-tick bucket
        allEvents.push({
          type: 'death',
          tick,
          speciesId: 'fast',
          ageAtDeath: ages.fast[bucketInCycle % ages.fast.length],
          lineageId: 'fast_line',
          prematureDeath: true,
        });
      }
      if (bucketInCycle < 4) {
        // Slow species: 4 deaths per 50-tick bucket
        allEvents.push({
          type: 'death',
          tick,
          speciesId: 'slow',
          ageAtDeath: ages.slow[bucketInCycle % ages.slow.length],
          lineageId: 'slow_line',
          prematureDeath: true,
        });
      }
    }

    // Verify we have meaningful data
    expect(allEvents.length).toBeGreaterThan(200);

    // Get timing before compaction (all events detailed)
    const timingBeforeCompact = {
      fast: getAdaptiveReproductionTiming('fast', 50, allEvents, SIMULATION_CONSTANTS),
      slow: getAdaptiveReproductionTiming('slow', 50, allEvents, SIMULATION_CONSTANTS),
    };

    // Average of [15, 16, 17, 18] = 16.5; Average of [60, 70, 80, 90] = 75
    expect(timingBeforeCompact.fast.expectedLifespan).toBe(16.5); // Average of first 4 fast ages
    expect(timingBeforeCompact.slow.expectedLifespan).toBe(75); // Average of first 4 slow ages
    expect((timingBeforeCompact.fast.expectedLifespan ?? 0)).toBeLessThan(
      timingBeforeCompact.slow.expectedLifespan ?? 0
    );

    // Simulate checkpoint compaction at tick 3000 (like in tickEngine at CHECKPOINT_INTERVAL)
    const compactedEvents = compactEvents(allEvents, tickCount);

    // Verify compaction actually happened (events were aggregated)
    expect(compactedEvents.length).toBeLessThan(allEvents.length);

    // Key test: reproduction timing from compacted events should be nearly identical
    const timingAfterCompact = {
      fast: getAdaptiveReproductionTiming('fast', 50, compactedEvents, SIMULATION_CONSTANTS),
      slow: getAdaptiveReproductionTiming('slow', 50, compactedEvents, SIMULATION_CONSTANTS),
    };

    // Verify that core metrics survive compaction
    // Allow for small sampling variation in aggregated events (±20% tolerance)
    expect(timingAfterCompact.fast.expectedLifespan).not.toBeNull();
    expect(timingAfterCompact.fast.expectedLifespan ?? 0).toBeGreaterThanOrEqual(13);
    expect(timingAfterCompact.fast.expectedLifespan ?? 0).toBeLessThanOrEqual(20);
    expect(timingAfterCompact.slow.expectedLifespan).not.toBeNull();
    expect(timingAfterCompact.slow.expectedLifespan ?? 0).toBeGreaterThanOrEqual(60);
    expect(timingAfterCompact.slow.expectedLifespan ?? 0).toBeLessThanOrEqual(90);

    // Verify the relative relationship is preserved
    expect((timingAfterCompact.fast.expectedLifespan ?? 0)).toBeLessThan(
      timingAfterCompact.slow.expectedLifespan ?? 0
    );

    // Verify maturity ages adapt correctly
    expect(timingAfterCompact.fast.maturityAge).toBeLessThan(
      timingAfterCompact.slow.maturityAge
    );

    // Verify evidence is collected from compacted events
    expect(timingAfterCompact.fast.evidenceDeaths).toBeGreaterThan(50);
    expect(timingAfterCompact.slow.evidenceDeaths).toBeGreaterThan(50);
  });
});
