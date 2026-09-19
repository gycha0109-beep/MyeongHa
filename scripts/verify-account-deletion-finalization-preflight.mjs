import { readdir, readFile } from 'node:fs/promises';

const migrationPath = 'supabase/migrations/1140_account_deletion_finalization_preflight.sql';
const policyPath = 'docs/operations/ACCOUNT_DELETION_FINALIZATION_POLICY_V1.json';
const docPath = 'docs/operations/ACCOUNT_DELETION_FINALIZATION_PREFLIGHT_V1.md';

const [migration, policyText, doc, migrationNames] = await Promise.all([
  readFile(migrationPath, 'utf8'),
  readFile(policyPath, 'utf8'),
  readFile(docPath, 'utf8'),
  readdir('supabase/migrations'),
]);

const policy = JSON.parse(policyText);

function fail(message) {
  throw new Error('Account deletion finalization preflight rejected: ' + message);
}

const migrationFiles = migrationNames
  .filter((name) => /^\d+_.*\.sql$/.test(name))
  .sort();

const producerFiles = [];
for (const name of migrationFiles) {
  const text = await readFile('supabase/migrations/' + name, 'utf8');
  if (/insert\s+into\s+public\.outbox_events\b/i.test(text)) producerFiles.push(name);
}

const expectedProducerFiles = [
  '0220_chat_attempt_commit_commands.sql',
  '0260_reading_transport_commands.sql',
  '0290_account_deletion_start_command.sql',
  '1080_entitlement_effect_apply_v1.sql',
];

if (JSON.stringify(producerFiles) !== JSON.stringify(expectedProducerFiles)) {
  fail(
    'outbox producer inventory drifted expected=' +
      JSON.stringify(expectedProducerFiles) +
      ' actual=' +
      JSON.stringify(producerFiles),
  );
}

for (const [path, aggregateType] of [
  ['supabase/migrations/0220_chat_attempt_commit_commands.sql', 'chat_turn'],
  ['supabase/migrations/0260_reading_transport_commands.sql', 'reading'],
  ['supabase/migrations/0290_account_deletion_start_command.sql', 'data_deletion_job'],
  ['supabase/migrations/1080_entitlement_effect_apply_v1.sql', 'entitlement'],
]) {
  const text = await readFile(path, 'utf8');
  const outboxInsertCount = (text.match(/insert\s+into\s+public\.outbox_events\b/gi) || []).length;
  if (outboxInsertCount !== 1) {
    fail(path + ' expected exactly one governed outbox insert, found ' + outboxInsertCount);
  }
  if (!text.includes("'" + aggregateType + "'")) {
    fail(path + ' lost expected aggregate type ' + aggregateType);
  }
  if (!migration.includes("oe.aggregate_type = '" + aggregateType + "'")) {
    fail('preflight does not associate current outbox aggregate type ' + aggregateType);
  }
}

for (const fragment of [
  'internal_account_deletion_finalization_preflight_v1',
  "s.kind = 'member'",
  "s.status = 'deletion_pending'",
  "dj.scope = 'account' and dj.status = 'running'",
  's.auth_user_id is not null',
  "oe.payload_jsonb ->> 'subjectId' = p_subject_id::text",
  "lo.event_type = 'ACCOUNT_DELETION_STARTED'",
  'p_lock_owner text',
  "lo.status = 'processing'",
  'lo.lock_owner = btrim(p_lock_owner)',
  'lo.lease_expires_at > clock_timestamp()',
  "lo.status <> 'processed'",
  'r.blocking_outbox_count = 0',
  'revoke all on function public.internal_account_deletion_finalization_preflight_v1(uuid, uuid, text) from public;',
]) {
  if (!migration.includes(fragment)) fail('migration missing required fail-closed fragment: ' + fragment);
}

for (const forbidden of [
  /\bdelete\s+from\b/i,
  /\bupdate\s+public\./i,
  /\binsert\s+into\s+public\./i,
  /\btruncate\b/i,
  /\bstatus\s*=\s*'deleted'/i,
]) {
  if (forbidden.test(migration)) fail('read-only preflight contains destructive/mutating SQL: ' + forbidden);
}

if (policy.decisionId !== 'P0-PR-01' || policy.decisionStatus !== 'DECIDED') {
  fail('approved P0-PR-01 authority is not DECIDED');
}
if (policy.destructiveRuntimeAuthorized !== false) {
  fail('preflight must not promote destructiveRuntimeAuthorized');
}
if (policy.authoritativePrivacyReconciliation !== false || policy.drReady !== false) {
  fail('preflight must not promote privacy reconciliation or DR readiness');
}

const normalizedDoc = doc.replace(/`/g, '').replace(/\s+/g, ' ');

for (const fragment of [
  'READ-ONLY WORKER HANDOFF PREFLIGHT',
  'destructiveRuntimeAuthorized = false',
  'hosted Auth deletion is external to PostgreSQL',
  'must re-check the same invariants under the Subject row lock',
  'subjects_member_auth_required_check',
  'keep subjects.auth_user_id until hosted Auth cleanup succeeds',
  'subjects_auth_user_fk ON DELETE SET NULL is now legal because status=deleted',
  'its lock_owner exactly matches the calling worker',
  'same lock_owner',
  'chat_turn',
  'reading',
  'data_deletion_job',
  'entitlement',
  'payload_jsonb.subjectId',
]) {
  if (!normalizedDoc.includes(fragment)) fail('documentation missing boundary: ' + fragment);
}

const dbFinalizerStep = normalizedDoc.indexOf('-> DB destructive finalizer');
const hostedAuthDeleteStep = normalizedDoc.indexOf('-> hosted Auth admin delete');
if (dbFinalizerStep < 0 || hostedAuthDeleteStep < 0 || dbFinalizerStep >= hostedAuthDeleteStep) {
  fail('worker sequence must commit DB deleted-state transition before hosted Auth deletion');
}

console.log(
  'Account deletion finalization preflight PASS: current outbox producer inventory is covered, DB-local handoff is read-only/fail-closed, and destructive runtime / privacy reconciliation / DR authority remain false.',
);
