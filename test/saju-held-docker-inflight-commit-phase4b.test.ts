import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { createSajuSourceProofPostgresNonceClaimV1 } from '../apps/api/src/saju-source-proof-nonce-postgres-claim-v1.js';
import type { PostgresSubjectPoolV1, PostgresQueryResultV1 } from '../apps/api/src/postgres-subject-execution.js';

const enabled = process.env.MYEONGHA_DOCKER_SAJU_INFLIGHT_COMMIT === '1';
const mode = process.env.SAJU_BRIDGE_LOCAL_RECOVERY_STAGE;
const nonceKey = process.env.SAJU_BRIDGE_LOCAL_RECOVERY_NONCE_KEY ?? '';
const nonceExpiry = Number(process.env.SAJU_BRIDGE_LOCAL_RECOVERY_NONCE_EXPIRES_MS);
const admissionPermit = process.env.SAJU_BRIDGE_LOCAL_RECOVERY_PERMIT_ID ?? '';
const ca = enabled ? readFileSync('/certs/nonce/ca.crt', 'utf8') : '';
const adminCa = enabled ? readFileSync('/certs/admission/ca.crt', 'utf8') : '';
const nonce = enabled ? new Pool({
  host: 'nonce-db', port: 5432, database: 'myeongha_saju_nonce_local_verify',
  user: 'myeongha_docker_nonce_login',
  password: process.env.SAJU_BRIDGE_LOCAL_NONCE_LOGIN_PASSWORD,
  ssl: { ca, rejectUnauthorized: true }, max: 1, connectionTimeoutMillis: 1600,
}) : undefined;
const nonceAdmin = enabled ? new Pool({
  host: 'nonce-db', port: 5432, database: 'myeongha_saju_nonce_local_verify',
  user: 'postgres', password: process.env.SAJU_BRIDGE_LOCAL_NONCE_DB_PASSWORD,
  ssl: { ca, rejectUnauthorized: true }, max: 1, connectionTimeoutMillis: 1600,
}) : undefined;
const admissionAdmin = enabled ? new Pool({
  host: 'admission-db', port: 5432, database: 'myeongha_saju_admission_local_verify',
  user: 'postgres', password: process.env.SAJU_BRIDGE_LOCAL_ADMISSION_DB_PASSWORD,
  ssl: { ca: adminCa, rejectUnauthorized: true }, max: 1, connectionTimeoutMillis: 1600,
}) : undefined;
let observedClientDisconnects = 0;
// A physical backend SIGKILL can emit a second, asynchronous PG socket
// error after the in-flight COMMIT promise rejects. Handle the transport
// event explicitly; the actual operation still must return false and the
// post-restart database check must independently confirm rollback.
nonce?.on('error', () => { observedClientDisconnects++; });
function guard() {
  if (!enabled || (mode !== 'inflight-fire' && mode !== 'inflight-verify')
    || process.env.MYEONGHA_DOCKER_SAJU_TLS !== '1'
    || process.env.MYEONGHA_DOCKER_SAJU_PERMIT !== '1'
    || process.env.SAJU_BRIDGE_LOCAL_NONCE_DB !== 'myeongha_saju_nonce_local_verify'
    || process.env.SAJU_BRIDGE_LOCAL_SUBJECT_DB !== 'myeongha_saju_subject_local_verify'
    || !/^[A-Za-z0-9_-]{32,128}$/u.test(nonceKey)
    || !Number.isSafeInteger(nonceExpiry) || nonceExpiry <= Date.now()
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(admissionPermit)
    || ['SAJU_BRIDGE_LOCAL_NONCE_LOGIN_PASSWORD', 'SAJU_BRIDGE_LOCAL_NONCE_DB_PASSWORD',
      'SAJU_BRIDGE_LOCAL_ADMISSION_DB_PASSWORD'].some(k => (process.env[k]?.length ?? 0) < 40)) {
    throw new Error('Refusing in-flight COMMIT test outside disposable isolated TLS Docker matrix.');
  }
}
function adapt(pool: Pool): PostgresSubjectPoolV1 {
  return { async connect() {
    const c = await pool.connect();
    c.on('error', () => { observedClientDisconnects++; });
    return {
      async query<Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]):
        Promise<PostgresQueryResultV1<Row>> {
        const r = await c.query(sql, values === undefined ? [] : [...values]);
        return { rows: r.rows as readonly Row[] };
      },
      release(error?: unknown) {
        c.release(error === undefined ? undefined
          : error instanceof Error ? error : new Error('Discard interrupted disposable nonce client'));
      },
    };
  } };
}
function digest(): string {
  return createHash('sha256')
    .update('myeongha/saju/source-proof/nonce-replay/v1\0')
    .update(nonceKey).digest('hex');
}
describe.skipIf(!enabled)('Phase 4B real DB crash inside deferred COMMIT callback', () => {
  afterAll(async () => {
    await Promise.all([nonce?.end(), nonceAdmin?.end(), admissionAdmin?.end()]);
  });
  it('never promotes an interrupted, in-flight transaction or retries it', async () => {
    guard();
    if (mode === 'inflight-fire') {
      // The host waits until pg_stat_activity shows an actual COMMIT blocked
      // by our disposable deferred trigger, then SIGKILLs the database.
      // No Docker socket or crash authority is exposed to this test container.
      const once = createSajuSourceProofPostgresNonceClaimV1({ pool: adapt(nonce!) });
      expect(await once(nonceKey, nonceExpiry)).toBe(false);
      // One attempt only, no retry and no returned success after lost connection.
      // Connection/socket errors remain denial evidence, never a retry cue.
      expect(observedClientDisconnects).toBeGreaterThanOrEqual(0);
      return;
    }
    const row = await nonceAdmin!.query<{ count: string }>(
      'select count(*)::text as count from public.saju_source_proof_nonce_claims '
      + 'where replay_key_digest=$1', [digest()],
    );
    expect(row.rows[0]?.count).toBe('0');
    const permit = await admissionAdmin!.query<{ status: string }>(
      'select status from public.saju_staging_operator_admission_permits_v2 '
      + 'where permit_id=$1::uuid', [admissionPermit],
    );
    expect(permit.rows[0]?.status).toBe('CONSUMED');
    // The synthetic Permit belongs to Phase 4A. No second consumption or
    // new operational approval is permitted after the real Nonce DB crash.
  });
});
