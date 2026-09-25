import { readFile } from 'node:fs/promises';

const policyPath = 'config/operations/collection-read-resource-policy-v1.json';
const docsPath = 'docs/operations/COLLECTION_READ_RESOURCE_POLICY_V1.md';
const apiContractPath = 'docs/API_CONTRACT.md';

const [policyRaw, docs, apiContract] = await Promise.all([
  readFile(policyPath, 'utf8'),
  readFile(docsPath, 'utf8'),
  readFile(apiContractPath, 'utf8'),
]);

const policy = JSON.parse(policyRaw);
const expected = {
  contractVersion: 'myeongha-collection-read-resource-policy-v1',
  defaultPageSize: 50,
  maximumPageSize: 50,
  pageSizeQueryParameter: 'pageSize',
  hasMoreDerivation: 'database_page_size_plus_one',
  cursorOwnershipRule: 'cursor_is_position_only_and_never_owner_authority',
  offsetPaginationAllowed: false,
};

for (const [key, value] of Object.entries(expected)) {
  if (JSON.stringify(policy[key]) !== JSON.stringify(value)) {
    throw new Error(`${policyPath} has unexpected ${key}: ${JSON.stringify(policy[key])}`);
  }
}

const expectedCollections = {
  chatThreadStream: {
    route: '/api/chat/:threadId',
    method: 'GET',
    cursorKind: 'sequence_no',
    cursorQueryParameter: 'afterSequenceNo',
    ordering: ['sequence_no:asc'],
    databaseAuthority: 'public.qry_chat_thread_stream_v2',
  },
  lifeRecord: {
    route: '/api/life-record',
    method: 'GET',
    cursorKind: 'opaque_keyset_v1',
    cursorQueryParameter: 'cursor',
    ordering: ['confirmed_at:desc', 'created_at:desc', 'id:asc'],
    databaseAuthority: 'public.qry_life_record_ledger_v2',
  },
  memories: {
    route: '/api/memories',
    method: 'GET',
    cursorKind: 'opaque_keyset_v1',
    cursorQueryParameter: 'cursor',
    ordering: ['created_at:desc', 'id:desc'],
    databaseAuthority: 'public.qry_memory_items_v2',
  },
  readingHistory: {
    route: '/api/readings',
    method: 'GET',
    cursorKind: 'opaque_keyset_v1',
    cursorQueryParameter: 'cursor',
    ordering: ['completed_at:desc', 'created_at:desc', 'id:desc'],
    databaseAuthority: 'public.qry_reading_history_v3',
  },
};

if (JSON.stringify(policy.collections) !== JSON.stringify(expectedCollections)) {
  throw new Error(`${policyPath} collection contract drifted.`);
}

function requireFragment(name, source, fragment) {
  if (!source.includes(fragment)) {
    throw new Error(`${name} missing required fragment: ${fragment}`);
  }
}

for (const fragment of [
  'Status: **APPROVED IMPLEMENTATION AUTHORITY**',
  'default page size = 50 rows',
  'maximum page size = 50 rows',
  'minimum explicit page size = 1 row',
  'pageSize + 1',
  'cursor is an untrusted position token, never authentication or ownership authority',
  'subjectBinding',
  'cross-collection/cross-subject opaque cursors fail closed',
  'offset pagination',
  'Production verification',
]) {
  requireFragment(docsPath, docs, fragment);
}

for (const fragment of [
  'COLLECTION_READ_RESOURCE_POLICY_V1.md',
  'default pageSize = 50',
  'maximum pageSize = 50',
  'GET /api/chat/:threadId',
  'GET /api/life-record',
  'GET /api/memories',
  'GET /api/readings',
  'confirmed_at DESC, created_at DESC, id ASC',
  'completed_at DESC, created_at DESC, id DESC',
  'Cross-collection, cross-subject, malformed, duplicate, unknown-parameter, or out-of-range',
]) {
  requireFragment(apiContractPath, apiContract, fragment);
}

console.log(
  'MyeongHa collection read resource policy v1 verification passed: default/max 50, keyset/sequence cursors, DB pageSize+1 derivation, canonical-subject ownership independence, and no offset pagination are pinned.',
);

await import('./verify-authenticated-json-request-resource-policy.mjs');
