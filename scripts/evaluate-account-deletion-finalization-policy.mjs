import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ACCOUNT_DELETION_POLICY_SCHEMA_V1 =
  'myeongha-account-deletion-finalization-policy-candidate-v1';

const REQUIRED_FINALIZATION_SLOTS = Object.freeze([
  'subjectRecordAction',
  'authMappingAction',
  'authProviderUserAction',
  'profileAction',
  'guestSessionAction',
  'mergeProvenanceAction',
  'personalizationGraphAction',
  'shareDeviceNotificationAction',
  'backupRetentionHandling',
]);

const REQUIRED_COMMERCE_CLASSES = Object.freeze({
  commerce_account_provider_binding: ['commerce_account_links'],
  commerce_purchase_payment_provenance: ['commerce_payment_attempts', 'purchase_intents'],
  commerce_verified_provider_evidence: ['commerce_provider_events', 'commerce_receipts'],
  commerce_entitlement_history_projection: [
    'entitlement_events',
    'entitlement_grants',
    'entitlements',
  ],
});

function fail(message) {
  throw new Error('Account deletion policy candidate rejected: ' + message);
}

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

export function evaluateAccountDeletionPolicyCandidate(policy) {
  if (!isRecord(policy)) fail('policy must be an object');
  if (policy.schema !== ACCOUNT_DELETION_POLICY_SCHEMA_V1) fail('schema mismatch');
  if (policy.decisionId !== 'P0-PR-01') fail('decisionId must remain P0-PR-01');
  if (policy.decisionStatus !== 'OPEN-P0') fail('decisionStatus must remain OPEN-P0');
  if (policy.policyAuthority !== 'NOT_APPROVED') fail('policyAuthority must remain NOT_APPROVED');
  if (policy.executionAuthorized !== false) fail('executionAuthorized must remain false');

  if (!isRecord(policy.destructiveFinalization)) {
    fail('destructiveFinalization must be an object');
  }
  const actualSlots = Object.keys(policy.destructiveFinalization).sort();
  if (JSON.stringify(actualSlots) !== JSON.stringify([...REQUIRED_FINALIZATION_SLOTS].sort())) {
    fail('destructiveFinalization slot inventory drifted');
  }
  for (const slot of REQUIRED_FINALIZATION_SLOTS) {
    if (policy.destructiveFinalization[slot] !== 'UNDECIDED') {
      fail('destructive finalization slot must remain UNDECIDED while P0-PR-01 is OPEN: ' + slot);
    }
  }

  if (!Array.isArray(policy.commerceRetentionClasses)) {
    fail('commerceRetentionClasses must be an array');
  }

  const expectedClassKeys = Object.keys(REQUIRED_COMMERCE_CLASSES).sort();
  const actualClassKeys = policy.commerceRetentionClasses.map((entry) => entry?.classKey).sort();
  if (JSON.stringify(actualClassKeys) !== JSON.stringify(expectedClassKeys)) {
    fail('Commerce retention class inventory drifted');
  }

  const seenTables = [];
  for (const entry of policy.commerceRetentionClasses) {
    if (!isRecord(entry)) fail('Commerce retention entry must be an object');
    const expectedTables = REQUIRED_COMMERCE_CLASSES[entry.classKey];
    if (!expectedTables) fail('unknown Commerce retention class: ' + String(entry.classKey));
    if (!Array.isArray(entry.tables) || entry.tables.some((value) => typeof value !== 'string')) {
      fail('Commerce retention tables must be string arrays');
    }
    if (JSON.stringify(sortedUnique(entry.tables)) !== JSON.stringify([...expectedTables].sort())) {
      fail('Commerce retention table membership drifted for ' + entry.classKey);
    }
    if (entry.disposition !== 'UNDECIDED') {
      fail('Commerce retention disposition must remain UNDECIDED for ' + entry.classKey);
    }
    if (entry.retentionDurationDays !== null) {
      fail('Commerce retention duration must remain null for ' + entry.classKey);
    }
    if (entry.authorityReference !== null) {
      fail('Commerce retention authorityReference must remain null for ' + entry.classKey);
    }
    seenTables.push(...entry.tables);
  }

  const expectedTables = sortedUnique(Object.values(REQUIRED_COMMERCE_CLASSES).flat());
  if (JSON.stringify(sortedUnique(seenTables)) !== JSON.stringify(expectedTables)) {
    fail('Commerce retention inventory contains duplicates or omissions');
  }

  for (const [field, expected] of [
    ['approvedRetentionPolicyVersion', null],
    ['approvedBy', null],
    ['approvedAt', null],
    ['authoritativePostBackupSource', false],
    ['authoritativePrivacyReconciliation', false],
    ['futureSafePrivacyReconciliation', false],
    ['drReady', false],
  ]) {
    if (policy[field] !== expected) {
      fail(field + ' must remain ' + JSON.stringify(expected));
    }
  }

  return {
    schema: 'myeongha-account-deletion-finalization-policy-readiness-v1',
    decisionId: 'P0-PR-01',
    decisionStatus: 'OPEN-P0',
    policyReady: false,
    executionAuthorized: false,
    missingDecisionSlotCount:
      REQUIRED_FINALIZATION_SLOTS.length + policy.commerceRetentionClasses.length * 3,
    destructiveFinalizationSlotCount: REQUIRED_FINALIZATION_SLOTS.length,
    commerceRetentionClassCount: policy.commerceRetentionClasses.length,
    commerceSubjectLinkedTableCount: expectedTables.length,
    authoritativePostBackupSource: false,
    authoritativePrivacyReconciliation: false,
    futureSafePrivacyReconciliation: false,
    drReady: false,
  };
}

async function main() {
  const inputPath =
    process.argv[2] ??
    'docs/operations/ACCOUNT_DELETION_FINALIZATION_POLICY_CANDIDATE_V1.json';
  const policy = JSON.parse(await readFile(inputPath, 'utf8'));
  const report = evaluateAccountDeletionPolicyCandidate(policy);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  await main();
}
