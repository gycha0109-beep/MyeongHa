import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitBlobSha, validateR2PendingInventory } from '../scripts/operations/verify-seyeon-r2-pending-migrations.mjs';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const inventory = JSON.parse(readFileSync(
  join(repoRoot, 'scripts/operations/seyeon-r2-pending-migration-inventory.json'), 'utf8'));

function withFixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'seyeon-r2-pending-'));
  const migrationDir = join(root, 'supabase', 'migrations');
  mkdirSync(migrationDir, { recursive: true });
  for (const row of inventory.migrations) {
    copyFileSync(join(repoRoot, 'supabase', 'migrations', row.file), join(migrationDir, row.file));
  }
  const manifest = structuredClone(inventory);
  try { return run(root, migrationDir, manifest); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

describe('R2 held 1520..1720 pending migration dependency inventory', () => {
  it('pins exactly 21 source files and nine ordered non-executable Owner review units', () => {
    withFixture((root, dir, manifest) => {
      const result = validateR2PendingInventory(root, manifest);
      expect(result).toMatchObject({ migrationCount: 21, reviewUnitCount: 9,
        readOnly: true, drReady: false, authorizedForProduction: false,
        status: 'HOLD_OWNER_RECONCILIATION_REQUIRED' });
      expect(result.reviewUnits.every(unit => unit.approval === 'HOLD_OWNER_REVIEW' && unit.executable === false)).toBe(true);
    });
  });
  it('fails closed on modified migration SQL', () => {
    withFixture((root, dir, manifest) => {
      const file = join(dir, manifest.migrations[4].file);
      writeFileSync(file, readFileSync(file, 'utf8') + '\n-- mutation\n');
      expect(() => validateR2PendingInventory(root, manifest)).toThrow('HOLD_R2_SQL_CONTENT_DRIFT_1560');
    });
  });
  it('rejects missing files, unexpected duplicates and remote-only versions', () => {
    withFixture((root, dir, manifest) => {
      unlinkSync(join(dir, manifest.migrations[1].file));
      expect(() => validateR2PendingInventory(root, manifest)).toThrow('HOLD_R2_MIGRATION_DIRECTORY_DRIFT');
    });
    withFixture((root, dir, manifest) => {
      writeFileSync(join(dir, '1560_injected_shadow.sql'), 'select 1;');
      expect(() => validateR2PendingInventory(root, manifest)).toThrow('HOLD_R2_MIGRATION_DIRECTORY_DRIFT');
    });
    withFixture((root, dir, manifest) => {
      writeFileSync(join(dir, '20261008090417_remote_only.sql'), 'select 1;');
      expect(() => validateR2PendingInventory(root, manifest)).toThrow('HOLD_R2_REMOTE_ONLY_VERSION_CHECKED_IN');
    });
  });
  it('rejects future dependency, duplicate prerequisite and version swaps', () => {
    withFixture((root, dir, manifest) => {
      manifest.migrations[6].requires = ['1710'];
      expect(() => validateR2PendingInventory(root, manifest)).toThrow('HOLD_R2_NON_FORWARD_DEPENDENCY');
    });
    withFixture((root, dir, manifest) => {
      manifest.migrations[6].requires = ['1550', '1550'];
      expect(() => validateR2PendingInventory(root, manifest)).toThrow('HOLD_R2_NON_FORWARD_DEPENDENCY');
    });
    withFixture((root, dir, manifest) => {
      manifest.migrations[1].version = '1540';
      expect(() => validateR2PendingInventory(root, manifest)).toThrow('HOLD_R2_VERSION_OR_FILENAME_DRIFT');
    });
  });
  it('rejects implicit Production authorization and altered Owner approval', () => {
    withFixture((root, dir, manifest) => {
      manifest.authorizedForProduction = true;
      expect(() => validateR2PendingInventory(root, manifest)).toThrow('HOLD_R2_UNAUTHORIZED_PROMOTION');
    });
    withFixture((root, dir, manifest) => {
      manifest.migrations[0].approval = 'APPROVED';
      expect(() => validateR2PendingInventory(root, manifest)).toThrow('HOLD_R2_APPROVAL_OR_OWNER_DRIFT');
    });
  });
  it('rejects changed review-unit order or count', () => {
    withFixture((root, dir, manifest) => {
      manifest.migrations[5].unit = 'deletion';
      expect(() => validateR2PendingInventory(root, manifest)).toThrow('HOLD_R2_REVIEW_UNIT_ORDER');
    });
  });
  it('rejects missing proof even when new SQL blob is intentionally re-pinned', () => {
    withFixture((root, dir, manifest) => {
      const row = manifest.migrations[0];
      const file = join(dir, row.file);
      const replaced = readFileSync(file, 'utf8').replace(/create\s+or\s+replace\s+function\s+public\.internal_finalize_account_deletion_db_v1/iu,
        'create or replace function public.fake_account_deletion_finalizer');
      expect(replaced).not.toBe(readFileSync(file, 'utf8'));
      writeFileSync(file, replaced);
      row.blobSha = gitBlobSha(Buffer.from(replaced));
      expect(() => validateR2PendingInventory(root, manifest)).toThrow('HOLD_R2_PROOF_OBJECT_MISSING_1520');
    });
  });
});
