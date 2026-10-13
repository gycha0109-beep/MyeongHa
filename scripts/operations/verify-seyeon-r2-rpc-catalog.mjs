// Read-only R2 RPC catalog parity verifier. Watchtower-Track: ops.
// Inputs are metadata snapshots only: never accept SQL function bodies.
import { readFileSync } from 'node:fs';

export const expectedOwners = Object.freeze({
  qry_production_relationship_runtime_v1: 'myeongha_relationship_apply_owner',
  cmd_enqueue_seyeon_relationship_sync_v1: 'myeongha_relationship_apply_owner',
  cmd_claim_seyeon_relationship_sync_v1: 'myeongha_relationship_apply_owner',
  cmd_complete_seyeon_relationship_sync_v1: 'myeongha_relationship_apply_owner',
  qry_seyeon_production_personal_record_context_v1: 'postgres',
  qry_production_relationship_history_runtime_v1: 'myeongha_relationship_apply_owner',
  assert_seyeon_chat_thread_runtime_v1: 'myeongha_seyeon_chat_runtime_owner',
  cmd_receive_seyeon_chat_turn_runtime_v1: 'myeongha_seyeon_chat_runtime_owner',
  cmd_allocate_seyeon_chat_attempt_runtime_v1: 'myeongha_seyeon_chat_runtime_owner',
  cmd_mark_seyeon_chat_context_ready_runtime_v1: 'myeongha_seyeon_chat_runtime_owner',
  cmd_fail_seyeon_chat_attempt_runtime_v1: 'myeongha_seyeon_chat_runtime_owner',
  cmd_persist_seyeon_chat_generated_runtime_v1: 'myeongha_seyeon_chat_runtime_owner',
  cmd_persist_seyeon_chat_validated_runtime_v1: 'myeongha_seyeon_chat_runtime_owner',
  cmd_commit_seyeon_chat_turn_runtime_v1: 'myeongha_seyeon_chat_runtime_owner',
  cmd_commit_seyeon_chat_turn_runtime_v2: 'myeongha_seyeon_chat_runtime_owner',
  qry_seyeon_post_turn_analysis_job_v1: 'myeongha_seyeon_post_turn_owner',
  cmd_claim_seyeon_post_turn_analysis_v1: 'myeongha_seyeon_post_turn_owner',
  cmd_checkpoint_seyeon_post_turn_analysis_v1: 'myeongha_seyeon_post_turn_owner',
  cmd_complete_seyeon_post_turn_analysis_v1: 'myeongha_seyeon_post_turn_owner',
});

const requiredKeys = ['name', 'signature', 'owner', 'securityDefiner', 'volatility',
  'ddlSha256', 'aclSha256', 'anonExecute', 'authenticatedExecute'];
const digest = /^[0-9a-f]{64}$/;
export function validateR2RpcSnapshot(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || input.schemaVersion !== 'seyeon-r2-rpc-catalog-v1'
      || input.postgresMajor !== 17 || !Array.isArray(input.functions)) {
    throw new Error('HOLD_R2_INVALID_SNAPSHOT');
  }
  const names = Object.keys(expectedOwners);
  if (input.functions.length !== names.length) throw new Error('HOLD_R2_FUNCTION_COUNT');
  const seen = new Set();
  for (const row of input.functions) {
    if (!row || typeof row !== 'object' || Array.isArray(row)
        || Object.keys(row).length !== requiredKeys.length
        || !requiredKeys.every((key) => Object.hasOwn(row, key))) {
      throw new Error('HOLD_R2_UNEXPECTED_METADATA');
    }
    if (!Object.hasOwn(expectedOwners, row.name) || seen.has(row.name)) {
      throw new Error('HOLD_R2_MISSING_OR_DUPLICATE_FUNCTION');
    }
    seen.add(row.name);
    if (row.owner !== expectedOwners[row.name]
        || typeof row.signature !== 'string'
        || !row.signature.startsWith('public.' + row.name + '(')
        || !row.signature.endsWith(')')
        || typeof row.securityDefiner !== 'boolean'
        || (row.name === 'qry_seyeon_production_personal_record_context_v1'
          || row.name === 'assert_seyeon_chat_thread_runtime_v1'
          ? row.securityDefiner : !row.securityDefiner)
        || !['s', 'v', 'i'].includes(row.volatility)
        || typeof row.ddlSha256 !== 'string' || !digest.test(row.ddlSha256)
        || typeof row.aclSha256 !== 'string' || !digest.test(row.aclSha256)
        || row.anonExecute !== false || row.authenticatedExecute !== false) {
      throw new Error('HOLD_R2_OWNER_SIGNATURE_ACL_OR_DDL');
    }
  }
  return new Map(input.functions.map((row) => [row.name, row]));
}

export function compareR2RpcSnapshots(isolated, production) {
  const local = validateR2RpcSnapshot(isolated);
  const remote = validateR2RpcSnapshot(production);
  const differences = [];
  for (const [name, a] of local) {
    const b = remote.get(name);
    for (const key of requiredKeys) {
      if (a[key] !== b[key]) differences.push({ name, field: key });
    }
  }
  // Never print actual SQL bodies or arbitrary metadata on mismatch.
  if (differences.length) {
    const error = new Error('HOLD_R2_CATALOG_PARITY_MISMATCH: ' +
      differences.map((d) => d.name + ':' + d.field).join(','));
    error.differences = differences;
    throw error;
  }
  return { status: 'R2_RPC_CATALOG_PARITY_PASS_NOT_LINEAGE_APPROVAL', count: local.size };
}

if (process.argv[1]?.endsWith('/verify-seyeon-r2-rpc-catalog.mjs')
    && process.argv.length >= 4) {
  try {
    const load = (path) => JSON.parse(readFileSync(path, 'utf8'));
    const result = process.argv.length >= 5
      ? compareR2RpcSnapshots(load(process.argv[2]), load(process.argv[3]))
      : { status: 'R2_RPC_CATALOG_SHAPE_PASS_NOT_LINEAGE_APPROVAL',
          count: validateR2RpcSnapshot(load(process.argv[2])).size };
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(String(error.message).slice(0, 1500));
    process.exitCode = 1;
  }
}
