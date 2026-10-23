import { describe, expect, it } from 'vitest';
import { expectedOwners, validateR2RpcSnapshot, compareR2RpcSnapshots } from '../scripts/operations/verify-seyeon-r2-rpc-catalog.mjs';

const makeFixture = () => ({
  schemaVersion: 'seyeon-r2-rpc-catalog-v1',
  postgresMajor: 17,
  functions: Object.entries(expectedOwners).map(([name, owner]) => ({
    name,
    signature: 'public.' + name + '(p_subject_id uuid)',
    owner,
    securityDefiner: name !== 'qry_seyeon_production_personal_record_context_v1'
      && name !== 'assert_seyeon_chat_thread_runtime_v1',
    volatility: 'v',
    ddlSha256: 'a'.repeat(64),
    aclSha256: 'b'.repeat(64),
    anonExecute: false,
    authenticatedExecute: false,
  })),
});

describe('Se-yeon R2 RPC catalog fail-closed parity', () => {
  it('accepts exactly 19 bounded production-shaped metadata rows', () => {
    const fixture = makeFixture();
    expect(validateR2RpcSnapshot(fixture).size).toBe(19);
    expect(compareR2RpcSnapshots(fixture, structuredClone(fixture)).count).toBe(19);
  });
  it('rejects missing entries, overloads and unexpected functions', () => {
    const original = makeFixture();
    const missing = structuredClone(original);
    missing.functions.pop();
    expect(() => validateR2RpcSnapshot(missing)).toThrow('HOLD_R2_FUNCTION_COUNT');
    const overload = structuredClone(original);
    overload.functions[1].name = overload.functions[0].name;
    expect(() => validateR2RpcSnapshot(overload)).toThrow('HOLD_R2_MISSING_OR_DUPLICATE_FUNCTION');
  });
  it('rejects browser execute and unapproved Owner/definer drift', () => {
    for (const mutation of [
      r => { r.anonExecute = true; },
      r => { r.authenticatedExecute = true; },
      r => { r.owner = 'postgres'; },
      r => { r.securityDefiner = false; },
    ]) {
      const fixture = makeFixture();
      mutation(fixture.functions[1]);
      expect(() => validateR2RpcSnapshot(fixture)).toThrow('HOLD_R2_OWNER_SIGNATURE_ACL_OR_DDL');
    }
  });
  it('detects definition/ACL/signature drift between valid snapshots', () => {
    for (const [field, replacement] of [
      ['ddlSha256', 'c'.repeat(64)],
      ['aclSha256', 'd'.repeat(64)],
      ['signature', 'public.cmd_enqueue_seyeon_relationship_sync_v1(p_extra text)'],
    ]) {
      const local = makeFixture();
      const production = structuredClone(local);
      production.functions[1][field] = replacement;
      expect(() => compareR2RpcSnapshots(local, production)).toThrow('HOLD_R2_CATALOG_PARITY_MISMATCH');
    }
  });
  it('rejects malformed metadata and mismatched PostgreSQL major', () => {
    const bad = makeFixture();
    bad.postgresMajor = 15;
    expect(() => validateR2RpcSnapshot(bad)).toThrow('HOLD_R2_INVALID_SNAPSHOT');
    const unknown = makeFixture();
    unknown.functions[0].secretSql = 'should never be accepted';
    expect(() => validateR2RpcSnapshot(unknown)).toThrow('HOLD_R2_UNEXPECTED_METADATA');
  });
});
