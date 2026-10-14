import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { createSajuSourceProofPostgresNonceClaimV1 } from '../apps/api/src/saju-source-proof-nonce-postgres-claim-v1.js';
import type { PostgresSubjectPoolV1, PostgresQueryResultV1 } from '../apps/api/src/postgres-subject-execution.js';

const enabled = process.env.MYEONGHA_DOCKER_SAJU_NETWORK_COMMIT === '1';
const stage = process.env.SAJU_BRIDGE_LOCAL_RECOVERY_STAGE;
const key = process.env.SAJU_BRIDGE_LOCAL_RECOVERY_NONCE_KEY ?? '';
const nonceExpiry = Number(process.env.SAJU_BRIDGE_LOCAL_RECOVERY_NONCE_EXPIRES_MS);
const permitId = process.env.SAJU_BRIDGE_LOCAL_RECOVERY_PERMIT_ID ?? '';
const ca = enabled ? readFileSync('/certs/nonce/ca.crt', 'utf8') : '';
const admissionCa = enabled ? readFileSync('/certs/admission/ca.crt', 'utf8') : '';

function pool(host: string, database: string, user: string, password: string | undefined,
  trustedCa: string): Pool {
  return new Pool({
    host, port: 5432, database, user, password,
    ssl: { ca: trustedCa, rejectUnauthorized: true },
    max: 1, connectionTimeoutMillis: 1600, query_timeout: 40000,
    idleTimeoutMillis: 1000, allowExitOnIdle: true,
  });
}
const nonce = enabled ? pool('nonce-db', 'myeongha_saju_nonce_local_verify',
  'myeongha_docker_nonce_login', process.env.SAJU_BRIDGE_LOCAL_NONCE_LOGIN_PASSWORD, ca) : undefined;
const nonceAdmin = enabled ? pool('nonce-db', 'myeongha_saju_nonce_local_verify',
  'postgres', process.env.SAJU_BRIDGE_LOCAL_NONCE_DB_PASSWORD, ca) : undefined;
const admissionAdmin = enabled ? pool('admission-db', 'myeongha_saju_admission_local_verify',
  'postgres', process.env.SAJU_BRIDGE_LOCAL_ADMISSION_DB_PASSWORD, admissionCa) : undefined;
nonce?.on('error', () => { /* Socket failure must never promote a nonce claim. */ });

function guard() {
  if (!enabled || !['partition-fire', 'partition-verify'].includes(stage ?? '')
    || process.env.MYEONGHA_DOCKER_SAJU_TLS !== '1'
    || process.env.MYEONGHA_DOCKER_SAJU_PERMIT !== '1'
    || process.env.SAJU_BRIDGE_LOCAL_NONCE_DB !== 'myeongha_saju_nonce_local_verify'
    || process.env.SAJU_BRIDGE_LOCAL_SUBJECT_DB !== 'myeongha_saju_subject_local_verify'
    || !/^[A-Za-z0-9_-]{32,128}$/u.test(key)
    || !Number.isSafeInteger(nonceExpiry) || nonceExpiry <= Date.now()
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(permitId)
    || ['SAJU_BRIDGE_LOCAL_NONCE_LOGIN_PASSWORD', 'SAJU_BRIDGE_LOCAL_NONCE_DB_PASSWORD',
      'SAJU_BRIDGE_LOCAL_ADMISSION_DB_PASSWORD'].some(k => (process.env[k]?.length ?? 0) < 40)) {
    throw new Error('Refusing Phase 4C-1 outside disposable isolated TLS PostgreSQL.');
  }
}
function digest(): string {
  return createHash('sha256').update('myeongha/saju/source-proof/nonce-replay/v1\0')
    .update(key).digest('hex');
}
function adapt(pgPool: Pool, markInsert: () => void): PostgresSubjectPoolV1 {
  return {
    async connect() {
      const client = await pgPool.connect();
      client.on('error', () => { /* Error is handled by the adapter's COMMIT guard. */ });
      return {
        async query<Row = Record<string, unknown>>(sql: string, args?: readonly unknown[]):
          Promise<PostgresQueryResultV1<Row>> {
          if (/^insert into public\.saju_source_proof_nonce_claims/iu.test(sql)) markInsert();
          const result = await client.query(sql, args === undefined ? [] : [...args]);
          return { rows: result.rows as readonly Row[] };
        },
        release(error?: unknown) {
          client.release(error === undefined ? undefined
            : error instanceof Error ? error : new Error('Discard partitioned client'));
        },
      };
    },
  };
}

describe.skipIf(!enabled)('Phase 4C-1 client network-only split during real COMMIT', () => {
  afterAll(async () => { await Promise.all([nonce?.end(), nonceAdmin?.end(), admissionAdmin?.end()]); });

  it('does not treat a disconnected COMMIT as success or retry it automatically', async () => {
    guard();
    if (stage === 'partition-fire') {
      let insertAttempts = 0;
      const once = createSajuSourceProofPostgresNonceClaimV1({
        pool: adapt(nonce!, () => { insertAttempts++; }),
      });
      // Host first observes this exact connection IN COMMIT / PgSleep, then
      // detaches only this disposable verifier from the internal Docker network.
      // The actual PostgreSQL backend remains alive and processes the COMMIT.
      expect(await once(key, nonceExpiry)).toBe(false);
      expect(insertAttempts).toBe(1);
      // A lost COMMIT response is NOT evidence of rollback, and the adapter
      // must not secretly retry the nonce transaction on a new connection.
      return;
    }

    // New verifier container reconnects on the existing disposable network.
    // Both server outcomes are possible after network loss: committed or rolled
    // back. The client response was false in EITHER case.
    const count = await nonceAdmin!.query<{ n: string }>(
      'select count(*)::text as n from public.saju_source_proof_nonce_claims where replay_key_digest=$1',
      [digest()],
    );
    const durable = count.rows[0]?.n;
    expect(['0', '1']).toContain(durable);
    const permit = await admissionAdmin!.query<{ status: string }>(
      'select status from public.saju_staging_operator_admission_permits_v2 where permit_id=$1::uuid',
      [permitId],
    );
    expect(permit.rows[0]?.status).toBe('CONSUMED');
    if (durable === '1') {
      // Explicit post-recovery negative replay PROBE (not production retry):
      // the already-durable nonce is never consumed a second time.
      const replay = createSajuSourceProofPostgresNonceClaimV1({
        pool: adapt(nonce!, () => {}),
      });
      expect(await replay(key, nonceExpiry)).toBe(false);
    }
    // A durable=0 result must NOT trigger an automatic new claim: the
    // client-side decision remains unknown / HOLD until an explicit policy.
    console.log('[saju-bridge] Phase 4C-1 server durable nonce count=' + durable
      + '; disconnected client denied; no automatic retry.');
  }, 115000);
});
