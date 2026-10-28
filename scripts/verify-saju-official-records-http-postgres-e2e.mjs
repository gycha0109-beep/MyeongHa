import assert from 'node:assert/strict';
import pg from 'pg';
import { handleOfficialReadingRecordRequestV1 } from
  '../dist/apps/api/src/official-reading-record-http.js';

// This is the actual protected Records HTTP adapter against disposable PG17.
// The Saju response was synthetic and was finalized by existing DB commands
// in the preceding fixture; this does NOT activate a Production issuer.
assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.CI, 'true');
assert.equal(process.env.DB_SUITE, 'postgres17');
assert.equal(process.env.PGHOST, 'localhost');
assert.equal(process.env.PGPORT, '5432');
assert.match(process.env.PGDATABASE ?? '', /^myeongha_ci_case_[0-9]+$/u);
const pool = new pg.Pool({
  host: '127.0.0.1',
  port: 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: false,
  max: 2,
});
const readingId = '12103100-0000-4000-8000-000000000001';
const sessionId = '12103000-0000-4000-8000-000000000001';
const subjectId = '11390000-0000-0000-0000-000000000001';
const expectedHash =
  'sha256:v1:d2a541178573365041ce0ba291d38670eabd93b6ad9bae216a9f736895edcbc4';
const purchaseB2 = '12192300-0000-0000-0000-000000000002';
const verifiedEvidence = Object.freeze({
  kind: 'guest',
  verifiedGuestTokenHash: 'synthetic-official-http-e2e-guest-hash',
});
const request = new Request(
  'https://myeongha.internal/api/readings?readingId=' + readingId,
  { headers: { authorization: 'Bearer synthetic-e2e-only' } },
);
let requestCount = 0;
async function getReading(authenticated = true, req = request) {
  const response = await handleOfficialReadingRecordRequestV1({
    request: req,
    requestId: 'synthetic-official-e2e-' + (++requestCount),
    serverTime: new Date().toISOString(),
    identityEvidenceVerifier: {
      verifyRequestIdentity: async () => authenticated ? verifiedEvidence : null,
    },
    pool,
  });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return { response, body: await response.json() };
}
async function setGrant(status) {
  assert.ok(status === 'active' || status === 'revoked');
  const change = await pool.query(
    `update public.entitlement_grants g
       set status = $1, revision = revision + 1,
           last_effective_at = clock_timestamp(), updated_at = clock_timestamp()
       from public.standard_reading_reader_access_grants a
       where a.purchase_intent_id = $2::uuid
         and g.id = a.entitlement_grant_id
       returning g.id`,
    [status, purchaseB2],
  );
  assert.equal(change.rowCount, 1);
}
async function storageShape() {
  const result = await pool.query(
    `select r.execution_status, rr.response_hash, rr.external_reading_ref,
            rea.external_request_ref,
            (select count(*)::int from public.outbox_events
             where aggregate_type = 'reading' and aggregate_id = $1) as outbox_count
     from public.readings r
     join public.reading_refs rr on rr.reading_id = r.id
     join public.reading_execution_attempts rea on rea.id = rr.execution_attempt_id
     where r.id = $1::uuid`, [readingId],
  );
  assert.equal(result.rowCount, 1);
  assert.equal(result.rows[0].execution_status, 'succeeded');
  assert.equal(result.rows[0].response_hash, expectedHash);
  assert.equal(result.rows[0].external_reading_ref, 'test-saju-native-reading-v1');
  assert.equal(result.rows[0].external_request_ref, 'test-issuer-request-ref-v1');
  assert.equal(result.rows[0].outbox_count, 1);
}
try {
  await storageShape();

  // The fixture ends with every purchase grant revoked. Immutable record
  // existence alone MUST NOT unlock its paid body.
  let result = await getReading();
  assert.equal(result.response.status, 404);
  assert.equal(result.body.error.code, 'NOT_FOUND');
  console.log('PASS: all Grants revoked -> official Records HTTP 404');

  result = await getReading(false);
  assert.equal(result.response.status, 401);
  assert.equal(result.body.error.code, 'AUTH_REQUIRED');
  console.log('PASS: unauthenticated -> official Records HTTP 401');

  await setGrant('active');
  result = await getReading();
  assert.equal(result.response.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.data.readingId, readingId);
  assert.equal(result.body.data.readingSessionId, sessionId);
  assert.equal(result.body.data.productResponseState, 'delivered');
  assert.equal(result.body.data.reading.responseId,
    'reading_response_aaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(result.body.data.reading.reading.readingId, readingId);
  assert.equal(result.body.data.reading.reading.sections[0].title, '테스트 공식 결과');
  assert.equal(result.body.data.reading.reading.disclosures[0].type, 'scope_limitation');
  assert.equal(result.body.data.responseHash, undefined);
  assert.equal(result.body.data.reading.responseHash, undefined);
  console.log('PASS: B2 exact verified Grant -> intact immutable report over real HTTP adapter');

  const otherId = readingId.replace(/1$/u, '2');
  result = await getReading(true, new Request(
    'https://myeongha.internal/api/readings?readingId=' + otherId,
  ));
  assert.equal(result.response.status, 404);
  console.log('PASS: wrong logical Reading identity -> HTTP 404');

  await setGrant('revoked');
  result = await getReading();
  assert.equal(result.response.status, 404);
  assert.equal(result.body.error.code, 'NOT_FOUND');
  await storageShape();
  const count = await pool.query(
    'select count(*)::int as n from public.reading_refs where reading_id = $1::uuid',
    [readingId],
  );
  assert.equal(count.rows[0].n, 1);
  console.log('PASS: refund/revoke -> HTTP 404 while immutable Reading, Ref and Outbox remain');
} finally {
  await pool.end();
}
