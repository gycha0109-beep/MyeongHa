import assert from 'node:assert/strict';
import { evaluateRecoveredServingAdmission } from './build-postgres-recovered-serving-admission.mjs';

const restoreEvidence = Object.freeze({
  schema_version: 'myeongha-postgres-isolated-restore-drill-v1',
  evidence_envelope_version: 'myeongha-postgres-isolated-restore-evidence-envelope-v1',
  backup_workflow_run_id: '40468157715',
  backup_completed_at_utc: '2026-10-27T04:35:10Z',
  incident_reference_utc: '2026-10-27T07:40:30Z',
  restore_target: 'github-actions-loopback-supabase-postgres',
  provider_managed_data_full_restore: false,
  dr_ready: false,
});
const privacyEvidence = Object.freeze({
  schema_version: 'myeongha-postgres-restored-db-authoritative-privacy-reconciliation-v1',
  backup_workflow_run_id: 40468157715,
  incident_reference_utc: '2026-10-27T07:40:30Z',
  authoritative_coverage_through: '2026-10-27T07:40:33Z',
  authoritative_privacy_reconciliation: true,
  authoritative_source_scope: 'captured-window-only',
  replay_result: 'pass',
  second_identical_replay: 'idempotent-pass',
  completion_replay: 'idempotent-pass',
  output_contains_identifiers: false,
  output_contains_row_payloads: false,
  dr_ready: false,
});
const withoutPrivacy = evaluateRecoveredServingAdmission({ restoreEvidence });
assert.equal(withoutPrivacy.gate, 'BLOCKED');
assert.equal(withoutPrivacy.serviceResumptionAllowed, false);
assert.equal(withoutPrivacy.boundedPrivacyReplayProven, false);
assert.ok(withoutPrivacy.blockers.includes('BOUNDED_PRIVACY_REPLAY_NOT_PROVEN'));

const withPrivacy = evaluateRecoveredServingAdmission({ restoreEvidence, privacyEvidence });
assert.equal(withPrivacy.gate, 'BLOCKED');
assert.equal(withPrivacy.serviceResumptionAllowed, false);
assert.equal(withPrivacy.boundedPrivacyReplayProven, true);
assert.equal(withPrivacy.futureSafePrivacyReconciliation, false);
assert.equal(withPrivacy.providerManagedDataFullRestore, false);
assert.equal(withPrivacy.drReady, false);
assert.ok(withPrivacy.blockers.includes('HOSTED_LOGIN_SESSION_TOKEN_AND_STORAGE_BYTES_NOT_TESTED'));
assert.ok(withPrivacy.blockers.includes('S8_HOSTED_SERVING_E2E_NOT_PROVEN'));
assert.equal(withPrivacy.outputContainsIdentifiers, false);

for (const badRestore of [
  { ...restoreEvidence, dr_ready: true },
  { ...restoreEvidence, backup_workflow_run_id: null },
  { ...restoreEvidence, restore_target: 'production' },
  { ...restoreEvidence, backup_completed_at_utc: '2026-10-29T01:00:00Z' },
  { ...restoreEvidence, evidence_envelope_version: 'unknown' },
]) {
  assert.throws(() => evaluateRecoveredServingAdmission({ restoreEvidence: badRestore }));
}
for (const badPrivacy of [
  { ...privacyEvidence, backup_workflow_run_id: 1 },
  { ...privacyEvidence, incident_reference_utc: '2026-10-27T07:40:31Z' },
  { ...privacyEvidence, schema_version: 'unknown' },
]) {
  assert.throws(() => evaluateRecoveredServingAdmission({
    restoreEvidence, privacyEvidence: badPrivacy,
  }));
}
for (const badPrivacy of [
  { ...privacyEvidence, authoritative_coverage_through: '2026-10-27T07:40:29Z' },
  { ...privacyEvidence, second_identical_replay: 'not_proven' },
  { ...privacyEvidence, output_contains_identifiers: true },
]) {
  const result = evaluateRecoveredServingAdmission({
    restoreEvidence, privacyEvidence: badPrivacy,
  });
  assert.equal(result.serviceResumptionAllowed, false);
  assert.equal(result.boundedPrivacyReplayProven, false);
}
const forgedHosted = evaluateRecoveredServingAdmission({
  restoreEvidence: { ...restoreEvidence, provider_managed_data_full_restore: true },
  privacyEvidence,
});
assert.equal(forgedHosted.serviceResumptionAllowed, false);
assert.equal(forgedHosted.providerManagedDataFullRestore, false);
assert.equal(forgedHosted.drReady, false);
for (const privateKey of ['subjectId', 'authUserId', 'outboxEventId', 'token', 'refreshToken']) {
  assert.equal(JSON.stringify(withPrivacy).includes(privateKey), false);
}
console.log('PostgreSQL recovered service admission PASS: isolated restore is never a serving cutover; malformed evidence fails closed.');
