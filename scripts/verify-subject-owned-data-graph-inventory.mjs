import { readFile } from 'node:fs/promises';

const inventoryPath = 'docs/operations/SUBJECT_OWNED_DATA_GRAPH_INVENTORY_V1.json';
const docPath = 'docs/operations/SUBJECT_OWNED_DATA_GRAPH_INVENTORY_V1.md';
const decisionPath = 'docs/P0_DECISION_REGISTER.md';
const drStatusPath = 'docs/operations/POSTGRES_DR_READINESS_STATUS_V1.md';

const [inventoryText, doc, decisions, drStatus] = await Promise.all([
  readFile(inventoryPath, 'utf8'),
  readFile(docPath, 'utf8'),
  readFile(decisionPath, 'utf8'),
  readFile(drStatusPath, 'utf8'),
]);

const inventory = JSON.parse(inventoryText);

function fail(message) {
  throw new Error('Subject-owned data graph inventory rejected: ' + message);
}

if (inventory.schema !== 'myeongha-subject-owned-data-graph-inventory-v1') {
  fail('schema mismatch');
}
if (inventory.decisionId !== 'P0-PR-01' || inventory.decisionStatus !== 'OPEN-P0') {
  fail('historical schema-discovery inventory must remain OPEN-P0 and policy-neutral');
}
if (inventory.inventoryAuthority !== 'SCHEMA_DISCOVERED_POLICY_NEUTRAL') {
  fail('inventory authority must remain policy-neutral');
}
if (inventory.executionAuthorized !== false) fail('executionAuthorized must remain false');
if (inventory.authoritativePostBackupSource !== false) {
  fail('authoritativePostBackupSource must remain false');
}
if (inventory.authoritativePrivacyReconciliation !== false) {
  fail('authoritativePrivacyReconciliation must remain false');
}
if (inventory.futureSafePrivacyReconciliation !== false) {
  fail('futureSafePrivacyReconciliation must remain false');
}
if (inventory.drReady !== false) fail('drReady must remain false');

if (!Array.isArray(inventory.references) || inventory.references.length !== 30) {
  fail('expected exactly 30 direct subject FK mappings');
}

const allowedDomains = new Set([
  'identity_and_merge',
  'birth_and_target',
  'conversation',
  'personal_record',
  'character_world',
  'readings',
  'notification_and_device',
  'sharing',
  'ai_execution',
  'privacy_operations',
  'commerce',
]);
const allowedRoles = new Set([
  'owner',
  'claim_target',
  'merge_source',
  'merge_target',
  'merge_target_pointer',
]);

const keys = [];
let ownerCount = 0;
let nonOwnerCount = 0;

for (const entry of inventory.references) {
  if (!entry || typeof entry !== 'object') fail('reference entry must be an object');
  for (const field of ['table', 'column', 'domain', 'relationRole']) {
    if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
      fail('reference entry has invalid ' + field);
    }
  }
  if (!allowedDomains.has(entry.domain)) fail('unknown domain: ' + entry.domain);
  if (!allowedRoles.has(entry.relationRole)) fail('unknown relationRole: ' + entry.relationRole);
  if (entry.disposition !== 'UNDECIDED') {
    fail('all schema-discovery dispositions must remain UNDECIDED; approved policy lives in the separate disposition policy artifact');
  }
  keys.push(entry.table + '|' + entry.column);
  if (entry.relationRole === 'owner') ownerCount += 1;
  else nonOwnerCount += 1;
}

if (new Set(keys).size !== 30) fail('duplicate table|column reference mapping');
if (new Set(inventory.references.map((entry) => entry.table)).size !== 28) {
  fail('expected exactly 28 distinct direct referencing tables');
}
if (ownerCount !== 26 || nonOwnerCount !== 4) {
  fail('expected 26 owner mappings and 4 lineage/claim mappings');
}

for (const required of [
  'guest_sessions|claimed_by_subject_id',
  'guest_sessions|subject_id',
  'subject_merge_jobs|guest_subject_id',
  'subject_merge_jobs|member_subject_id',
  'subjects|merged_into_subject_id',
]) {
  if (!keys.includes(required)) fail('required identity/merge edge missing: ' + required);
}

if (!/^\|\s*`P0-PR-01`\s*\|[^|\n]*\|\s*\*\*DECIDED\*\*\s*\|/m.test(decisions)) {
  fail('decision register must record P0-PR-01 as DECIDED while this inventory remains policy-neutral');
}

for (const fragment of [
  'SCHEMA-DISCOVERED COVERAGE / POLICY NEUTRAL / EXECUTION NOT AUTHORIZED',
  '30 direct FK mappings',
  '28 distinct referencing tables',
  '26 owner-role mappings',
  '4 lineage/claim mappings',
  'direct FK graph only',
  'all dispositions                   = UNDECIDED',
]) {
  if (!doc.includes(fragment)) fail('documentation boundary missing: ' + fragment);
}

for (const fragment of [
  'privacy_recovery_ledger_authority_class: AUTHORITATIVE_CAPTURED_WINDOW_V1',
  'authoritative_post_backup_source: true_bounded_captured_window_only',
  'authoritative_privacy_reconciliation: false',
  'future_safe_privacy_reconciliation: false',
  'privacy_reconciliation: BLOCKED_BY_PRODUCTION_NONZERO_AUTHORITATIVE_DELTA_PROOF',
  'rpo_authority: PRODUCT_OWNER_APPROVED_PT24H',
  'rto_authority: PRODUCT_OWNER_APPROVED_PT6H',
  'dr_ready: false',
]) {
  if (!drStatus.includes(fragment)) {
    fail('DR authority drifted after P0-PR-01 approval: ' + fragment);
  }
}

console.log(
  'Subject-owned data graph historical inventory PASS: 30 direct subject FK mappings across 28 tables remain schema-discovered/policy-neutral; current P0-PR-01 authority is supplied separately by the approved disposition policy.',
);
