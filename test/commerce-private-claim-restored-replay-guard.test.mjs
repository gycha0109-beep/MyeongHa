import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const restore=readFileSync(new URL(
  '../scripts/operations/run-restored-postgres-authoritative-privacy-replay.sh',
  import.meta.url,
),'utf8');
const originalDeletionProof=readFileSync(new URL(
  './db/commerce_private_claim_finalizer_pg17_assertions.sh',
  import.meta.url,
),'utf8');
const originalMigration=readFileSync(new URL(
  '../supabase/migrations/2320_commerce_digital_reading_claim_account_delete_v1.sql',
  import.meta.url,
),'utf8');

describe('Commerce claim account deletion after isolated Postgres restore',()=>{
  it('checks the staged relation before replay finalization and distinguishes historical missing schema',()=>{
    expect(restore).toContain("to_regclass('public.digital_reading_withdrawal_claims_private_v1')");
    expect(restore).toContain("then 'absent' else 'present'");
    expect(restore).toContain("restored_claim_relation");
    expect(restore).toContain("'schema-absent-no-private-claim-proof'");
    expect(restore).toContain("'exact-subject-after-finalizer-and-completion-pass'");
    expect(restore.indexOf('restored_claim_relation=')).toBeGreaterThan(
      restore.indexOf(' -f "$plan"')
    );
    expect(restore.indexOf('restored_claim_relation=')).toBeLessThan(
      restore.indexOf('account_deletion_count=0')
    );
  });
  it('refuses resurrected claims at exact target Subject after finalizer AND idempotent replay',()=>{
    expect(restore).toContain("where subject_id='$subject_id'::uuid");
    expect(restore).toContain('private_claim_count');
    expect(restore).toContain('private_claim_replay_count');
    expect(restore).toContain('restored Commerce private withdrawal claim survives');
    expect(restore).toContain('private withdrawal claim resurrected after completion replay');
    const first=restore.indexOf('private_claim_count=');
    const second=restore.indexOf('private_claim_replay_count=');
    expect(first).toBeGreaterThan(restore.indexOf('[[ "$finalizer" == "1|0|1" ]]'));
    expect(second).toBeGreaterThan(restore.indexOf('[[ "$completion_replay" == "1|1" ]]'));
    expect(second).toBeLessThan(restore.indexOf('done < <(jq -r'));
    expect(restore).toContain('private_claim_verified_subjects');
    expect(restore).toContain('"$private_claim_verified_subjects" -eq "$account_deletion_count"');
    expect(restore).not.toContain('private_claim_count" == "1"');
  });
  it('reuses existing PG17 deletion/other-Subject/restore-residue assertions',()=>{
    expect(originalDeletionProof).toContain('after-finalization)');
    expect(originalDeletionProof).toContain('0|1|2');
    expect(originalDeletionProof).toContain('Withdrawal claim resurrected after account deletion');
    expect(originalMigration).toContain('delete from public.digital_reading_withdrawal_claims_private_v1');
    expect(originalMigration).toContain('Withdrawal claim resurrected after account deletion');
  });
  it('parses as a Bash script on POSIX without executing a restore or a PG command',()=>{
    if (process.platform === 'win32') return;
    const shell=spawnSync('bash',[
      '-n',
      new URL('../scripts/operations/run-restored-postgres-authoritative-privacy-replay.sh',import.meta.url).pathname,
    ],{encoding:'utf8'});
    expect(shell.status, shell.stderr).toBe(0);
  });
});
