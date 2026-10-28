/**
 * Evidence-only recovery for the single completed 2026-10-27 Production
 * privacy canary. It does not issue another deletion or a privileged mutation.
 * Run/step provenance must be independently checked by the protected workflow.
 */
export const APPROVED_COMPLETED_PRIVACY_CANARY_V1 = Object.freeze({
  sourceCanaryRunId: '40468086758',
  governedBackupRunId: '40468157715',
  canonicalLedgerRunId: '40468500587',
  projectRef: 'cnsfpcdiyofqvhpcegfc',
  provider: 'myeongha-privacy-canary-v1',
});

export const COMPLETED_PRIVACY_CANARY_READ_ONLY_SQL_V1 = `
select
  count(*)::int as "fixtureCount",
  count(*) filter (
    where s.status = 'deleted'
      and s.auth_user_id is null
      and dj.status = 'completed'
      and dj.completed_at is not null
      and oe.status = 'processed'
      and oe.processed_at is not null
      and cal.status = 'revoked'
      and cal.revoked_at is not null
      and not exists (select 1 from public.profiles p where p.subject_id = s.id)
  )::int as "terminalCount",
  (select count(*)::int from auth.users u
    where u.email like $3::text
      and u.raw_user_meta_data->>'myeongha_canary' = $1::text
      and u.raw_user_meta_data->>'canary_run_id' = $4::text
  ) as "remainingHostedAuth"
from public.commerce_account_links cal
join public.subjects s on s.id = cal.subject_id
left join public.data_deletion_jobs dj
  on dj.subject_id = s.id and dj.scope = 'account'
left join public.outbox_events oe
  on oe.aggregate_type = 'data_deletion_job'
  and oe.aggregate_id = dj.id::text
  and oe.event_type = 'ACCOUNT_DELETION_STARTED'
  and oe.event_schema_version = 'v1'
  and oe.dedupe_key = 'account-delete-start-v1'
where cal.provider = $1::text
  and cal.external_account_fingerprint like $2::text
`.trim();

export function assertCompletedPrivacyCanaryAttestationInputsV1(input) {
  const source = APPROVED_COMPLETED_PRIVACY_CANARY_V1;
  if (input?.sourceCanaryRunId !== source.sourceCanaryRunId
    || input?.governedBackupRunId !== source.governedBackupRunId
    || input?.canonicalLedgerRunId !== source.canonicalLedgerRunId) {
    throw new Error('COMPLETED_CANARY_EVIDENCE_SCOPE_NOT_APPROVED');
  }
  return source;
}

export function assertCompletedCanaryArtifactListingsV1({
  sourceArtifacts, backupArtifacts, ledgerArtifacts, nowUtc,
}) {
  const now = Date.parse(nowUtc);
  if (typeof nowUtc !== 'string' || !Number.isFinite(now)) {
    throw new Error('COMPLETED_CANARY_ARTIFACT_CLOCK_INVALID');
  }
  if (sourceArtifacts?.total_count !== 0
      || !Array.isArray(sourceArtifacts?.artifacts)
      || sourceArtifacts.artifacts.length !== 0) {
    throw new Error('COMPLETED_CANARY_ORIGINAL_ARTIFACT_BOUNDARY_DRIFT');
  }
  for (const [listing, expected] of [
    [backupArtifacts, {
      id: 12717562316,
      runId: 40468157715,
      name: 'myeongha-postgres-20261027T073720Z',
      sha: 'ed52c0cd442dfcf4396804275da2df74321f5799',
      digest: 'sha256:ba8035581d928091abe9b3f6e49f079368898a9782735cc70653946d4a182506',
      expiresAt: '2026-11-26T07:39:49Z',
    }],
    [ledgerArtifacts, {
      id: 12716914499,
      runId: 40468500587,
      name: 'myeongha-privacy-ledger-20261027T074035Z',
      sha: '711c8719a7e7ed2d42a333ec56463f008d2e1fc5',
      digest: 'sha256:e381ce4d061da400215987d7ccb4919a0712abf236ee871eb4b0fd8f009018c6',
      expiresAt: '2026-11-26T07:40:35Z',
    }],
  ]) {
    const artifact = listing?.artifacts?.[0];
    if (listing?.total_count !== 1
        || !Array.isArray(listing?.artifacts)
        || listing.artifacts.length !== 1
        || artifact?.id !== expected.id
        || artifact?.name !== expected.name
        || artifact?.digest !== expected.digest
        || artifact?.expired !== false
        || artifact?.expires_at !== expected.expiresAt
        || !(Date.parse(expected.expiresAt) > now)
        || artifact?.workflow_run?.id !== expected.runId
        || artifact?.workflow_run?.head_sha !== expected.sha) {
      throw new Error('COMPLETED_CANARY_ARTIFACT_PROVENANCE_NOT_APPROVED');
    }
  }
  return true;
}

