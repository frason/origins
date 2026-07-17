import { describe, expect, it } from 'vitest';
import type {
  DynamicsTrajectory,
  EcosystemTrajectories,
} from '../ui/ecosystemTrajectory';
import {
  nextTurningPointAnnouncement,
  selectTurningPoint,
} from '../ui/turningPointModel';

const trajectory = (
  label: string,
  direction: DynamicsTrajectory['direction'] = 'steady',
  explanation = `${label} evidence`
): DynamicsTrajectory => ({ label, direction, explanation });

function trajectories(
  partial: Partial<EcosystemTrajectories> = {}
): EcosystemTrajectories {
  return {
    order: trajectory('Holding'),
    chaos: trajectory('Holding'),
    exploration: trajectory('Continuing'),
    ...partial,
  };
}

describe('ecosystem turning-point selection', () => {
  it('stays quiet for steady and emerging trajectories', () => {
    expect(selectTurningPoint(trajectories())).toBeNull();
    expect(selectTurningPoint(trajectories({
      order: trajectory('Taking shape', 'emerging'),
      chaos: trajectory('Taking shape', 'emerging'),
      exploration: trajectory('Taking shape', 'emerging'),
    }))).toBeNull();
  });

  it('prioritizes contraction over simultaneous quieter changes', () => {
    const notice = selectTurningPoint(trajectories({
      order: trajectory('Contracting', 'falling', 'Population fell from 20 to 10.'),
      chaos: trajectory('Intensifying', 'rising'),
      exploration: trajectory('Branching', 'rising'),
    }));

    expect(notice).toMatchObject({
      id: 'order:contracting',
      dimension: 'Order',
      tone: 'critical',
      title: 'The ecosystem is contracting',
      detail: 'Population fell from 20 to 10.',
    });
  });

  it('surfaces evolutionary branching when no higher-priority warning exists', () => {
    expect(selectTurningPoint(trajectories({
      exploration: trajectory('Branching', 'rising', 'Three lineages emerged.'),
    }))).toMatchObject({
      dimension: 'Exploration', tone: 'positive',
      title: 'New evolutionary paths are opening',
      detail: 'Three lineages emerged.',
    });
  });

  it('does not frame intensifying chaos as inherently positive', () => {
    const notice = selectTurningPoint(trajectories({
      chaos: trajectory(
        'Intensifying',
        'rising',
        'Turnover rose; more chaos is not always healthier.'
      ),
    }));
    expect(notice).toMatchObject({ dimension: 'Chaos', tone: 'watch' });
    expect(notice?.detail).toContain('not always healthier');
  });

  it('returns identical notices for identical trajectory evidence', () => {
    const state = trajectories({
      order: trajectory('Concentrating', 'falling'),
      exploration: trajectory('Quieting', 'falling'),
    });
    expect(selectTurningPoint(state)).toEqual(selectTurningPoint(state));
  });

  it('announces a category once and re-arms after the condition clears', () => {
    const candidate = selectTurningPoint(trajectories({
      exploration: trajectory('Branching', 'rising'),
    }))!;
    const first = nextTurningPointAnnouncement(null, candidate);
    expect(first.notice).toEqual(candidate);
    expect(nextTurningPointAnnouncement(first.lastId, candidate).notice).toBeNull();
    const cleared = nextTurningPointAnnouncement(first.lastId, null);
    expect(cleared.lastId).toBeNull();
    expect(nextTurningPointAnnouncement(cleared.lastId, candidate).notice).toEqual(candidate);
  });
});
