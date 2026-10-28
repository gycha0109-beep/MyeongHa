import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RECOVERED_SERVING_ADMISSION_SCHEMA_V1 =
  'myeongha-postgres-recovered-serving-admission-v1';

function reject(reason) {
  throw new Error('Recovered service admission rejected: ' + reason);
}
function record(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    reject(name + ' must be a record');
  }
  return value;
}
function utc(value, name) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString() !== value.replace('Z', '.000Z')) {
    reject(name + ' must be canonical seconds-precision UTC');
  }
  return Date.parse(value);
}
function unique(items) { return [...new Set(items)]; }

export function evaluateRecoveredServingAdmission({ restoreEvidence, privacyEvidence = null }) {
  const restore = record(restoreEvidence, 'restoreEvidence');
  if (restore.schema_version !== 'myeongha-postgres-isolated-restore-drill-v1' ||
      restore.evidence_envelope_version !==
      'myeongha-postgres-isolated-restore-evidence-envelope-v1') {
    reject('restore evidence must be an already-bound governed envelope');
  }
  if (!/^[1-9][0-9]*$/u.test(String(restore.backup_workflow_run_id ?? ''))) {
    reject('governed backup run identity is missing');
  }
  if (restore.dr_ready !== false) {
    reject('restore evidence must not self-assert DR readiness');
  }
  const backup = utc(restore.backup_completed_at_utc, 'backup_completed_at_utc');
  const incident = utc(restore.incident_reference_utc, 'incident_reference_utc');
  if (incident < backup) reject('incident precedes backup');
  const reasons = [];
  if (restore.restore_target !== 'github-actions-loopback-supabase-postgres') {
    reject('this admission evaluator accepts loopback drills only, not a serving target');
  }
  reasons.push('ISOLATED_POSTGRES_NOT_HOSTED_SERVICE');
  if (restore.provider_managed_data_full_restore !== true) {
    reasons.push('HOSTED_AUTH_STORAGE_FULL_RESTORE_NOT_PROVEN');
  }
  // Even a forged positive boolean in a loopback report does not turn the
  // disposable PostgreSQL harness into a restored Hosted Auth/Storage service.
  reasons.push('HOSTED_LOGIN_SESSION_TOKEN_AND_STORAGE_BYTES_NOT_TESTED');
  reasons.push('CURRENT_LIVE_SCHEMA_EQUIVALENCE_NOT_PROVEN');
  reasons.push('WHOLE_SERVICE_RPO_RTO_NOT_PROVEN');

  let boundedPrivacyProof = false;
  if (privacyEvidence !== null) {
    const privacy = record(privacyEvidence, 'privacyEvidence');
    if (privacy.schema_version !==
        'myeongha-postgres-restored-db-authoritative-privacy-reconciliation-v1') {
      reject('privacy evidence has unsupported provenance');
    }
    if (privacy.backup_workflow_run_id !== Number(restore.backup_workflow_run_id) ||
        privacy.incident_reference_utc !== restore.incident_reference_utc) {
      reject('authoritative privacy proof is not bound to this exact backup and incident');
    }
    const coverage = utc(privacy.authoritative_coverage_through, 'authoritative_coverage_through');
    boundedPrivacyProof = privacy.authoritative_privacy_reconciliation === true &&
      privacy.authoritative_source_scope === 'captured-window-only' &&
      privacy.replay_result === 'pass' &&
      privacy.second_identical_replay === 'idempotent-pass' &&
      privacy.completion_replay === 'idempotent-pass' &&
      privacy.output_contains_identifiers === false &&
      privacy.output_contains_row_payloads === false &&
      privacy.dr_ready === false &&
      coverage >= incident;
    if (!boundedPrivacyProof) reasons.push('BOUNDED_PRIVACY_REPLAY_NOT_PROVEN');
  } else {
    reasons.push('BOUNDED_PRIVACY_REPLAY_NOT_PROVEN');
  }
  reasons.push('INDEPENDENT_INCIDENT_TIME_PRIVACY_CONTINUITY_NOT_PROVEN');
  reasons.push('S8_HOSTED_SERVING_E2E_NOT_PROVEN');

  return Object.freeze({
    schema: RECOVERED_SERVING_ADMISSION_SCHEMA_V1,
    backupWorkflowRunId: Number(restore.backup_workflow_run_id),
    incidentReferenceUtc: restore.incident_reference_utc,
    recoveryTarget: 'isolated-postgresql-loopback',
    boundedPrivacyReplayProven: boundedPrivacyProof,
    serviceResumptionAllowed: false,
    gate: 'BLOCKED',
    blockers: unique(reasons),
    providerManagedDataFullRestore: false,
    futureSafePrivacyReconciliation: false,
    drReady: false,
    outputContainsIdentifiers: false,
  });
}

async function main(argv) {
  const [restoreFlag, restorePath, outputFlag, outputPath, ...rest] = argv;
  if (restoreFlag !== '--restore-evidence' || !restorePath ||
      outputFlag !== '--output' || !outputPath) {
    reject('expected --restore-evidence <path> --output <path> [--privacy-evidence <path>] [--require-serving]');
  }
  let privacyPath = null;
  let requireServing = false;
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '--privacy-evidence' && !privacyPath && rest[i + 1]) {
      privacyPath = rest[++i];
    } else if (rest[i] === '--require-serving' && !requireServing) {
      requireServing = true;
    } else {
      reject('unsupported or duplicate CLI argument');
    }
  }
  const restoreEvidence = JSON.parse(await readFile(restorePath, 'utf8'));
  const privacyEvidence = privacyPath ?
    JSON.parse(await readFile(privacyPath, 'utf8')) : null;
  const report = evaluateRecoveredServingAdmission({ restoreEvidence, privacyEvidence });
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n',
    { encoding: 'utf8', mode: 0o600 });
  if (requireServing && !report.serviceResumptionAllowed) {
    reject('recovered serving is BLOCKED; an isolated restore is not a Hosted cutover proof');
  }
  if (report.gate !== 'BLOCKED' || report.serviceResumptionAllowed || report.drReady) {
    reject('isolated recovery guard unexpectedly admitted serving');
  }
  console.log('Recovered service admission: BLOCKED (loopback restore is non-serving evidence).');
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) await main(process.argv.slice(2));
