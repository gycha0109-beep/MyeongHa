// Se-yeon R2 exact cross-environment aggregate RPC comparison.
// Watchtower-Track: ops. No source function bodies, row data, or raw ACL metadata.
// Important: a successful audit process can still return HOLD; NEVER promote
// Production migration/DR/AI gate on this script's process exit code alone.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const digestPattern = /^[a-f0-9]{64}$/u;
export const fieldNames = Object.freeze([
  'namesSha256', 'signatureSetSha256', 'ownerSetSha256',
  'aclSetSha256', 'ddlSetSha256', 'flagsSetSha256',
]);
const required = Object.freeze([
  'schemaVersion','postgresMajor','expectedNames','rows','resolvedFunctions',
  'uniqueResolvedNames','missingFunctions','browserExecuteCount',...fieldNames,
]);

export function validateR2Aggregate(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)
    || Object.keys(v).length !== required.length
    || required.some(k => !Object.hasOwn(v,k))
    || v.schemaVersion !== 'seyeon-r2-rpc-set-fingerprint-v1'
    || v.postgresMajor !== 17 || v.expectedNames !== 19 || v.rows !== 19
    || v.resolvedFunctions !== 19 || v.uniqueResolvedNames !== 19
    || v.missingFunctions !== 0 || v.browserExecuteCount !== 0
    || fieldNames.some(k => typeof v[k] !== 'string' || !digestPattern.test(v[k]))) {
    throw new Error('HOLD_R2_AGGREGATE_INVALID_OR_UNSAFE');
  }
  return v;
}

export function compareR2Aggregate(isolated, production) {
  const left = validateR2Aggregate(isolated);
  const right = validateR2Aggregate(production);
  const mismatches = fieldNames.filter(k => left[k] !== right[k]);
  return {
    status: mismatches.length ? 'HOLD_R2_RPC_CATALOG_NOT_EQUIVALENT'
      : 'R2_RPC_CATALOG_AGGREGATE_EQUAL_NOT_LINEAGE_APPROVAL',
    match: mismatches.length === 0, functions: 19,
    mismatchFields: mismatches,
    drReady: false, authorizedForProduction: false,
  };
}

export function validateR2ProductionEnvelope(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)
    || v.observation !== 'production-readonly-2026-10-13'
    || v.scope !== 'seyeon-r2-rpc-19'
    || v.source !== 'Supabase Production pg_catalog SELECT ONLY'
    || v.readOnly !== true || v.authorizesProduction !== false
    || v.containsPII !== false || v.containsFunctionBodies !== false
    || !/^[a-f0-9]{40}$/u.test(v.mainAtObservation)) {
    throw new Error('HOLD_R2_PRODUCTION_PROVENANCE_INVALID');
  }
  return validateR2Aggregate(v.aggregate);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) throw new Error('HOLD_R2_USAGE');
    const isolated = JSON.parse(readFileSync(process.argv[2],'utf8'));
    const productionEnvelope = JSON.parse(readFileSync(process.argv[3],'utf8'));
    const result = compareR2Aggregate(isolated,validateR2ProductionEnvelope(productionEnvelope));
    console.log(JSON.stringify(result));
    // Audit observation succeeded, but status itself remains HOLD on mismatch.
    // This task may not be used as a deployment approval gate.
  } catch (error) {
    console.error(String(error?.message ?? error).slice(0,220));
    process.exitCode = 1;
  }
}
