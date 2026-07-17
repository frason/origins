import { describe, expect, it } from 'vitest';
import type { EcosystemPressure } from '../ui/ecosystemPressures';
import type {
  DynamicsTrajectory,
  EcosystemTrajectories,
} from '../ui/ecosystemTrajectory';
import {
  getGodModeRecommendations,
  recommendationPatch,
} from '../ui/godModeRecommendations';
import { SIMULATION_CONSTANTS } from '../utils/constants';
import { createEngine, tickEngine } from '../simulation/engine';

const pressure = (id: string, priority = 50): EcosystemPressure => ({
  id, priority, tone: 'warning', title: id, evidence: `${id} evidence`,
});

const trajectory = (
  label: string,
  direction: DynamicsTrajectory['direction'] = 'steady'
): DynamicsTrajectory => ({ label, direction, explanation: `${label} evidence` });

const trajectories = (exploration = trajectory('Continuing')): EcosystemTrajectories => ({
  order: trajectory('Holding'),
  chaos: trajectory('Holding'),
  exploration,
});

describe('pressure-aware God Mode recommendations', () => {
  it('offers bounded energy relief for starvation and previews exact changes', () => {
    const [recommendation] = getGodModeRecommendations(
      [pressure('cause:starvation')], trajectories(), SIMULATION_CONSTANTS
    );
    expect(recommendation).toMatchObject({
      id: 'energy-relief',
      changes: [
        { constant: 'producerGrowthRate', before: 0.1, after: 0.125 },
        { constant: 'baseMetabolism', before: 2, after: 1.6 },
      ],
    });
    expect(recommendationPatch(recommendation)).toEqual({
      producerGrowthRate: 0.125,
      baseMetabolism: 1.6,
    });
  });

  it('prioritizes overcrowding, dominance, and toxicity responses deterministically', () => {
    const recommendations = getGodModeRecommendations(
      [pressure('toxicity'), pressure('dominance'), pressure('capacity')],
      trajectories(),
      SIMULATION_CONSTANTS
    );
    expect(recommendations.map((item) => item.id)).toEqual([
      'slow-reproduction', 'counter-dominance', 'clear-toxicity',
    ]);
    expect(recommendations[0].changes).toContainEqual({
      constant: 'reproductionEnergyThreshold', label: 'Reproduction threshold',
      before: 150, after: 180,
    });
    expect(recommendations[2].changes).toEqual([
      { constant: 'corpseToxicityPerTick', label: 'Corpse toxicity', before: 1, after: 0.8 },
      { constant: 'toxicityRetention', label: 'Toxicity retention', before: 0.9, after: 0.85 },
    ]);
  });

  it('guides a collapsed world toward species introduction without changing settings', () => {
    const [recommendation] = getGodModeRecommendations(
      [pressure('collapse', 110)], trajectories(), SIMULATION_CONSTANTS
    );
    expect(recommendation).toMatchObject({
      id: 'restore-life', changes: [],
      guidance: expect.stringContaining('Introduce species'),
    });
    expect(recommendationPatch(recommendation)).toEqual({});
  });

  it('responds to quieting exploration but not intensifying chaos by itself', () => {
    expect(getGodModeRecommendations(
      [pressure('mild', 0)],
      trajectories(trajectory('Quieting', 'falling')),
      SIMULATION_CONSTANTS
    )[0]).toMatchObject({
      id: 'invite-exploration',
      changes: [{ constant: 'defaultMutationRate', before: 0.12, after: 0.14 }],
    });

    const chaosOnly: EcosystemTrajectories = {
      ...trajectories(),
      chaos: trajectory('Intensifying', 'rising'),
    };
    expect(getGodModeRecommendations(
      [pressure('mild', 0)], chaosOnly, SIMULATION_CONSTANTS
    )).toEqual([]);
  });

  it('clamps controls and omits no-op recommendations at supported limits', () => {
    const atLimits = {
      ...SIMULATION_CONSTANTS,
      producerGrowthRate: 0.5,
      baseMetabolism: 0.5,
      defaultMutationRate: 0.2,
      reproductionEnergyThreshold: 500,
      corpseToxicityPerTick: 0,
      toxicityRetention: 0,
    };
    expect(getGodModeRecommendations(
      [pressure('cause:starvation'), pressure('capacity'), pressure('toxicity')],
      trajectories(trajectory('Quieting', 'falling')),
      atLimits
    )).toEqual([]);
  });

  it('returns identical recommendations for identical measured state', () => {
    const run = () => getGodModeRecommendations(
      [pressure('low-energy'), pressure('dominance')],
      trajectories(),
      SIMULATION_CONSTANTS
    );
    expect(run()).toEqual(run());
  });

  it('flows an explicitly applied patch through recorded God Mode intervention history', () => {
    const [recommendation] = getGodModeRecommendations(
      [pressure('cause:starvation')], trajectories(), SIMULATION_CONSTANTS
    );
    const next = tickEngine(createEngine(85, []), recommendationPatch(recommendation));
    const intervention = next.events.find((event) => event.type === 'intervention');

    expect(intervention?.constantChanges).toEqual(expect.arrayContaining([
      { constant: 'producerGrowthRate', before: 0.1, after: 0.125 },
      { constant: 'baseMetabolism', before: 2, after: 1.6 },
    ]));
  });
});
