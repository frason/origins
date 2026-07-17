import { lineageDisplayName } from '../simulation/speciesNames';
import type {
  CreatureSnapshot,
  EventSnapshot,
  FollowedLineage,
} from '../state/store';

export type FollowedNoticeType = 'branch' | 'rebound' | 'dominance' | 'extinction';

export interface FollowedLineageNotice {
  id: string;
  type: FollowedNoticeType;
  tick: number;
  title: string;
  detail: string;
}

const priority: Record<FollowedNoticeType, number> = {
  extinction: 4,
  branch: 3,
  rebound: 2,
  dominance: 1,
};

/** Derive bounded milestones from structured history; no simulation state is changed. */
export function buildFollowedLineageNotices(
  creatures: CreatureSnapshot[],
  events: EventSnapshot[],
  followed: FollowedLineage[],
  tick: number,
  limit = 4
): FollowedLineageNotice[] {
  const living = creatures.filter((creature) => creature.lifecycleState === 'alive');
  const totalPopulation = living.length;
  const notices: FollowedLineageNotice[] = [];

  for (const bookmark of followed) {
    const name = lineageDisplayName(bookmark.speciesId, bookmark.lineageId);
    const population = living.filter(
      (creature) =>
        creature.speciesId === bookmark.speciesId && creature.lineageId === bookmark.lineageId
    ).length;
    const lineageEvents = events.filter(
      (event) =>
        event.speciesId === bookmark.speciesId && event.lineageId === bookmark.lineageId
    );

    const branch = [...events].reverse().find(
      (event) =>
        event.type === 'mutation' &&
        event.speciesId === bookmark.speciesId &&
        event.parentLineageId === bookmark.lineageId &&
        event.lineageId
    );
    if (branch?.lineageId) {
      notices.push({
        id: `${bookmark.speciesId}:${bookmark.lineageId}:branch:${branch.tick}:${branch.lineageId}`,
        type: 'branch',
        tick: branch.tick,
        title: `${name} formed a new branch`,
        detail: `${lineageDisplayName(bookmark.speciesId, branch.lineageId)} emerged`,
      });
    }

    const latestDeath = [...lineageEvents].reverse().find((event) => event.type === 'death');
    if (population === 0 && latestDeath) {
      notices.push({
        id: `${bookmark.speciesId}:${bookmark.lineageId}:extinction:${latestDeath.tick}`,
        type: 'extinction',
        tick: latestDeath.tick,
        title: `${name} went extinct`,
        detail: 'No living members of this followed lineage remain',
      });
    }

    let latestBirthIndex = -1;
    for (let index = lineageEvents.length - 1; index >= 0; index--) {
      if (lineageEvents[index].type === 'birth') {
        latestBirthIndex = index;
        break;
      }
    }
    if (population > 0 && latestBirthIndex >= 0) {
      const latestBirth = lineageEvents[latestBirthIndex];
      const preceding = lineageEvents.slice(0, latestBirthIndex).filter(
        (event) => event.tick >= latestBirth.tick - 25
      );
      const losses = preceding.filter((event) => event.type === 'death').length;
      const gains = preceding.filter((event) => event.type === 'birth').length;
      if (losses >= 2 && losses > gains) {
        notices.push({
          id: `${bookmark.speciesId}:${bookmark.lineageId}:rebound:${latestBirth.tick}`,
          type: 'rebound',
          tick: latestBirth.tick,
          title: `${name} is rebounding`,
          detail: `A new birth followed ${losses} recent losses`,
        });
      }
    }

    const share = totalPopulation > 0 ? population / totalPopulation : 0;
    if (population >= 3 && share >= 0.5) {
      notices.push({
        id: `${bookmark.speciesId}:${bookmark.lineageId}:dominance`,
        type: 'dominance',
        tick,
        title: `${name} is dominant`,
        detail: `${Math.round(share * 100)}% of living creatures belong to this lineage`,
      });
    }
  }

  return notices
    .sort(
      (a, b) =>
        b.tick - a.tick || priority[b.type] - priority[a.type] || a.id.localeCompare(b.id)
    )
    .slice(0, Math.max(0, limit));
}
