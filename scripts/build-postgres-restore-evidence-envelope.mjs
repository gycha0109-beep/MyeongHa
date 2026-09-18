import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const ENVELOPE_VERSION = 'myeongha-postgres-isolated-restore-evidence-envelope-v1';
const RESTORE_SCHEMA = 'myeongha-postgres-isolated-restore-drill-v1';
const BACKUP_MANIFEST_SCHEMA = 'myeongha-postgres-backup-artifact-v1';
const SHA_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const ARTIFACT_NAME_RE = /^myeongha-postgres-[0-9]{8}T[0-9]{6}Z$/;
const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

function fail(message) {
  throw new Error(`PostgreSQL restore evidence envelope: ${message}`);
}

function requireObject(value, name) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${name} must be an object`);
  }
  return value;
}

function requireString(value, name) {
  if (typeof value !== 'string' || value.length === 0) fail(`${name} must be a non-empty string`);
  return value;
}

function requireUtc(value, name) {
  const text = requireString(value, name);
  if (!UTC_RE.test(text) || !Number.isFinite(Date.parse(text))) {
    fail(`${name} must be canonical UTC YYYY-MM-DDTHH:MM:SSZ`);
  }
  return { text, epochSeconds: Math.floor(Date.parse(text) / 1000) };
}

function requirePositiveRunId(value) {
  const text = String(value);
  if (!/^[1-9][0-9]*$/.test(text)) fail('backupRunId must be a positive integer string');
  return text;
}

function requireExact(value, expected, name) {
  if (value !== expected) fail(`${name} must equal ${expected}`);
}

export function buildRestoreEvidenceEnvelope(input) {
  const restoreEvidence = requireObject(input.restoreEvidence, 'restoreEvidence');
  const backupManifest = requireObject(input.backupManifest, 'backupManifest');

  requireExact(restoreEvidence.schema_version, RESTORE_SCHEMA, 'restoreEvidence.schema_version');
  requireExact(backupManifest.schema_version, BACKUP_MANIFEST_SCHEMA, 'backupManifest.schema_version');
  requireExact(
    restoreEvidence.restore_target,
    'github-actions-loopback-supabase-postgres',
    'restoreEvidence.restore_target',
  );
  requireExact(
    restoreEvidence.privacy_reconciliation,
    'not_exercised_by_this_workflow',
    'restoreEvidence.privacy_reconciliation',
  );
  requireExact(restoreEvidence.dr_ready, false, 'restoreEvidence.dr_ready');

  const projectRef = requireString(restoreEvidence.project_ref, 'restoreEvidence.project_ref');
  requireExact(backupManifest.project_ref, projectRef, 'backupManifest.project_ref');

  const sourceSha = requireString(restoreEvidence.source_sha, 'restoreEvidence.source_sha');
  if (!SHA_RE.test(sourceSha)) fail('restoreEvidence.source_sha must be a 40-character lowercase Git SHA');
  requireExact(backupManifest.source_sha, sourceSha, 'backupManifest.source_sha');

  const restoreStarted = requireUtc(
    restoreEvidence.restore_started_at_utc,
    'restoreEvidence.restore_started_at_utc',
  );
  const restoreCompleted = requireUtc(
    restoreEvidence.restore_completed_at_utc,
    'restoreEvidence.restore_completed_at_utc',
  );
  if (restoreCompleted.epochSeconds < restoreStarted.epochSeconds) {
    fail('restore completion cannot precede restore start');
  }
  const measuredRestoreDuration = restoreCompleted.epochSeconds - restoreStarted.epochSeconds;
  if (
    !Number.isInteger(restoreEvidence.isolated_restore_validation_duration_seconds) ||
    restoreEvidence.isolated_restore_validation_duration_seconds < 0 ||
    restoreEvidence.isolated_restore_validation_duration_seconds !== measuredRestoreDuration
  ) {
    fail('isolated restore duration must equal restore completed_at - started_at');
  }

  const backupRunId = requirePositiveRunId(input.backupRunId);
  const backupCompleted = requireUtc(backupManifest.created_at_utc, 'backupManifest.created_at_utc');
  const incidentReference = requireUtc(input.incidentReferenceUtc, 'incidentReferenceUtc');
  if (incidentReference.epochSeconds < backupCompleted.epochSeconds) {
    fail('incidentReferenceUtc cannot precede the selected backup completion point');
  }
  if (incidentReference.epochSeconds > restoreStarted.epochSeconds) {
    fail('incidentReferenceUtc cannot be later than the restore start time');
  }
  const syntheticDataLossWindowSeconds =
    incidentReference.epochSeconds - backupCompleted.epochSeconds;

  const sourceArtifactName = requireString(input.sourceArtifactName, 'sourceArtifactName');
  if (!ARTIFACT_NAME_RE.test(sourceArtifactName)) {
    fail('sourceArtifactName must match the governed PostgreSQL backup artifact naming contract');
  }
  const sourceArtifactExpiresAt = requireUtc(
    input.sourceArtifactExpiresAt,
    'sourceArtifactExpiresAt',
  );
  if (sourceArtifactExpiresAt.epochSeconds <= backupCompleted.epochSeconds) {
    fail('sourceArtifactExpiresAt must be after the selected backup completion point');
  }

  const encryptedSha256 = requireString(
    backupManifest.encrypted_sha256,
    'backupManifest.encrypted_sha256',
  );
  if (!SHA256_RE.test(encryptedSha256)) {
    fail('backupManifest.encrypted_sha256 must be 64 lowercase hex characters');
  }
  const archiveName = requireString(backupManifest.archive_name, 'backupManifest.archive_name');
  if (archiveName !== `${sourceArtifactName}.tar.gz.enc`) {
    fail('backupManifest.archive_name must match the selected governed artifact name');
  }

  for (const key of [
    'evidence_envelope_version',
    'backup_workflow_run_id',
    'backup_completed_at_utc',
    'incident_reference_utc',
    'synthetic_data_loss_window_seconds',
    'source_artifact_name',
    'source_artifact_expires_at',
    'source_archive_name',
    'source_encrypted_sha256',
  ]) {
    if (Object.prototype.hasOwnProperty.call(restoreEvidence, key)) {
      fail(`restoreEvidence already contains enrichment key ${key}; refusing overwrite`);
    }
  }

  return Object.freeze({
    ...restoreEvidence,
    evidence_envelope_version: ENVELOPE_VERSION,
    backup_workflow_run_id: backupRunId,
    backup_completed_at_utc: backupCompleted.text,
    incident_reference_utc: incidentReference.text,
    synthetic_data_loss_window_seconds: syntheticDataLossWindowSeconds,
    source_artifact_name: sourceArtifactName,
    source_artifact_expires_at: sourceArtifactExpiresAt.text,
    source_archive_name: archiveName,
    source_encrypted_sha256: encryptedSha256,
  });
}

function parseCliArgs(argv) {
  const values = {};
  const allowed = new Set([
    'restore-evidence',
    'backup-manifest',
    'output',
    'backup-run-id',
    'incident-reference-utc',
    'source-artifact-name',
    'source-artifact-expires-at',
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key?.startsWith('--')) fail(`unexpected CLI argument: ${key ?? ''}`);
    const name = key.slice(2);
    if (!allowed.has(name)) fail(`unsupported CLI argument: ${key}`);
    if (values[name] !== undefined) fail(`duplicate CLI argument: ${key}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) fail(`missing value for ${key}`);
    values[name] = value;
    index += 1;
  }
  for (const name of allowed) {
    if (!values[name]) fail(`--${name} is required`);
  }
  return values;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const [restoreEvidence, backupManifest] = await Promise.all([
    readFile(args['restore-evidence'], 'utf8').then(JSON.parse),
    readFile(args['backup-manifest'], 'utf8').then(JSON.parse),
  ]);
  const envelope = buildRestoreEvidenceEnvelope({
    restoreEvidence,
    backupManifest,
    backupRunId: args['backup-run-id'],
    incidentReferenceUtc: args['incident-reference-utc'],
    sourceArtifactName: args['source-artifact-name'],
    sourceArtifactExpiresAt: args['source-artifact-expires-at'],
  });
  await writeFile(args.output, `${JSON.stringify(envelope, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  await main();
}
