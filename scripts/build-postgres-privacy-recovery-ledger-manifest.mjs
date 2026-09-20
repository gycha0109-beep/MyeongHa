import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  PRIVACY_RECONCILIATION_MANIFEST_SCHEMA_V1,
  buildPrivacyReconciliationPlan,
} from './build-postgres-privacy-reconciliation-plan.mjs';

export const PRIVACY_RECOVERY_LEDGER_SOURCE_AUTHORITY_V1 =
  'myeongha-production-postgres-privacy-ledger-v1';
export const PRIVACY_RECOVERY_LEDGER_SUMMARY_SCHEMA_V1 =
  'myeongha-postgres-privacy-recovery-ledger-summary-v1';

const EVENT_TYPES = Object.freeze([
  'ACCOUNT_DELETION_STARTED',
  'SHARE_ARTIFACT_REVOKED',
  'DEVICE_INSTALLATION_REVOKED',
  'MEMORY_ITEM_REVOKED',
  'LIFE_FACT_REVOKED',
  'MEMORY_CHARACTER_GRANT_REVOKED',
  'LIFE_FACT_CHARACTER_GRANT_REVOKED',
]);

function fail(message) {
  throw new Error(`Privacy recovery ledger source rejected: ${message}`);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function deterministicUuid(material) {
  const bytes = Buffer.from(sha256(material).slice(0, 32), 'hex');
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

function requireRecord(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${field} must be an object`);
  }
  return value;
}

function requirePositiveInteger(value, field) {
  const number = typeof value === 'string' ? Number(value) : value;
  if (!Number.isSafeInteger(number) || number <= 0) {
    fail(`${field} must be a positive integer`);
  }
  return number;
}

function requireInstant(value, field) {
  if (typeof value !== 'string' || value.length === 0) fail(`${field} must be a timestamp`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) fail(`${field} must be ISO-8601`);
  return { text: new Date(milliseconds).toISOString(), milliseconds };
}

function requireZeroUnsupported(unsupported) {
  const record = requireRecord(unsupported, 'unsupported');
  const expected = [
    'accountDeletionWithoutExactOutboxCount',
    'nonAccountDeletionJobCount',
    'unsupportedSubjectLifecycleCount',
  ];
  const unknown = Object.keys(record).filter((key) => !expected.includes(key));
  if (unknown.length > 0) fail(`unsupported contains unknown fields: ${unknown.join(', ')}`);
  for (const key of expected) {
    if (!Number.isSafeInteger(record[key]) || record[key] !== 0) {
      fail(`unsupported.${key} must equal 0`);
    }
  }
}

function normalizeRawEvent(raw, index, backupCompletedAt, capturedAt) {
  const event = requireRecord(raw, `events[${index}]`);
  if (!EVENT_TYPES.includes(event.type)) {
    fail(`events[${index}].type is unsupported: ${String(event.type)}`);
  }
  const occurredAt = requireInstant(event.occurredAt, `events[${index}].occurredAt`);
  if (occurredAt.milliseconds <= backupCompletedAt.milliseconds) {
    fail(`events[${index}].occurredAt must be after backup completion`);
  }
  if (occurredAt.milliseconds > capturedAt.milliseconds) {
    fail(`events[${index}].occurredAt must not exceed capturedAt`);
  }
  return { ...event, occurredAt: occurredAt.text };
}

export function buildPrivacyRecoveryLedgerManifest({
  rawSource,
  backupRunId,
  backupCompletedAt,
  capturedAt,
}) {
  const source = requireRecord(rawSource, 'rawSource');
  const allowedTopKeys = new Set(['events', 'unsupported']);
  const unknownTopKeys = Object.keys(source).filter((key) => !allowedTopKeys.has(key));
  if (unknownTopKeys.length > 0) fail(`rawSource contains unsupported fields: ${unknownTopKeys.join(', ')}`);
  if (!Array.isArray(source.events)) fail('events must be an array');
  if (source.events.length > 10000) fail('events exceeds the 10000-event safety bound');
  requireZeroUnsupported(source.unsupported);

  const normalizedBackupRunId = requirePositiveInteger(backupRunId, 'backupRunId');
  const normalizedBackupCompletedAt = requireInstant(backupCompletedAt, 'backupCompletedAt');
  const normalizedCapturedAt = requireInstant(capturedAt, 'capturedAt');
  if (normalizedCapturedAt.milliseconds < normalizedBackupCompletedAt.milliseconds) {
    fail('capturedAt must not precede backupCompletedAt');
  }

  const rows = source.events
    .map((event, index) =>
      normalizeRawEvent(event, index, normalizedBackupCompletedAt, normalizedCapturedAt),
    )
    .sort((left, right) => {
      const byTime = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
      if (byTime !== 0) return byTime;
      return stableJson(left).localeCompare(stableJson(right));
    });

  const sourceDigestHex = sha256(stableJson(rows));
  const sourceDigest = `sha256:${sourceDigestHex}`;
  const manifestId = deterministicUuid(
    [
      'myeongha-privacy-recovery-ledger-manifest-v1',
      normalizedBackupRunId,
      normalizedBackupCompletedAt.text,
      normalizedCapturedAt.text,
      sourceDigest,
    ].join('|'),
  );

  const events = rows.map((event, index) => ({
    eventId: deterministicUuid(
      `myeongha-privacy-recovery-ledger-event-v1|${normalizedBackupRunId}|${stableJson(event)}`,
    ),
    sequence: index + 1,
    ...event,
  }));

  const manifest = {
    schema: PRIVACY_RECONCILIATION_MANIFEST_SCHEMA_V1,
    manifestId,
    backupRunId: normalizedBackupRunId,
    backupCompletedAt: normalizedBackupCompletedAt.text,
    incidentReferenceUtc: normalizedCapturedAt.text,
    sourceAuthority: PRIVACY_RECOVERY_LEDGER_SOURCE_AUTHORITY_V1,
    sourceDigest,
    events,
  };

  const { report } = buildPrivacyReconciliationPlan(manifest);
  const eventTypeCounts = Object.fromEntries(
    EVENT_TYPES.map((type) => [type, events.filter((event) => event.type === type).length]),
  );

  const summary = {
    schema: PRIVACY_RECOVERY_LEDGER_SUMMARY_SCHEMA_V1,
    backupRunId: normalizedBackupRunId,
    backupCompletedAt: normalizedBackupCompletedAt.text,
    capturedAt: normalizedCapturedAt.text,
    sourceDigest,
    eventCount: events.length,
    eventTypeCounts,
    replayPlannerAccepted: report.schema === 'myeongha-postgres-privacy-reconciliation-plan-v1',
    privacyReconciliationScope: report.privacyReconciliationScope,
    sourceAuthorityClass: 'AUTHORITATIVE_CAPTURED_WINDOW_V1',
    authoritativeCoverageThrough: normalizedCapturedAt.text,
    serviceabilityCoverageRule:
      'incident_reference_must_not_exceed_authoritative_coverage_through',
    candidateSourceAuthority: false,
    authoritativePostBackupSource: true,
    authoritativePrivacyReconciliation: false,
    futureSafePrivacyReconciliation: false,
    drReady: false,
  };

  return { manifest, summary };
}

function parseCliArgs(argv) {
  const values = {};
  const allowed = new Set([
    'input',
    'backup-run-id',
    'backup-completed-at',
    'captured-at',
    'manifest',
    'summary',
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
  const rawSource = JSON.parse(await readFile(args.input, 'utf8'));
  const { manifest, summary } = buildPrivacyRecoveryLedgerManifest({
    rawSource,
    backupRunId: args['backup-run-id'],
    backupCompletedAt: args['backup-completed-at'],
    capturedAt: args['captured-at'],
  });
  await writeFile(args.manifest, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await writeFile(args.summary, `${JSON.stringify(summary, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  await main();
}
