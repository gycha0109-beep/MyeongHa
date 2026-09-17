import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PRIVACY_RECONCILIATION_MANIFEST_SCHEMA_V1 =
  'myeongha-postgres-privacy-reconciliation-manifest-v1';
export const PRIVACY_RECONCILIATION_PLAN_SCHEMA_V1 =
  'myeongha-postgres-privacy-reconciliation-plan-v1';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_RE = /^sha256:[0-9a-f]{64}$/i;

const EVENT_SPECS = Object.freeze({
  ACCOUNT_DELETION_STARTED: {
    keys: ['deletionJobId', 'outboxEventId', 'requestDedupeKey', 'subjectId'],
    sql(event) {
      return commandCount(
        'public.cmd_start_account_deletion_v1',
        [
          uuid(event.subjectId),
          uuid(event.deletionJobId),
          text(event.requestDedupeKey),
          uuid(event.outboxEventId),
        ],
      );
    },
  },
  SHARE_ARTIFACT_REVOKED: {
    keys: ['shareArtifactId', 'subjectId'],
    sql(event) {
      return commandCount('public.cmd_revoke_share_artifact_v1', [
        uuid(event.subjectId),
        uuid(event.shareArtifactId),
      ]);
    },
  },
  DEVICE_INSTALLATION_REVOKED: {
    keys: ['installationId', 'subjectId'],
    sql(event) {
      return commandCount('public.cmd_revoke_device_installation_v1', [
        uuid(event.subjectId),
        uuid(event.installationId),
      ]);
    },
  },
  MEMORY_ITEM_REVOKED: {
    keys: ['memoryItemId', 'subjectId'],
    sql(event) {
      return commandCount('public.cmd_revoke_memory_item_v1', [
        uuid(event.subjectId),
        uuid(event.memoryItemId),
      ]);
    },
  },
  LIFE_FACT_REVOKED: {
    keys: ['lifeFactId', 'subjectId'],
    sql(event) {
      return commandCount('public.cmd_revoke_life_fact_v1', [
        uuid(event.subjectId),
        uuid(event.lifeFactId),
      ]);
    },
  },
  MEMORY_CHARACTER_GRANT_REVOKED: {
    keys: ['characterId', 'memoryItemId', 'subjectId'],
    sql(event) {
      return commandCount('public.cmd_revoke_memory_character_grant_v1', [
        uuid(event.subjectId),
        uuid(event.memoryItemId),
        text(event.characterId),
      ]);
    },
  },
  LIFE_FACT_CHARACTER_GRANT_REVOKED: {
    keys: ['characterId', 'lifeFactId', 'subjectId'],
    sql(event) {
      return commandCount('public.cmd_revoke_life_fact_character_grant_v1', [
        uuid(event.subjectId),
        uuid(event.lifeFactId),
        text(event.characterId),
      ]);
    },
  },
  CHARACTER_RECORDS_FORGOTTEN: {
    keys: ['characterId', 'subjectId'],
    sql(event) {
      return commandCount('public.cmd_forget_character_records_v1', [
        uuid(event.subjectId),
        text(event.characterId),
      ]);
    },
  },
});

