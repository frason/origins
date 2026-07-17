import type { EcosystemTrajectories } from './ecosystemTrajectory';

export type TurningPointTone = 'critical' | 'warning' | 'watch' | 'positive';

export interface TurningPointNotice {
  id: string;
  dimension: 'Order' | 'Chaos' | 'Exploration';
  tone: TurningPointTone;
  title: string;
  detail: string;
  priority: number;
}

interface CandidatePresentation {
  tone: TurningPointTone;
  title: string;
  priority: number;
}

const presentations: Record<string, CandidatePresentation> = {
  'order:Contracting': {
    tone: 'critical', title: 'The ecosystem is contracting', priority: 100,
  },
  'order:Concentrating': {
    tone: 'warning', title: 'Life is concentrating in fewer hands', priority: 90,
  },
  'exploration:Quieting': {
    tone: 'warning', title: 'Evolutionary exploration is quieting', priority: 80,
  },
  'chaos:Intensifying': {
    tone: 'watch', title: 'Ecological turnover is intensifying', priority: 70,
  },
  'exploration:Branching': {
    tone: 'positive', title: 'New evolutionary paths are opening', priority: 60,
  },
  'order:Balancing': {
    tone: 'positive', title: 'The ecosystem is becoming more balanced', priority: 50,
  },
};

/** Select one meaningful state change; steady and still-forming trajectories stay quiet. */
export function selectTurningPoint(
  trajectories: EcosystemTrajectories
): TurningPointNotice | null {
  const candidates = (
    [
      ['order', 'Order'],
      ['chaos', 'Chaos'],
      ['exploration', 'Exploration'],
    ] as const
  ).flatMap(([key, dimension]) => {
    const trajectory = trajectories[key];
    const presentation = presentations[`${key}:${trajectory.label}`];
    return presentation
      ? [{
          id: `${key}:${trajectory.label.toLowerCase()}`,
          dimension,
          detail: trajectory.explanation,
          ...presentation,
        }]
      : [];
  });
  return candidates.sort(
    (a, b) => b.priority - a.priority || a.id.localeCompare(b.id)
  )[0] ?? null;
}

export interface TurningPointAnnouncement {
  lastId: string | null;
  notice: TurningPointNotice | null;
}

/** Announce a category once, then re-arm only after it clears or another category wins. */
export function nextTurningPointAnnouncement(
  lastId: string | null,
  candidate: TurningPointNotice | null
): TurningPointAnnouncement {
  if (!candidate) return { lastId: null, notice: null };
  if (candidate.id === lastId) return { lastId, notice: null };
  return { lastId: candidate.id, notice: candidate };
}
