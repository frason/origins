import { describe, expect, it } from 'vitest';
import { getAdaptiveReproductionTiming } from '../simulation/adaptiveReproduction';
import type { SimEvent } from '../simulation/events';
import { SIMULATION_CONSTANTS } from '../utils/constants';

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
});
