import { describe, expect, it } from 'vitest';
import {
  buildFollowedLineageKeySet,
  isFollowedLineageMember,
} from '../ui/followedLineageMarker';

describe('followed lineage map marker matching', () => {
  it('matches only the exact species/lineage pair that is followed', () => {
    const keys = buildFollowedLineageKeySet([{ speciesId: 'grazer', lineageId: 'root' }]);
    expect(isFollowedLineageMember(keys, 'grazer', 'root')).toBe(true);
    expect(isFollowedLineageMember(keys, 'grazer', 'swift-branch')).toBe(false);
    expect(isFollowedLineageMember(keys, 'hunter', 'root')).toBe(false);
  });

  it('matches nothing when no lineages are followed', () => {
    const keys = buildFollowedLineageKeySet([]);
    expect(isFollowedLineageMember(keys, 'grazer', 'root')).toBe(false);
  });

  it('tracks every followed lineage independently', () => {
    const keys = buildFollowedLineageKeySet([
      { speciesId: 'grazer', lineageId: 'root' },
      { speciesId: 'hunter', lineageId: 'apex' },
    ]);
    expect(isFollowedLineageMember(keys, 'grazer', 'root')).toBe(true);
    expect(isFollowedLineageMember(keys, 'hunter', 'apex')).toBe(true);
    expect(isFollowedLineageMember(keys, 'hunter', 'root')).toBe(false);
  });
});
