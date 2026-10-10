import { describe, expect, it } from 'vitest';
import { assertUniqueSupabaseMigrationVersions } from '../scripts/verify-supabase-migration-versions.mjs';

describe('Supabase migration version uniqueness (RR-03 schema proposal gate)', () => {
  it('accepts distinct numbered and timestamped migration versions', () => {
    expect(() => assertUniqueSupabaseMigrationVersions([
      '1650_seyeon_governed_active_subject_lock_v1.sql',
      '1660_member_reader_existing_thread_locator_v1.sql',
      '1670_seyeon_governed_guest_context_lock_v1.sql',
      '20261008043000_seyeon_manifest_acl_restore.sql',
      '.gitkeep',
    ])).not.toThrow();
  });

  it('rejects the proposed RR-03 migration colliding with existing 1660', () => {
    expect(() => assertUniqueSupabaseMigrationVersions([
      '1660_member_reader_existing_thread_locator_v1.sql',
      '1660_official_reader_assistant_provenance_storage_v1.sql',
    ])).toThrow(/Duplicate Supabase migration version 1660/);
  });

  it('rejects malformed version prefixes even when only one file has the name', () => {
    expect(() => assertUniqueSupabaseMigrationVersions([
      'reader_assistant_saju_provenance.sql',
    ])).toThrow(/Invalid Supabase migration filename/);
  });
});