export function assertCompletedCanaryHistoricalExecutionV1({
  sourceRun, backupRun, ledgerRun, sourceJobs,
}) {
  const ref = APPROVED_COMPLETED_PRIVACY_CANARY_V1;
  if (sourceRun?.id !== Number(ref.sourceCanaryRunId)
      || sourceRun?.path !== '.github/workflows/production-privacy-recovery-canary.yml'
      || sourceRun?.event !== 'workflow_dispatch'
      || sourceRun?.head_branch !== 'main'
      || sourceRun?.status !== 'completed'
      || sourceRun?.conclusion !== 'failure'
      || sourceRun?.head_sha !== 'ed52c0cd442dfcf4396804275da2df74321f5799') {
    throw new Error('COMPLETED_CANARY_SOURCE_RUN_NOT_APPROVED');
  }
  if (backupRun?.id !== Number(ref.governedBackupRunId)
      || backupRun?.path !== '.github/workflows/production-postgres-backup.yml'
      || backupRun?.event !== 'workflow_dispatch'
      || backupRun?.head_branch !== 'main'
      || backupRun?.status !== 'completed'
      || backupRun?.conclusion !== 'success'
      || backupRun?.head_sha !== sourceRun.head_sha) {
    throw new Error('COMPLETED_CANARY_BACKUP_RUN_NOT_APPROVED');
  }
  if (ledgerRun?.id !== Number(ref.canonicalLedgerRunId)
      || ledgerRun?.path !== '.github/workflows/production-postgres-privacy-recovery-ledger.yml'
      || ledgerRun?.event !== 'workflow_dispatch'
      || ledgerRun?.head_branch !== 'main'
      || ledgerRun?.status !== 'completed'
      || ledgerRun?.conclusion !== 'success'
      || ledgerRun?.head_sha !== '711c8719a7e7ed2d42a333ec56463f008d2e1fc5') {
    throw new Error('COMPLETED_CANARY_LEDGER_RUN_NOT_APPROVED');
  }
  // These are the historical protected dispatch principals, not caller claims.
  if (sourceRun?.actor?.login !== 'gycha0109-beep'
      || sourceRun?.triggering_actor?.login !== 'gycha0109-beep'
      || backupRun?.actor?.login !== 'github-actions[bot]'
      || backupRun?.triggering_actor?.login !== 'github-actions[bot]'
      || ledgerRun?.actor?.login !== 'github-actions[bot]'
      || ledgerRun?.triggering_actor?.login !== 'github-actions[bot]'
      || sourceRun?.run_attempt !== 1
      || backupRun?.run_attempt !== 1
      || ledgerRun?.run_attempt !== 1) {
    throw new Error('COMPLETED_CANARY_DISPATCH_PROVENANCE_NOT_APPROVED');
  }
  const timestamps = [sourceRun.created_at, backupRun.created_at, ledgerRun.created_at];
  if (timestamps.some(value => typeof value !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value)
      || !Number.isFinite(Date.parse(value)))
      || !(Date.parse(timestamps[0]) < Date.parse(timestamps[1])
        && Date.parse(timestamps[1]) < Date.parse(timestamps[2]))) {
    throw new Error('COMPLETED_CANARY_DISPATCH_ORDER_NOT_PROVEN');
  }
  const jobs = sourceJobs?.jobs;
  if (!Array.isArray(jobs) || jobs.length !== 1) {
    throw new Error('COMPLETED_CANARY_SOURCE_EXECUTION_NOT_PROVEN');
  }
  const job = jobs[0];
  if (job.name !== 'production-privacy-recovery-canary'
      || job.run_id !== Number(ref.sourceCanaryRunId)
      || job.status !== 'completed'
      || job.conclusion !== 'failure'
      || !Array.isArray(job.steps)) {
    throw new Error('COMPLETED_CANARY_SOURCE_EXECUTION_NOT_PROVEN');
  }
  for (const stepName of [
    'Create disposable hosted Auth + Production application canary state',
    'Dispatch and wait for governed pre-deletion Production backup',
    'Start deletion through API executor and run dedicated worker',
    'Remove ephemeral API canary login',
  ]) {
    if (job.steps.filter(s => s.name === stepName && s.conclusion === 'success').length !== 1) {
      throw new Error('COMPLETED_CANARY_SOURCE_EXECUTION_NOT_PROVEN');
    }
  }
  if (job.steps.filter(s =>
    s.name === 'Dispatch and wait for canonical non-zero privacy recovery ledger'
    && s.conclusion === 'failure').length !== 1) {
    throw new Error('COMPLETED_CANARY_SOURCE_FAILURE_GATE_DRIFT');
  }
  return true;
}

