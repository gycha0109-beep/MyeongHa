import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { PostgresSajuAbuseAdmissionPortV1 } from '../../dist/apps/api/src/postgres-saju-abuse-admission.js';
import { createProductionRequestIdentityVerifierV1 } from '../../dist/apps/api/src/production-request-identity-verifier.js';
import { parseProductionUserDataRuntimeConfigV1 } from '../../dist/apps/api/src/production-user-data-runtime-config.js';
import { handleCurrentSubjectSajuCalculationRequestV1 } from '../../dist/apps/api/src/current-subject-saju-calculation-http.js';
import { handleCurrentSubjectSajuPreviewReadingRequestV1 } from '../../dist/apps/api/src/current-subject-saju-preview-reading-http.js';
import { createProductionCurrentSubjectSajuCalculationRuntimeV1 } from '../../dist/apps/api/src/production-current-subject-saju-calculation-runtime.js';
import { createProductionCurrentSubjectSajuPreviewReadingRuntimeV1 } from '../../dist/apps/api/src/production-current-subject-saju-preview-reading-runtime.js';

// Invoked only after the parent verifier has guarded and bootstrapped a fresh loopback DB.
// HTTP, identity transport, SQL, concurrency and denial responses are real. Hosted Auth
// and successful Saju results are synthetic; this is not a Production penetration test.
export async function runSajuAdmissionAttackE2E({ admin, pool, env, secret, authId, memberId, guestId, rawGuest }) {
  const paths = ['/api/me/saju/calculation', '/api/me/saju/preview-reading'];
  const policies = 'public.saju_abuse_admission_policies_v1';
  const buckets = 'public.saju_abuse_admission_buckets_v1';
  const command = 'public.cmd_admit_saju_request_v1(text,bytea,text,uuid,text)';
  const events = [];
  let upstreamCalls = 0;
  let composition = false;
  let serverFailure = null;
  const memberFetchImpl = async (_url, init) => new Headers(init.headers).get('authorization') === 'Bearer synthetic.jwt.token'
    ? Response.json({ id: authId }) : Response.json({ error: 'invalid_token' }, { status: 401 });
  const identityEvidenceVerifier = createProductionRequestIdentityVerifierV1({
    config: parseProductionUserDataRuntimeConfigV1(env), memberFetchImpl,
  });
  const admission = { admissionPort: new PostgresSajuAbuseAdmissionPortV1(pool), secret };
  const runtimes = [createProductionCurrentSubjectSajuCalculationRuntimeV1, createProductionCurrentSubjectSajuPreviewReadingRuntimeV1]
    .map(create => create({ env, pool, sajuAbuseAdmissionEnabled: true, memberFetchImpl,
      sajuFetchImpl: async () => { upstreamCalls++; throw new Error('Blocked attack reached upstream'); },
      sajuAbuseObservationWriter: event => events.push(event), sajuAbuseOutcomeWriter: event => events.push(event) }));
  const server = createServer(async (incoming, outgoing) => {
    try {
      const headers = new Headers();
      for (let i = 0; i < incoming.rawHeaders.length; i += 2) headers.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1]);
      const request = new Request(`http://127.0.0.1${incoming.url}`, {
        method: incoming.method, headers,
        ...(['GET', 'HEAD'].includes(incoming.method) ? {} : { body: Readable.toWeb(incoming), duplex: 'half' }),
      });
      const index = new URL(request.url).pathname.includes('preview-reading') ? 1 : 0;
      const common = { request, requestId: randomUUID(), serverTime: new Date().toISOString() };
      const response = composition ? await runtimes[index].handleRequest(common)
        : index === 0 ? await handleCurrentSubjectSajuCalculationRequestV1({ ...common, pool, identityEvidenceVerifier,
          sajuAbuseAdmission: admission, sajuAdapter: { calculate: async () => { upstreamCalls++; return { kind: 'isolated-calculation' }; } } })
          : await handleCurrentSubjectSajuPreviewReadingRequestV1({ ...common, pool, identityEvidenceVerifier,
            sajuAbuseAdmission: admission, sajuAdapter: { requestReading: async () => { upstreamCalls++; return { state: 'delivered' }; } } });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) { serverFailure = error; outgoing.writeHead(500); outgoing.end(); }
  });
  server.requestTimeout = 10_000;
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  let requests = 0;
  async function send(path, { token, headers = {}, method = 'POST', body } = {}) {
    requests++;
    const response = await fetch(origin + path, { method, headers: {
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }), ...headers,
    }, ...(method === 'GET' || method === 'HEAD' ? {} : { body: body ?? (path.includes('preview-reading') ? JSON.stringify({ readingText: '전체 사주' }) : '') }),
    signal: AbortSignal.timeout(10_000) });
    const text = await response.text();
    assert.equal(serverFailure, null, 'Local HTTP bridge must not hide handler failures');
    if (response.status === 429) assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, retry: response.headers.get('retry-after'), text };
  }
  const count = async () => (await admin.query(`SELECT count(*)::int AS n FROM ${buckets}`)).rows[0].n;
  try {
    await admin.query(`UPDATE ${policies} SET enabled=false`);
    await admin.query(`UPDATE ${policies} SET enabled=true WHERE policy_version='isolated-v1'`);
    await admin.query(`DELETE FROM ${buckets}`);
    for (const path of paths) {
      for (const token of [undefined, 'forged.jwt.token', 'unregistered-opaque-guest-bearer-that-is-long-enough']) {
        assert.equal((await send(path, { token, headers: { 'x-subject-id': memberId, 'x-client-key': 'attacker', 'x-request-limit': '999999' } })).status, 401);
      }
    }
    assert.equal(await count(), 0);
    assert.equal(upstreamCalls, 0);
    for (const mutation of ["expires_at=now()-interval '1 second'", 'consumed_at=now()', `claimed_by_subject_id='${memberId}'`]) {
      await admin.query(`UPDATE public.guest_sessions SET ${mutation} WHERE subject_id=$1`, [guestId]);
      for (const path of paths) assert.equal((await send(path, { token: rawGuest })).status, 401);
      await admin.query("UPDATE public.guest_sessions SET expires_at=now()+interval '1 hour',consumed_at=null,claimed_by_subject_id=null WHERE subject_id=$1", [guestId]);
    }
    assert.equal(await count(), 0);
    const burstResults = [];
    for (const token of ['synthetic.jwt.token', rawGuest]) for (const path of paths) {
      const responses = await Promise.all(Array.from({ length: 12 }, (_, i) => send(path, { token, headers: {
        'x-forwarded-for': `192.0.2.${i}`, 'x-client-key': randomUUID(), 'x-request-limit': '999999',
        'x-policy-version': 'attacker-v999', 'x-subject-id': randomUUID(),
      } })));
      assert.equal(responses.filter(r => r.status === 200).length, 3, JSON.stringify({ path, statuses: responses.map(r => r.status), errors: responses.filter(r => r.status !== 200 && r.status !== 429).map(r => r.text) }));
      assert.equal(responses.filter(r => r.status === 429).length, 9);
      for (const response of responses.filter(r => r.status === 429)) {
        assert.ok(Number(response.retry) >= 1 && Number(response.retry) <= 60);
        assert.equal(JSON.parse(response.text).error.code, 'RATE_LIMITED');
      }
      burstResults.push({ identity: token === rawGuest ? 'guest' : 'member', route: path, allowed: 3, denied: 9 });
    }
    assert.equal(upstreamCalls, 12);
    assert.equal(await count(), 4);
    assert.deepEqual((await admin.query(`SELECT DISTINCT request_count FROM ${buckets}`)).rows, [{ request_count: 4 }]);
    composition = true;
    const before = upstreamCalls;
    for (const token of ['synthetic.jwt.token', rawGuest]) for (const path of paths) {
      // Calculation rejects every nonempty body before admission; Preview gates before parsing.
      assert.equal((await send(path, { token, body: JSON.stringify({ subjectId: randomUUID(), clientKey: randomUUID(), requestLimit: 999999 }) })).status, path === paths[0] ? 400 : 429);
      assert.equal((await send(path, { token })).status, 429);
      assert.equal((await send(path + '?requestLimit=999999', { token })).status, 404);
      assert.equal((await send(path, { token, method: 'GET' })).status, 405);
      assert.equal((await send(path + '/bypass', { token })).status, 404);
    }
    assert.equal(upstreamCalls, before);
    await admin.query(`UPDATE ${policies} SET enabled=false`);
    for (const path of paths) assert.equal((await send(path, { token: 'synthetic.jwt.token' })).status, 503);
    await admin.query(`UPDATE ${policies} SET enabled=true WHERE policy_version='isolated-v1'`);
    await admin.query(`REVOKE EXECUTE ON FUNCTION ${command} FROM myeongha_api_executor`);
    try {
      for (const path of paths) assert.equal((await send(path, { token: rawGuest })).status, 503);
    } finally { await admin.query(`GRANT EXECUTE ON FUNCTION ${command} TO myeongha_api_executor`); }
    assert.equal(upstreamCalls, before);
    assert.equal(await count(), 4);
    const serialized = JSON.stringify(events);
    for (const sensitive of [secret, authId, memberId, guestId, rawGuest, 'synthetic.jwt.token']) assert.equal(serialized.includes(sensitive), false);
    return { status: 'PASS', transport: 'real loopback Node HTTP + fetch', requests, bursts: burstResults,
      unauthenticatedAndForgedIdentityNoAllocation: true, expiredConsumedClaimedGuestNoAllocation: true,
      spoofedHeadersAndBodyCannotBypass: true, queryPathAndMethodCannotBypass: true,
      missingPolicyAndRevokedExecuteFailClosed: true, productionCompositionBlockedUpstreamCalls: 0,
      observationContainsNoRawCredentialsOrSubjectIds: true,
      externalDependencies: 'hosted Auth and successful Saju adapter responses mocked' };
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await Promise.all(runtimes.map(runtime => runtime.close()));
  }
}
