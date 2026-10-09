import { describe, it, expect } from 'vitest';

// dead: lead's one-off diagnostic scratch file for #304 root-cause investigation
// (2026-10-09 planning pass). Kept as a no-op passing test (not removed, since file
// deletion is blocked in this sandbox per #294) so it doesn't break `vitest run`'s
// "no test suite found" check for other files matching *.test.ts.
describe('dead scratch (lead #304 diagnostic, safe to ignore)', () => {
  it('is a no-op placeholder', () => {
    expect(true).toBe(true);
  });
});
