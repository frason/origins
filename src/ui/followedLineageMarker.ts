import type { FollowedLineage } from '../state/store';

export function followedLineageKey(speciesId: string, lineageId: string): string {
  return `${speciesId}:${lineageId}`;
}

export function buildFollowedLineageKeySet(followed: FollowedLineage[]): Set<string> {
  return new Set(followed.map((item) => followedLineageKey(item.speciesId, item.lineageId)));
}

export function isFollowedLineageMember(
  followedKeys: Set<string>,
  speciesId: string,
  lineageId: string
): boolean {
  return followedKeys.has(followedLineageKey(speciesId, lineageId));
}
