import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  fieldNames, validateR2Aggregate, validateR2ProductionEnvelope, compareR2Aggregate,
  requireR2ExpectedDiagnostic,
} from '../scripts/operations/verify-seyeon-r2-rpc-set-fingerprint.mjs';

const production = JSON.parse(readFileSync(
  new URL('../scripts/operations/seyeon-r2-production-rpc-set-fingerprint-20261013.json', import.meta.url),'utf8'));
const fixture = () => structuredClone(production.aggregate);

describe('R2 aggregate-only, fail-closed Production vs isolated PG17 19-RPC compare', () => {
  it('admits only the exact, bounded, browser-restricted PG17 envelope', () => {
    expect(validateR2ProductionEnvelope(production)).toEqual(production.aggregate);
    expect(validateR2Aggregate(fixture()).rows).toBe(19);
  });
  it('does not convert matching catalogs into lineage, DR, or deploy approval', () => {
    const x = compareR2Aggregate(fixture(),fixture());
    expect(x).toEqual({ status:'R2_RPC_CATALOG_AGGREGATE_EQUAL_NOT_LINEAGE_APPROVAL',
      match:true,functions:19,mismatchFields:[],drReady:false,authorizedForProduction:false });
  });
  it.each(fieldNames)('detects exact %s digest drift while returning HOLD', (field) => {
    const x = fixture();
    x[field] = 'f'.repeat(64) === x[field] ? 'e'.repeat(64) : 'f'.repeat(64);
    const result = compareR2Aggregate(x,fixture());
    expect(result.status).toBe('HOLD_R2_RPC_CATALOG_NOT_EQUIVALENT');
    expect(result.mismatchFields).toEqual([field]);
    expect(result.authorizedForProduction).toBe(false);
  });
  it('blocks missing RPC, overload, elevated browser grants and wrong PG major', () => {
    for (const [field,value] of [
      ['rows',20], ['resolvedFunctions',18], ['uniqueResolvedNames',18],
      ['missingFunctions',1], ['browserExecuteCount',1], ['postgresMajor',15],
    ]) {
      const x = fixture(); x[field]=value;
      expect(() => validateR2Aggregate(x)).toThrow('HOLD_R2_AGGREGATE_INVALID_OR_UNSAFE');
    }
  });
  it('rejects extra keys, unhashed metadata, malformed hashes, and missing digests', () => {
    const a = fixture(); a.functionBody='secret';
    expect(() => validateR2Aggregate(a)).toThrow('HOLD_R2_AGGREGATE_INVALID_OR_UNSAFE');
    const b = fixture(); b.ddlSetSha256='not a digest';
    expect(() => validateR2Aggregate(b)).toThrow('HOLD_R2_AGGREGATE_INVALID_OR_UNSAFE');
    const c = fixture(); delete c.ownerSetSha256;
    expect(() => validateR2Aggregate(c)).toThrow('HOLD_R2_AGGREGATE_INVALID_OR_UNSAFE');
  });
  it('CI permits only observed ACL-only HOLD, never newly drifted Owner/DDL or false promotion', () => {
    const a = fixture();
    a.aclSetSha256 = a.aclSetSha256 === 'f'.repeat(64) ? 'e'.repeat(64) : 'f'.repeat(64);
    const known = compareR2Aggregate(a, fixture());
    expect(requireR2ExpectedDiagnostic(known,production).match).toBe(false);
    const newDrift = structuredClone(a);
    newDrift.ownerSetSha256 = 'f'.repeat(64) === a.ownerSetSha256 ? 'e'.repeat(64) : 'f'.repeat(64);
    expect(() => requireR2ExpectedDiagnostic(compareR2Aggregate(newDrift,fixture()),production))
      .toThrow('HOLD_R2_UNEXPECTED_PARITY_DRIFT_REQUIRES_REVIEW');
    expect(() => requireR2ExpectedDiagnostic(compareR2Aggregate(fixture(),fixture()),production))
      .toThrow('HOLD_R2_UNEXPECTED_PARITY_DRIFT_REQUIRES_REVIEW');
  });
  it('forbids silent source-origin or authorization mutation', () => {
    const a = structuredClone(production); a.authorizesProduction=true;
    expect(() => validateR2ProductionEnvelope(a)).toThrow('HOLD_R2_PRODUCTION_PROVENANCE_INVALID');
    const b = structuredClone(production); b.containsFunctionBodies=true;
    expect(() => validateR2ProductionEnvelope(b)).toThrow('HOLD_R2_PRODUCTION_PROVENANCE_INVALID');
  });
});
