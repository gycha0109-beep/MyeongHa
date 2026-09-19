// Public helper EXECUTE remains closed; immutable-trigger exceptions are owner-bound inline.
// Synced with main authority frontier 0b92c8d13727a002a493e093ce50f16c27bb10f2.
import { readFile } from 'node:fs/promises';

function fail(message) {
  throw new Error('Account deletion DB finalizer verifier rejected: ' + message);
}

const [migration, policyText, finalPolicyText] = await Promise.all([
  readFile('supabase/migrations/1171_account_deletion_db_finalizer.sql', 'utf8'),
  readFile('docs/operations/ACCOUNT_DELETION_DISPOSITION_POLICY_V1.json', 'utf8'),
  readFile('docs/operations/ACCOUNT_DELETION_FINALIZATION_POLICY_V1.json', 'utf8'),
]);

const policy = JSON.parse(policyText);
const finalPolicy = JSON.parse(finalPolicyText);

const expectedDelete = policy.tableDispositions
  .filter((entry) => entry.disposition === 'DELETE')
  .map((entry) => entry.table)
  .sort();
const expectedAnonymize = policy.tableDispositions
  .filter((entry) => entry.disposition === 'ANONYMIZE')
  .map((entry) => entry.table)
  .sort();
const expectedRetain = policy.tableDispositions
  .filter((entry) => entry.disposition === 'RETAIN')
  .map((entry) => entry.table)
  .sort();

if (expectedDelete.length !== 36 || expectedAnonymize.length !== 4 || expectedRetain.length !== 9) {
  fail('approved disposition cardinality drifted');
}

const deleteMatches = [...migration.matchAll(/delete\s+from\s+public\.([a-z0-9_]+)/gi)]
  .map((match) => match[1])
  .sort();

const uniqueDeletes = [...new Set(deleteMatches)].sort();
if (JSON.stringify(uniqueDeletes) !== JSON.stringify(expectedDelete)) {
  fail(
    'DELETE target set mismatch expected=' + expectedDelete.join(',') +
    ' actual=' + uniqueDeletes.join(',')
  );
}

for (const table of expectedRetain) {
  const destructive = new RegExp(
    '(?:delete\\s+from|truncate\\s+(?:table\\s+)?|drop\\s+table)\\s+public\\.' + table + '\\b',
    'i',
  );
  if (destructive.test(migration)) fail('RETAIN table has destructive SQL: ' + table);
}

for (const table of expectedAnonymize) {
  const update = new RegExp('update\\s+public\\.' + table + '\\b', 'i');
  if (!update.test(migration)) fail('ANONYMIZE table lacks explicit update: ' + table);
}

for (const fragment of [
  "set status = 'deleted'",
  "finalization_policy_version = 'account-deletion-finalization-v1'",
  "internal_account_deletion_finalization_preflight_v1",
  "myeongha.account_deletion_finalizer_subject_id",
  "pg_catalog.pg_get_userbyid",
  "pg_catalog.current_setting('myeongha.account_deletion_finalizer_subject_id', true)",
  "security definer",
  "account_deletion_finalizer_replay_lease_mismatch",
  "alter column guest_session_id drop not null",
  "update public.commerce_account_links",
  "set constraints all immediate",
  "revoke all on function public.internal_finalize_account_deletion_db_v1(uuid, uuid, text) from public",
  "'anon', 'authenticated', 'service_role', 'myeongha_api_executor'",
]) {
  if (!migration.toLowerCase().includes(fragment.toLowerCase())) {
    fail('migration missing boundary: ' + fragment);
  }
}

if (/delete\s+from\s+auth\.users/i.test(migration)) {
  fail('DB finalizer must not delete hosted Auth users');
}
if (/set\s+auth_user_id\s*=\s*null/i.test(migration)) {
  fail('DB finalizer must retain auth_user_id until hosted Auth cleanup');
}
if (!/create\s+or\s+replace\s+function\s+public\.internal_finalize_account_deletion_db_v1[\s\S]*?language\s+plpgsql\s+security\s+definer/i.test(migration)) {
  fail('DB finalizer must be SECURITY DEFINER so trigger exceptions are owner-bound');
}
const ownerBoundGuardCount = (migration.match(/pg_catalog\\.pg_get_userbyid\\(p\\.proowner\\)/g) || []).length;
const finalizerSubjectGuardCount = (migration.match(/pg_catalog\\.current_setting\\('myeongha\\.account_deletion_finalizer_subject_id', true\\)/g) || []).length;
if (ownerBoundGuardCount !== 8 || finalizerSubjectGuardCount !== 8) {
  fail(
    'expected 8 inline owner-bound immutable-trigger guards, found owner=' +
    ownerBoundGuardCount + ' subject=' + finalizerSubjectGuardCount
  );
}
if (/internal_account_deletion_finalizer_context_matches_v1/i.test(migration)) {
  fail('callable public finalizer guard helper must not exist');
}
if (finalPolicy.destructiveRuntimeAuthorized !== false) {
  fail('destructiveRuntimeAuthorized must remain false');
}
if (finalPolicy.authoritativePrivacyReconciliation !== false || finalPolicy.drReady !== false) {
  fail('DB finalizer cannot promote reconciliation or DR authority');
}

console.log(
  'Account deletion DB finalizer static contract PASS',
  JSON.stringify({
    deleteTableCount: expectedDelete.length,
    anonymizeTableCount: expectedAnonymize.length,
    retainTableCount: expectedRetain.length,
    destructiveRuntimeAuthorized: false,
  }),
);
