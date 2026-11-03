import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { acquireProductionMemberSmokeSession } from './production-member-smoke-session.mjs';
import { buildProductionSajuGuestBirthLabel, requireProductionSajuGuestRunId } from './production-saju-guest-fixture-audit.mjs';

const origin = 'https://myeongha.gycha0109.workers.dev';
const version = process.env.CLOUDFLARE_EXPECTED_WORKER_VERSION;
const phase = process.env.SAJU_ADMISSION_CANARY_PHASE;
const runId = requireProductionSajuGuestRunId(process.env.GITHUB_RUN_ID);
const results = [];
const approvedLimits = JSON.parse(readFileSync(new URL('../docs/security/SECURITY_PRODUCTION_ACTIVATION_EVIDENCE_20261024.json', import.meta.url), 'utf8')).productionLimits;
let fixtureAttempted = false;
let stage = 'version-preflight';
async function send(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(origin + path, {
    method, redirect: 'error', signal: AbortSignal.timeout(60_000),
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.equal(response.headers.get('X-Myeongha-Worker-Version'), version, 'Worker version mismatch; no replay');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const payload = await response.json();
  return { status: response.status, payload, retry: response.headers.get('retry-after') };
}

let evidence;
try {
  assert.match(version ?? '', /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu);
  assert.ok(['boundary', 'quota', 'production'].includes(phase));
  assert.equal(process.env.GITHUB_RUN_ATTEMPT, '1', 'Do not replay an uncertain synthetic write');
  const health = await send('/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(health.payload, { status: 'ok' });
  // Before reading credentials or creating a fixture, require the actual API
  // adapters and producer configuration to reach their unauthenticated fence.
  for (const path of ['/api/me', '/api/me/saju/calculation', '/api/me/saju/preview-reading']) {
    const response = await send(path, { method: path === '/api/me' ? 'GET' : 'POST',
      ...(path.endsWith('preview-reading') ? { body: { readingText: '전체 사주' } } : {}) });
    assert.equal(response.status, 401, 'Required Cloudflare API is not admitted; stop before auth/fixture');
    results.push({ route: path, identityKind: 'absent', status: response.status });
  }
  if (phase !== 'boundary') {
    stage = 'member-sign-in';
    const { accessToken } = await acquireProductionMemberSmokeSession({ origin, expectedCloudflareVersion: version });
    const me = await send('/api/me', { token: accessToken });
    assert.equal(me.status, 200);
    assert.equal(me.payload.data.subjectKind, 'member');
    assert.equal(me.payload.data.subjectId, process.env.MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID);
    assert.ok(process.env.MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID);
    stage = 'guest-bootstrap';
    fixtureAttempted = true;
    const bootstrap = await send('/api/session/bootstrap', { method: 'POST', body: {} });
    assert.equal(bootstrap.status, 200);
    assert.equal(bootstrap.payload.data.kind, 'guest');
    const guestToken = bootstrap.payload.data.guestSession.bearerToken;
    assert.ok(typeof guestToken === 'string' && guestToken.length >= 32);
    stage = 'guest-birth-create';
    const birth = await send('/api/birth-profiles', { method: 'POST', token: guestToken, body: {
      label: buildProductionSajuGuestBirthLabel(runId), input: {
        calendarType: 'solar', birthDate: '2000-01-01', birthTime: '00:00:00',
        timeKnown: true, isLeapMonth: false, sex: 'unspecified',
      },
    } });
    assert.equal(birth.status, 201);
    stage = 'normal-and-quota';
    // Keep the synthetic quota proof inside a bounded number of concurrent real
    // calculations. Unbounded limit+1 bursts previously coincided with 503s.
    // The production quota values remain provider-owned and unchanged.
    async function collectResponses(path, token, count) {
      const responses = new Array(count);
      let nextIndex = 0;
      let stopped = false;
      const startedAt = Date.now();
      // Await every already-started request before writing failure evidence.
      // Never retry an uncertain write or send further requests after an unexpected failure.
      await Promise.all(Array.from({ length: Math.min(count, 8) }, async () => {
        while (!stopped && nextIndex < count) {
          const index = nextIndex++;
          try {
            responses[index] = await send(path, {
              method: 'POST', token,
              ...(path.endsWith('preview-reading') ? { body: { readingText: '전체 사주' } } : {}),
            });
          } catch {
            // Only record a safe status marker; never serialize a thrown error.
            responses[index] = { status: 0, retry: null };
          }
          if (![200, 429].includes(responses[index].status)) stopped = true;
        }
      }));
      return { responses: responses.filter(Boolean), elapsedMs: Date.now() - startedAt };
    }
    for (const identity of [{ kind: 'member', token: accessToken }, { kind: 'guest', token: guestToken }]) {
      for (const path of ['/api/me/saju/calculation', '/api/me/saju/preview-reading']) {
        const limit = path.endsWith('calculation') ? approvedLimits.calculation : approvedLimits.previewReading;
        assert.ok(Number.isSafeInteger(limit) && limit >= 1 && limit <= 60);
        const expectedAttempts = phase === 'quota' ? limit + 1 : 1;
        const { responses, elapsedMs } = await collectResponses(path, identity.token, expectedAttempts);
        if (phase === 'quota') {
          // Keep a privacy-safe status histogram even when a real Worker quota canary fails.
          // Never downgrade upstream 503s to successful admission or expose response bodies.
          const statusCounts = {};
          for (const response of responses) {
            const status = String(response.status);
            statusCounts[status] = (statusCounts[status] ?? 0) + 1;
          }
          results.push({ route: path, identityKind: identity.kind, requestedCount: expectedAttempts,
            attemptCount: responses.length, elapsedMs, statusCounts });
        }
        if (phase === 'quota') {
          // Never accept an apparent rate limit whose cohort exceeded the policy window.
          assert.ok(elapsedMs <= approvedLimits.windowSeconds * 1000,
            'Synthetic quota cohort outlasted its policy window');
        }
        assert.deepEqual(responses.map(r => r.status).sort(), phase === 'quota' ? [...Array(limit).fill(200), 429] : [200]);
        for (const response of responses) {
          if (response.status === 429) {
            assert.equal(response.payload.error.code, 'RATE_LIMITED');
            assert.match(response.retry ?? '', /^[1-9][0-9]?$/u);
            assert.ok(Number(response.retry) <= 60);
          } else assert.equal(response.payload.ok, true);
          results.push({ route: path, identityKind: identity.kind, status: response.status, retryAfter: response.retry });
        }
      }
    }
  }
  evidence = { status: 'PASS', phase, origin, workerVersion: version, results,
    memberAndGuestNormal: phase !== 'boundary', quotaDenial: phase === 'quota',
    productionActivationAuthorizedByResult: false, fixtureAttempted, syntheticFixtureRunId: runId };
} catch {
  evidence = { status: 'FAIL', phase, origin, workerVersion: version, stage,
    classification: 'CLOUDFLARE_CANARY_BOUNDARY', observed: 'Assertion or request failed; no replay',
    results, fixtureAttempted, syntheticFixtureRunId: runId, productionActivationAuthorizedByResult: false };
  process.exitCode = 1;
}
if (process.env.SAJU_ADMISSION_CANARY_EVIDENCE_PATH) {
  await writeFile(process.env.SAJU_ADMISSION_CANARY_EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
console.log(JSON.stringify(evidence));
