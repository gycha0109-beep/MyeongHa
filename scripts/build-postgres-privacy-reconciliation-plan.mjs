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
const RECONCILIATION_DO_DELIMITER = '$myeongha_privacy_reconcile$';

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function uuid(value) {
  return `${sqlLiteral(value)}::uuid`;
}

function text(value) {
  return `${sqlLiteral(value)}::text`;
}

const EVENT_SPECS = Object.freeze({
  ACCOUNT_DELETION_STARTED: {
    keys: ['deletionJobId', 'outboxEventId', 'requestDedupeKey', 'subjectId'],
    call(event) {
      return `public.cmd_start_account_deletion_v1(${[
        uuid(event.subjectId),
        uuid(event.deletionJobId),
        text(event.requestDedupeKey),
        uuid(event.outboxEventId),
      ].join(', ')})`;
    },
    terminal(event) {
      return [
        `exists (select 1 from public.subjects s where s.id = ${uuid(event.subjectId)} and s.status = 'deletion_pending')`,
        `exists (select 1 from public.data_deletion_jobs dj where dj.id = ${uuid(event.deletionJobId)} and dj.subject_id = ${uuid(event.subjectId)} and dj.scope = 'account' and dj.request_dedupe_key = ${text(event.requestDedupeKey)} and dj.status = 'running')`,
        `exists (select 1 from public.outbox_events oe where oe.id = ${uuid(event.outboxEventId)} and oe.aggregate_type = 'data_deletion_job' and oe.aggregate_id = ${text(event.deletionJobId)} and oe.event_type = 'ACCOUNT_DELETION_STARTED' and oe.dedupe_key = 'account-delete-start-v1')`,
        `not exists (select 1 from public.share_artifacts sa where sa.subject_id = ${uuid(event.subjectId)} and sa.status = 'active')`,
        `not exists (select 1 from public.device_installations di where di.subject_id = ${uuid(event.subjectId)} and di.revoked_at is null)`,
        `not exists (select 1 from public.notifications n where n.subject_id = ${uuid(event.subjectId)} and n.status in ('queued', 'ready'))`,
      ].join(' and ');
    },
  },
  SHARE_ARTIFACT_REVOKED: {
    keys: ['shareArtifactId', 'subjectId'],
    call(event) {
      return `public.cmd_revoke_share_artifact_v1(${uuid(event.subjectId)}, ${uuid(event.shareArtifactId)})`;
    },
    terminal(event) {
      return `exists (select 1 from public.share_artifacts sa where sa.id = ${uuid(event.shareArtifactId)} and sa.subject_id = ${uuid(event.subjectId)} and sa.status in ('revoked', 'expired'))`;
    },
  },
  DEVICE_INSTALLATION_REVOKED: {
    keys: ['installationId', 'subjectId'],
    call(event) {
      return `public.cmd_revoke_device_installation_v1(${uuid(event.subjectId)}, ${uuid(event.installationId)})`;
    },
    terminal(event) {
      return `exists (select 1 from public.device_installations di where di.id = ${uuid(event.installationId)} and di.subject_id = ${uuid(event.subjectId)} and di.revoked_at is not null)`;
    },
  },
  MEMORY_ITEM_REVOKED: {
    keys: ['memoryItemId', 'subjectId'],
    call(event) {
      return `public.cmd_revoke_memory_item_v1(${uuid(event.subjectId)}, ${uuid(event.memoryItemId)})`;
    },
    terminal(event) {
      return `exists (select 1 from public.memory_items mi where mi.id = ${uuid(event.memoryItemId)} and mi.subject_id = ${uuid(event.subjectId)} and mi.revoked_at is not null)`;
    },
  },
  LIFE_FACT_REVOKED: {
    keys: ['lifeFactId', 'subjectId'],
    call(event) {
      return `public.cmd_revoke_life_fact_v1(${uuid(event.subjectId)}, ${uuid(event.lifeFactId)})`;
    },
    terminal(event) {
      return `exists (select 1 from public.life_facts lf where lf.id = ${uuid(event.lifeFactId)} and lf.subject_id = ${uuid(event.subjectId)} and lf.revoked_at is not null)`;
    },
  },
  MEMORY_CHARACTER_GRANT_REVOKED: {
    keys: ['characterId', 'memoryItemId', 'subjectId'],
    call(event) {
      return `public.cmd_revoke_memory_character_grant_v1(${uuid(event.subjectId)}, ${uuid(event.memoryItemId)}, ${text(event.characterId)})`;
    },
    terminal(event) {
      return `exists (select 1 from public.record_access_grants g where g.subject_id = ${uuid(event.subjectId)} and g.memory_item_id = ${uuid(event.memoryItemId)} and g.grantee_character_id = ${text(event.characterId)} and g.revoked_at is not null)`;
    },
  },
  LIFE_FACT_CHARACTER_GRANT_REVOKED: {
    keys: ['characterId', 'lifeFactId', 'subjectId'],
    call(event) {
      return `public.cmd_revoke_life_fact_character_grant_v1(${uuid(event.subjectId)}, ${uuid(event.lifeFactId)}, ${text(event.characterId)})`;
    },
    terminal(event) {
      return `exists (select 1 from public.record_access_grants g where g.subject_id = ${uuid(event.subjectId)} and g.life_fact_id = ${uuid(event.lifeFactId)} and g.grantee_character_id = ${text(event.characterId)} and g.revoked_at is not null)`;
    },
  },
  CHARACTER_RECORDS_FORGOTTEN: {
    keys: ['characterId', 'subjectId'],
    call(event) {
      return `public.cmd_forget_character_records_v1(${uuid(event.subjectId)}, ${text(event.characterId)})`;
    },
    terminal(event) {
      return `not exists (select 1 from public.record_access_grants g where g.subject_id = ${uuid(event.subjectId)} and g.grantee_character_id = ${text(event.characterId)} and g.revoked_at is null)`;
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
  if (value.includes('\u0000')) fail(`${field} must not contain a NUL byte`);
  if (value.includes(RECONCILIATION_DO_DELIMITER)) {
    fail(`${field} contains a reserved reconciliation SQL delimiter`);
  }
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

function commandCount(call) {
  return `select count(*) as applied_event_row_count from ${call};`;
}

function terminalValidation(predicate, message) {
  return [
    'do $myeongha_privacy_reconcile$',
    'begin',
    `  if not (${predicate}) then`,
    `    raise exception using errcode = '23514', message = ${sqlLiteral(message)};`,
    '  end if;',
    'end',
    '$myeongha_privacy_reconcile$;',
  ].join('\n');
}

function deletionAwareReplay(event, spec) {
  const call = spec.call(event);
  return [
    'do $myeongha_privacy_reconcile$',
    'declare',
    '  v_subject_status text;',
    'begin',
    `  select s.status into v_subject_status from public.subjects s where s.id = ${uuid(event.subjectId)} for update;`,
    "  if v_subject_status = 'active' then",
    `    perform 1 from ${call};`,
    "  elsif v_subject_status = 'deletion_pending' then",
    `    if not (${spec.terminal(event)}) then`,
    "      raise exception using errcode = '23514', message = 'privacy reconciliation terminal state is missing for deletion-pending subject';",
    '    end if;',
    '  else',
    "    raise exception using errcode = '23514', message = 'privacy reconciliation requires active or deletion-pending subject';",
    '  end if;',
    'end',
    '$myeongha_privacy_reconcile$;',
    'select 1::bigint as applied_event_row_count;',
  ].join('\n');
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

  requireUuid(manifest.manifestId, 'manifestId');
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

  const accountDeletionEvents = events.filter(
    (event) => event.type === 'ACCOUNT_DELETION_STARTED',
  );
  const deletionSubjects = new Set();
  for (const event of accountDeletionEvents) {
    if (deletionSubjects.has(event.subjectId)) {
      fail(`multiple ACCOUNT_DELETION_STARTED events for subject ${event.subjectId}`);
    }
    deletionSubjects.add(event.subjectId);
  }

  const eventTypeCounts = {};
  const statements = [];
  for (const event of events) {
    eventTypeCounts[event.type] = (eventTypeCounts[event.type] ?? 0) + 1;
    const spec = EVENT_SPECS[event.type];
    if (event.type === 'ACCOUNT_DELETION_STARTED') {
      statements.push(commandCount(spec.call(event)));
      statements.push(
        terminalValidation(
          spec.terminal(event),
          'account deletion start replay did not establish all required revocation postconditions',
        ),
      );
      continue;
    }
    if (deletionSubjects.has(event.subjectId)) {
      statements.push(deletionAwareReplay(event, spec));
      continue;
    }
    statements.push(commandCount(spec.call(event)));
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
    backupRunId,
    eventCount: events.length,
    eventTypeCounts,
    privacyReconciliationScope: 'revocation-and-account-deletion-start-only',
    replayIdempotency: 'transactional-terminal-state-validated',
    accountDeletionFinalization: 'runtime-implemented-finalization-executed-separately',
    commerceRetentionDecision: 'decided-p5y-nine-table-baseline',
    durableSourceAuthority: 'captured-window-authority-validated-separately',
    outputContainsIdentifiers: false,
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
