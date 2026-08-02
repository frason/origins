import { describe, expect, it } from 'vitest';
import health from '../../public/health.json';

describe('beta deployment health asset', () => {
  it('publishes a stable, non-sensitive health contract', () => {
    expect(health).toEqual({
      status: 'ok',
      service: 'project-origins',
      contractVersion: 1,
    });
  });
});
