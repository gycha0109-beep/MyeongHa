// Run only against a disposable local replay, never an operational database.
import assert from 'node:assert/strict';
import pg from 'pg';
import { ADMIN_READ_SQL_V1, createAdminPostgresReadPortV1 } from '../../api/src/admin-postgres-read-v1.ts';

const raw = process.env.MYEONGHA_ADMIN_TEST_DATABASE_URL;
if (!raw) throw new Error('Set an explicitly disposable loopback database URL.');
const url = new URL(raw);
if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' ||
    url.pathname !== '/myeongha_admin_disposable' || url.username !== 'myeongha_admin_reader' ||
    url.search !== '' || url.hash !== '') {
  throw new Error('Only the dedicated reader on the disposable loopback database is allowed.');
}
const pool = new pg.Pool({ connectionString: raw, max: 1, connectionTimeoutMillis: 3000 });
try {
  const role = (await pool.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
  assert.deepEqual(role, { rolsuper: false, rolbypassrls: false });
  const reads = createAdminPostgresReadPortV1({ pool });
  const id = '123e4567-e89b-42d3-a456-426614174002';
  let verified = 0;
  for (const [kind, sql] of Object.entries(ADMIN_READ_SQL_V1)) {
    if (sql === null) continue;
    await reads.read({ kind, limit: 20, cursor: null, subjectId: kind === 'user-detail' ? id : null,
      recordId: id, from: null, to: null });
    verified++;
  }
  for (const statement of [
    'SELECT auth_user_id FROM public.subjects LIMIT 1',
    'SELECT response_snapshot_jsonb FROM public.reading_refs LIMIT 1',
    'SELECT output_ref_jsonb FROM public.ai_execution_logs LIMIT 1',
    'SELECT verified_payload_jsonb FROM public.commerce_receipts LIMIT 1',
    'SELECT external_event_id FROM public.commerce_provider_events LIMIT 1',
    'SELECT verified_payload_jsonb FROM public.commerce_provider_events LIMIT 1',
    'SELECT event_jsonb FROM public.seyeon_ai_call_cost_events LIMIT 1',
    'UPDATE public.subjects SET status=status WHERE false',
    'DELETE FROM public.entitlements WHERE false',
  ]) {
    await assert.rejects(pool.query(statement), error => error.code === '42501');
  }
  console.log(`PASS: ${verified} real PostgreSQL reads; restricted columns and mutation denied.`);
} finally { await pool.end(); }
