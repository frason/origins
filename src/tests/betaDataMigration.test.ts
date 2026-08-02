import { describe, expect, it } from 'vitest';
import migrationSql from '../../supabase/migrations/202608010001_beta_data_foundation.sql?raw';

const tables = [
  'beta_world_backups',
  'beta_diagnostic_bundles',
  'beta_feedback',
] as const;

describe('beta data migration contract', () => {
  it.each(tables)('creates and forces RLS for %s', (table) => {
    expect(migrationSql).toMatch(
      new RegExp(`create table public\\.${table} \\(`, 'i'),
    );
    expect(migrationSql).toMatch(
      new RegExp(`alter table public\\.${table} enable row level security`, 'i'),
    );
    expect(migrationSql).toMatch(
      new RegExp(`alter table public\\.${table} force row level security`, 'i'),
    );
    expect(migrationSql).toMatch(
      new RegExp(`revoke all on table public\\.${table} from anon`, 'i'),
    );
  });

  it('scopes every policy to authenticated owners', () => {
    const policies = migrationSql.match(/create policy[\s\S]*?;/gi) ?? [];

    expect(policies.length).toBe(10);
    for (const policy of policies) {
      expect(policy).toMatch(/to authenticated/i);
      expect(policy).toMatch(/auth\.uid\(\)/i);
    }
  });

  it('caps large JSON payloads and does not grant browser-anonymous access', () => {
    expect(migrationSql.match(/pg_column_size\([^)]*\) <= 8388608/gi)).toHaveLength(
      2,
    );
    expect(migrationSql).not.toMatch(/grant[^;]*\bto anon\b/i);
  });

  it('never embeds a privileged Supabase key', () => {
    expect(migrationSql).not.toMatch(/sb_secret_|service[_-]?role|eyJhbGci/i);
  });
});
