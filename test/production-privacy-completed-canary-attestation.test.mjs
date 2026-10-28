import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  APPROVED_COMPLETED_PRIVACY_CANARY_V1,
  COMPLETED_PRIVACY_CANARY_READ_ONLY_SQL_V1,
  assertCompletedPrivacyCanaryAttestationInputsV1,
  assertCompletedCanaryHistoricalExecutionV1,
  assertCompletedCanaryArtifactListingsV1,
  attestCompletedPrivacyCanaryReadOnlyV1,
} from '../scripts/attest-completed-production-privacy-canary.mjs';

const approved = {
  sourceCanaryRunId: '40468086758',
  governedBackupRunId: '40468157715',
  canonicalLedgerRunId: '40468500587',
};

describe('historical privacy canary completed evidence is read-only and exact-scoped', () => {
  it('cannot be attributed to arbitrary account, backup, or ledger', async () => {
    for (const input of [
      null,
      { ...approved, sourceCanaryRunId: '40322743599' },
      { ...approved, governedBackupRunId: '40468157716' },
      { ...approved, canonicalLedgerRunId: '40468500588' },
    ]) {
      expect(() => assertCompletedPrivacyCanaryAttestationInputsV1(input))
        .toThrow('COMPLETED_CANARY_EVIDENCE_SCOPE_NOT_APPROVED');
    }
  });

  it('accepts only one completely finalized synthetic fixture and absent Hosted Auth', async () => {
    const calls = [];
    const evidence = await attestCompletedPrivacyCanaryReadOnlyV1(
      async (text, values) => {
        calls.push({ text, values });
        return { rows: [{ fixtureCount: 1, terminalCount: 1, remainingHostedAuth: 0 }] };
      },
      approved,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].values).toEqual([
      APPROVED_COMPLETED_PRIVACY_CANARY_V1.provider,
      'synthetic:40468086758:%',
      'myeongha-privacy-canary-40468086758-%@example.com',
      '40468086758',
    ]);
    expect(evidence).toMatchObject({
      evidenceOrigin: 'read_only_completed_canary_attestation_v1',
      canaryOperation: 'attest_completed',
      resumedFromCanaryRunId: 40468086758,
      workerStatus: 'completed',
      authoritativePrivacyReconciliation: false,
      futureSafePrivacyReconciliation: false,
      drReady: false,
      outputContainsIdentifiers: false,
      outputContainsRowPayloads: false,
    });
    for (const required of [
      "s.status = 'deleted'",
      "dj.status = 'completed'",
      "oe.status = 'processed'",
      "cal.status = 'revoked'",
      's.auth_user_id is null',
      'from auth.users',
      'not exists (select 1 from public.profiles',
    ]) expect(COMPLETED_PRIVACY_CANARY_READ_ONLY_SQL_V1).toContain(required);
    expect(COMPLETED_PRIVACY_CANARY_READ_ONLY_SQL_V1)
      .not.toMatch(/\b(?:delete|insert|update|truncate|grant|drop|alter)\s+(?:from|into|table|role)/iu);
  });

  it('fails closed if the canary is absent, duplicated, unfinished, or Hosted Auth remains', async () => {
    for (const result of [
      { fixtureCount: 0, terminalCount: 0, remainingHostedAuth: 0 },
      { fixtureCount: 2, terminalCount: 2, remainingHostedAuth: 0 },
      { fixtureCount: 1, terminalCount: 0, remainingHostedAuth: 0 },
      { fixtureCount: 1, terminalCount: 1, remainingHostedAuth: 1 },
    ]) {
      await expect(attestCompletedPrivacyCanaryReadOnlyV1(
        async () => ({ rows: [result] }), approved,
      )).rejects.toThrow('COMPLETED_CANARY_TERMINAL_STATE_NOT_PROVEN');
    }
  });

  it('requires the original failed run to have completed the real Worker and backup successfully', () => {
    const sourceRun = {
      id:40468086758,
      path:'.github/workflows/production-privacy-recovery-canary.yml',
      event:'workflow_dispatch',head_branch:'main',status:'completed',
      conclusion:'failure',head_sha:'ed52c0cd442dfcf4396804275da2df74321f5799',
      actor:{login:'gycha0109-beep'},triggering_actor:{login:'gycha0109-beep'},
      run_attempt:1,created_at:'2026-10-27T07:35:58Z',
    };
    const backupRun = {
      id:40468157715,
      path:'.github/workflows/production-postgres-backup.yml',
      event:'workflow_dispatch',head_branch:'main',status:'completed',
      conclusion:'success',head_sha:sourceRun.head_sha,
      actor:{login:'github-actions[bot]'},triggering_actor:{login:'github-actions[bot]'},
      run_attempt:1,created_at:'2026-10-27T07:36:43Z',
    };
    const ledgerRun = {
      id:40468500587,
      path:'.github/workflows/production-postgres-privacy-recovery-ledger.yml',
      event:'workflow_dispatch',head_branch:'main',status:'completed',
      conclusion:'success',head_sha:'711c8719a7e7ed2d42a333ec56463f008d2e1fc5',
      actor:{login:'github-actions[bot]'},triggering_actor:{login:'github-actions[bot]'},
      run_attempt:1,created_at:'2026-10-27T07:40:10Z',
    };
    const successSteps = [
      'Create disposable hosted Auth + Production application canary state',
      'Dispatch and wait for governed pre-deletion Production backup',
      'Start deletion through API executor and run dedicated worker',
      'Remove ephemeral API canary login',
    ].map(name=>({name,conclusion:'success'}));
    const sourceJobs = {jobs:[{name:'production-privacy-recovery-canary',
      run_id:40468086758,status:'completed',
      conclusion:'failure',steps:[...successSteps,
        {name:'Dispatch and wait for canonical non-zero privacy recovery ledger',conclusion:'failure'}]}]};
    expect(assertCompletedCanaryHistoricalExecutionV1({
      sourceRun,backupRun,ledgerRun,sourceJobs,
    })).toBe(true);
    expect(() => assertCompletedCanaryHistoricalExecutionV1({
      sourceRun,backupRun:{...backupRun,head_sha:ledgerRun.head_sha},ledgerRun,sourceJobs,
    })).toThrow('COMPLETED_CANARY_BACKUP_RUN_NOT_APPROVED');
    expect(() => assertCompletedCanaryHistoricalExecutionV1({
      sourceRun,backupRun,ledgerRun,sourceJobs:{
        jobs:[{...sourceJobs.jobs[0],steps:successSteps.slice(0,2)}],
      },
    })).toThrow('COMPLETED_CANARY_SOURCE_EXECUTION_NOT_PROVEN');
    expect(() => assertCompletedCanaryHistoricalExecutionV1({
      sourceRun,backupRun,ledgerRun:{...ledgerRun,conclusion:'failure'},sourceJobs,
    })).toThrow('COMPLETED_CANARY_LEDGER_RUN_NOT_APPROVED');
    expect(() => assertCompletedCanaryHistoricalExecutionV1({
      sourceRun,backupRun,ledgerRun:{...ledgerRun,head_sha:sourceRun.head_sha},sourceJobs,
    })).toThrow('COMPLETED_CANARY_LEDGER_RUN_NOT_APPROVED');
    expect(() => assertCompletedCanaryHistoricalExecutionV1({
      sourceRun,backupRun,ledgerRun,sourceJobs:{jobs:[{...sourceJobs.jobs[0],run_id:40468086759}]},
    })).toThrow('COMPLETED_CANARY_SOURCE_EXECUTION_NOT_PROVEN');
    expect(() => assertCompletedCanaryHistoricalExecutionV1({
      sourceRun,backupRun:{...backupRun,actor:{login:'untrusted'}},ledgerRun,sourceJobs,
    })).toThrow('COMPLETED_CANARY_DISPATCH_PROVENANCE_NOT_APPROVED');
    expect(() => assertCompletedCanaryHistoricalExecutionV1({
      sourceRun,backupRun,ledgerRun:{...ledgerRun,created_at:backupRun.created_at},sourceJobs,
    })).toThrow('COMPLETED_CANARY_DISPATCH_ORDER_NOT_PROVEN');

  });

  it('requires real pinned GitHub artifact identities, digests and unexpired provenance', () => {
    const sourceArtifacts = { total_count:0, artifacts:[] };
    const backupArtifact = {
      id:12717562316,
      name:'myeongha-postgres-20261027T073720Z',
      digest:'sha256:ba8035581d928091abe9b3f6e49f079368898a9782735cc70653946d4a182506',
      expired:false, expires_at:'2026-11-26T07:39:49Z',
      workflow_run:{id:40468157715,head_sha:'ed52c0cd442dfcf4396804275da2df74321f5799'},
    };
    const ledgerArtifact = {
      id:12716914499,
      name:'myeongha-privacy-ledger-20261027T074035Z',
      digest:'sha256:e381ce4d061da400215987d7ccb4919a0712abf236ee871eb4b0fd8f009018c6',
      expired:false, expires_at:'2026-11-26T07:40:35Z',
      workflow_run:{id:40468500587,head_sha:'711c8719a7e7ed2d42a333ec56463f008d2e1fc5'},
    };
    const input = {
      sourceArtifacts,
      backupArtifacts:{total_count:1,artifacts:[backupArtifact]},
      ledgerArtifacts:{total_count:1,artifacts:[ledgerArtifact]},
      nowUtc:'2026-10-28T02:00:00.000Z',
    };
    expect(assertCompletedCanaryArtifactListingsV1(input)).toBe(true);
    for (const variation of [
      {...input,backupArtifacts:{total_count:1,artifacts:[{...backupArtifact,expired:true}]}},
      {...input,ledgerArtifacts:{total_count:1,artifacts:[{...ledgerArtifact,digest:'sha256:wrong'}]}},
      {...input,nowUtc:'2026-11-27T00:00:00.000Z'},
    ]) expect(() => assertCompletedCanaryArtifactListingsV1(variation))
      .toThrow('COMPLETED_CANARY_ARTIFACT_PROVENANCE_NOT_APPROVED');
    expect(() => assertCompletedCanaryArtifactListingsV1({
      ...input,sourceArtifacts:{total_count:1,artifacts:[{id:1}]},
    })).toThrow('COMPLETED_CANARY_ORIGINAL_ARTIFACT_BOUNDARY_DRIFT');
  });

  it('isolates historical read-only attestation from the destructive fresh/resume job', () => {
    const workflow = readFileSync('.github/workflows/production-privacy-recovery-canary.yml', 'utf8');
    expect(workflow).toContain("if: inputs.operation != 'attest_completed'");
    expect(workflow).toContain("if: inputs.operation == 'attest_completed'");
    expect(workflow).toContain("name: historical-completed-canary-read-only-attestation");
    expect(workflow).toContain("actions: read");
    expect(workflow).toContain("MYEONGHA_PRIVACY_CANARY_ATTEST_LEDGER_RUN_ID: ${{ inputs.attest_ledger_run_id }}");
    expect(workflow).toContain("ATTEST_COMPLETED_40468086758_READ_ONLY");
    expect(workflow).toContain("MYEONGHA_PRIVACY_CANARY_RESUME_RUN_ID\" == '40468086758'");
    expect(workflow).toContain("MYEONGHA_PRIVACY_CANARY_RESUME_BACKUP_RUN_ID\" == '40468157715'");
    expect(workflow).toContain("MYEONGHA_PRIVACY_CANARY_ATTEST_LEDGER_RUN_ID\" == '40468500587'");
    expect(workflow).toContain("node scripts/run-production-privacy-recovery-canary.mjs attest-completed");
    expect(workflow).toContain("verify-completed-privacy-canary-artifact-pair.py");
    expect(workflow).toContain("production-privacy-recovery-canary-${{ github.run_id }}");
    const candidate = readFileSync('scripts/run-production-privacy-recovery-canary.mjs', 'utf8');
    expect(candidate).toContain("'ATTEST_COMPLETED_40468086758_READ_ONLY'");
    expect(candidate).toContain("await client.query('BEGIN READ ONLY')");
  });
});
