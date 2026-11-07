import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  classifyRestoredPrivateClaimDeletionV1,
  verifyRestoredPrivateClaimRowConservationV1,
} from '../scripts/operations/commerce-private-claim-restored-evidence-classifier-v1.mjs';

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
    expect(restore).toContain('classifyRestoredPrivateClaimDeletionV1({');
    expect(restore).toContain('...privateClaimEvidence,');
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

  it('separates an actually witnessed private claim DELETE from a zero-row restore',()=>{
    expect(restore).toContain('private_claim_preexisting_subjects=0');
    expect(restore).toContain('private_claim_pre_finalizer_count=');
    expect(restore).toContain('private_claim_preexisting_subjects=$((private_claim_preexisting_subjects + 1))');
    expect(restore).toContain('preExistingClaimSubjectCount,');
    expect(restore).toContain('accountDeletionCount: publicManifest.eventTypeCounts.ACCOUNT_DELETION_STARTED');
    // Only the same Subject is counted; no payload or Subject ID in the
    // restored evidence output, and no artificial claim is seeded.
    const before=restore.indexOf('private_claim_pre_finalizer_count=');
    const finalizer=restore.indexOf('finalizer="$(');
    const after=restore.indexOf('private_claim_count=');
    expect(before).toBeGreaterThan(restore.indexOf('[[ "$phase" == "db_finalization_required" ]]'));
    expect(before).toBeLessThan(finalizer);
    expect(finalizer).toBeLessThan(after);
    expect(restore).toContain("where subject_id='$subject_id'::uuid;");
    expect(restore).not.toContain('insert into public.digital_reading_withdrawal_claims_private_v1');
    expect(restore).toContain('private_claim_preexisting_subjects" -le "$private_claim_verified_subjects"');
  });

  it.each([
    ['historical backup lacking the relation','absent',0,2,
      'schema-absent-no-private-claim-proof',false],
    ['table present but no Claim before deletion','present',0,2,
      'exact-subject-zero-after-replay-no-pre-finalizer-deletion-witness',false],
    ['one exact Subject with an existing Claim','present',1,2,
      'exact-subject-after-finalizer-and-completion-pass',true],
    ['all deletion Subjects with existing Claims','present',2,2,
      'exact-subject-after-finalizer-and-completion-pass',true],
  ])('classifies %s without claiming unobserved deletion',
    (_name,relation,preExistingClaimSubjectCount,accountDeletionCount,guard,witnessed)=>{
      expect(classifyRestoredPrivateClaimDeletionV1({
        relation,preExistingClaimSubjectCount,accountDeletionCount,
      })).toEqual({
        private_withdrawal_claim_replay_guard:guard,
        private_withdrawal_claim_deletion_witnessed:witnessed,
      });
    },
  );

  it.each([
    {relation:'other',preExistingClaimSubjectCount:0,accountDeletionCount:1},
    {relation:'absent',preExistingClaimSubjectCount:1,accountDeletionCount:1},
    {relation:'present',preExistingClaimSubjectCount:-1,accountDeletionCount:1},
    {relation:'present',preExistingClaimSubjectCount:1.2,accountDeletionCount:2},
    {relation:'present',preExistingClaimSubjectCount:2,accountDeletionCount:1},
    {relation:'present',preExistingClaimSubjectCount:0,accountDeletionCount:0},
    {relation:'present',preExistingClaimSubjectCount:0,accountDeletionCount:NaN},
  ])('rejects invalid or overstated restored Claim proof %j',input=>{
    expect(()=>classifyRestoredPrivateClaimDeletionV1(input))
      .toThrow('RESTORED_PRIVATE_CLAIM_DELETION_EVIDENCE_INVALID');
  });

  it('compares the whole isolated Claim count against only exact target deletion totals',()=>{
    expect(restore).toContain('private_claim_total_before=');
    expect(restore).toContain('private_claim_total_after=');
    expect(restore).toContain('private_claim_count_file="$tmp_dir/private-claim-target-counts"');
    expect(restore).toContain('printf \'%s\\n\' "$private_claim_pre_finalizer_count"');
    expect(restore).toContain('verifyRestoredPrivateClaimRowConservationV1({');
    expect(restore).toContain('...privateClaimRowEvidence,');
    const before=restore.indexOf('private_claim_total_before="$(');
    const finalizer=restore.indexOf('finalizer="$(');
    const after=restore.indexOf('private_claim_total_after="$(');
    expect(before).toBeGreaterThan(restore.indexOf('restored_claim_relation='));
    expect(before).toBeLessThan(finalizer);
    expect(after).toBeGreaterThan(restore.indexOf('done < <(jq -r'));
    expect(restore).not.toContain('select subject_id from public.digital_reading_withdrawal_claims_private_v1');
  });
  it.each([
    ['non-target rows unchanged','present','5','3',['2','0'],2,
      'aggregate-conservation-pass-not-row-identity-proof'],
    ['multiple original claims on one target','present','7','3',['4','0'],2,
      'aggregate-conservation-pass-not-row-identity-proof'],
    ['no deletion rows, same aggregate','present','4','4',['0'],1,
      'aggregate-conservation-pass-not-row-identity-proof'],
    ['legacy backup with no Claim relation','absent',null,null,[],1,
      'schema-absent-not-checked'],
  ])('accepts %s as a bounded aggregate observation',
    (_name,relation,totalBefore,totalAfter,targetBeforeCounts,accountDeletionCount,guard)=>{
      expect(verifyRestoredPrivateClaimRowConservationV1({
        relation,totalBefore,totalAfter,targetBeforeCounts,accountDeletionCount,
      })).toEqual({private_withdrawal_claim_unrelated_row_count_guard:guard});
    },
  );
  it.each([
    ['unrelated Claim unexpectedly deleted','present','5','2',['2','0'],2],
    ['target Claim unexpectedly retained','present','5','4',['2','0'],2],
    ['target counts exceed global baseline','present','1','0',['2'],1],
    ['missing target evidence','present','5','3',['2'],2],
    ['fabricated extra target','present','5','3',['2','0'],1],
    ['missing relation but positive global count','absent','1',null,[],1],
    ['missing relation but target count','absent',null,null,['0'],1],
    ['negative final count','present','5','-1',['2'],1],
    ['invalid decimal','present','05','3',['2'],1],
    ['unsafe/deformed account count','present','5','3',['2'],0],
  ])('rejects %s before writing a restore success receipt',
    (_name,relation,totalBefore,totalAfter,targetBeforeCounts,accountDeletionCount)=>{
      expect(()=>verifyRestoredPrivateClaimRowConservationV1({
        relation,totalBefore,totalAfter,targetBeforeCounts,accountDeletionCount,
      })).toThrow('RESTORED_PRIVATE_CLAIM_ROW_CONSERVATION_INVALID');
    },
  );
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