export async function attestCompletedPrivacyCanaryReadOnlyV1(query, input) {
  const source = assertCompletedPrivacyCanaryAttestationInputsV1(input);
  const rows = await query(
    COMPLETED_PRIVACY_CANARY_READ_ONLY_SQL_V1,
    [
      source.provider,
      `synthetic:${source.sourceCanaryRunId}:%`,
      `myeongha-privacy-canary-${source.sourceCanaryRunId}-%@example.com`,
      source.sourceCanaryRunId,
    ],
  );
  if (!Array.isArray(rows?.rows) || rows.rows.length !== 1
    || rows.rows[0].fixtureCount !== 1
    || rows.rows[0].terminalCount !== 1
    || rows.rows[0].remainingHostedAuth !== 0) {
    throw new Error('COMPLETED_CANARY_TERMINAL_STATE_NOT_PROVEN');
  }
  return Object.freeze({
    schema: 'myeongha-production-privacy-recovery-canary-evidence-v1',
    evidenceOrigin: 'read_only_completed_canary_attestation_v1',
    productionProjectRef: source.projectRef,
    fixtureClass: 'synthetic-disposable-member',
    canaryOperation: 'attest_completed',
    resumedFromCanaryRunId: Number(source.sourceCanaryRunId),
    commerceProvider: source.provider,
    accountDeletionStartAuthority: 'ephemeral-canary-login->myeongha_api_executor/cmd_start_account_deletion_runtime_v1',
    workerAuthority: 'myeongha_worker_runtime->myeongha_system_executor',
    workerStatus: 'completed',
    // This operation only observes prior deletion; it does not call Hosted Auth Admin.
    hostedAuthDeletionInvoked: false,
    hostedAuthDeletionOutcome: 'already_absent_verified',
    databaseFinalization: 'pass',
    completionAck: 'pass',
    personalizationNonResurrectionGuard: 'pass',
    commerceP5yRetentionGuard: 'retained-revoked-pass',
    outputContainsIdentifiers: false,
    outputContainsRowPayloads: false,
    authoritativePrivacyReconciliation: false,
    futureSafePrivacyReconciliation: false,
    drReady: false,
  });
}