function fail(message) {
  throw new Error(`Privacy reconciliation manifest rejected: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value, field) {
  if (!isRecord(value)) fail(`${field} must be an object`);
  return value;
}

function requireString(value, field, maxLength = 256) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(`${field} must be a non-empty string`);
  }
  if (value.length > maxLength) fail(`${field} exceeds ${maxLength} characters`);
  return value;
}

function requireUuid(value, field) {
  const textValue = requireString(value, field, 36);
  if (!UUID_RE.test(textValue)) fail(`${field} must be a UUID`);
  return textValue.toLowerCase();
}

function requireInstant(value, field) {
  const textValue = requireString(value, field, 64);
  const milliseconds = Date.parse(textValue);
  if (!Number.isFinite(milliseconds)) fail(`${field} must be an ISO-8601 timestamp`);
  return { text: new Date(milliseconds).toISOString(), milliseconds };
}

function requirePositiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0) fail(`${field} must be a positive integer`);
  return value;
}

function assertExactKeys(record, allowedKeys, field) {
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));
  if (unknown.length > 0) fail(`${field} contains unsupported fields: ${unknown.join(', ')}`);
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function uuid(value) {
  return `${sqlLiteral(value)}::uuid`;
}

function text(value) {
  return `${sqlLiteral(value)}::text`;
}

function commandCount(name, args) {
  return `select count(*) as applied_event_row_count from ${name}(\n  ${args.join(',\n  ')}\n);`;
}

function normalizeEvent(rawEvent, index, backupCompletedAt, incidentReferenceUtc) {
  const event = requireRecord(rawEvent, `events[${index}]`);
  const baseKeys = ['eventId', 'sequence', 'occurredAt', 'type'];
  const type = requireString(event.type, `events[${index}].type`, 80);
  const spec = EVENT_SPECS[type];
  if (!spec) fail(`events[${index}].type is unsupported: ${type}`);
  assertExactKeys(event, [...baseKeys, ...spec.keys], `events[${index}]`);

  const eventId = requireUuid(event.eventId, `events[${index}].eventId`);
  const sequence = requirePositiveInteger(event.sequence, `events[${index}].sequence`);
  const occurredAt = requireInstant(event.occurredAt, `events[${index}].occurredAt`);
  if (occurredAt.milliseconds <= backupCompletedAt.milliseconds) {
    fail(`events[${index}].occurredAt must be after backupCompletedAt`);
  }
  if (occurredAt.milliseconds > incidentReferenceUtc.milliseconds) {
    fail(`events[${index}].occurredAt must not exceed incidentReferenceUtc`);
  }

  const normalized = { eventId, sequence, occurredAt: occurredAt.text, type };
  for (const key of spec.keys) {
    if (key.endsWith('Id') && key !== 'characterId') {
      normalized[key] = requireUuid(event[key], `events[${index}].${key}`);
    } else {
      normalized[key] = requireString(event[key], `events[${index}].${key}`, 256);
    }
  }
  return normalized;
}

export function buildPrivacyReconciliationPlan(rawManifest) {
  const manifest = requireRecord(rawManifest, 'manifest');
  assertExactKeys(
    manifest,
    [
      'schema',
      'manifestId',
      'backupRunId',
      'backupCompletedAt',
      'incidentReferenceUtc',
      'sourceAuthority',
      'sourceDigest',
      'events',
    ],
    'manifest',
  );

  if (manifest.schema !== PRIVACY_RECONCILIATION_MANIFEST_SCHEMA_V1) {
    fail(`schema must equal ${PRIVACY_RECONCILIATION_MANIFEST_SCHEMA_V1}`);
  }

  const manifestId = requireUuid(manifest.manifestId, 'manifestId');
  const backupRunId = requirePositiveInteger(manifest.backupRunId, 'backupRunId');
  const backupCompletedAt = requireInstant(manifest.backupCompletedAt, 'backupCompletedAt');
  const incidentReferenceUtc = requireInstant(manifest.incidentReferenceUtc, 'incidentReferenceUtc');
  if (incidentReferenceUtc.milliseconds < backupCompletedAt.milliseconds) {
    fail('incidentReferenceUtc must be at or after backupCompletedAt');
  }

  requireString(manifest.sourceAuthority, 'sourceAuthority', 256);
  const sourceDigest = requireString(manifest.sourceDigest, 'sourceDigest', 71);
  if (!SHA256_RE.test(sourceDigest)) fail('sourceDigest must be sha256:<64 hex>');

  if (!Array.isArray(manifest.events)) fail('events must be an array');
  if (manifest.events.length > 10000) fail('events exceeds the 10000-event safety bound');

  const events = manifest.events.map((event, index) =>
    normalizeEvent(event, index, backupCompletedAt, incidentReferenceUtc),
  );

  const eventIds = new Set();
  const sequences = new Set();
  for (const event of events) {
    if (eventIds.has(event.eventId)) fail(`duplicate eventId: ${event.eventId}`);
    if (sequences.has(event.sequence)) fail(`duplicate sequence: ${event.sequence}`);
    eventIds.add(event.eventId);
    sequences.add(event.sequence);
  }

  events.sort((left, right) => left.sequence - right.sequence);

  const eventTypeCounts = {};
  const statements = [];
  for (const event of events) {
    eventTypeCounts[event.type] = (eventTypeCounts[event.type] ?? 0) + 1;
    statements.push(EVENT_SPECS[event.type].sql(event));
  }

  const sql = [
    'begin;',
    "set local lock_timeout = '5s';",
    "set local statement_timeout = '30s';",
    ...statements,
    'commit;',
    '',
  ].join('\n\n');

  const report = {
    schema: PRIVACY_RECONCILIATION_PLAN_SCHEMA_V1,
    manifestSchema: PRIVACY_RECONCILIATION_MANIFEST_SCHEMA_V1,
    manifestId,
    backupRunId,
    eventCount: events.length,
    eventTypeCounts,
    privacyReconciliationScope: 'revocation-and-account-deletion-start-only',
    accountDeletionFinalization: 'blocked-by-P0-PR-01-and-issue-964',
    commerceRetentionDecision: 'blocked-by-P0-PR-01-and-issue-964',
    durableSourceAuthority: 'supplied-manifest-only-not-proven',
    outputContainsRowPayloads: false,
    drReady: false,
  };

  return { sql, report };
}

function parseCliArgs(argv) {
  const values = {};
  const allowed = new Set(['input', 'output', 'report']);
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
  for (const required of allowed) {
    if (!values[required]) fail(`--${required} is required`);
  }
  return values;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(args.input, 'utf8'));
  const { sql, report } = buildPrivacyReconciliationPlan(manifest);
  await writeFile(args.output, sql, { encoding: 'utf8', mode: 0o600 });
  await writeFile(args.report, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  await main();
}
