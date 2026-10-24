import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { acquireProductionMemberSmokeSession } from './production-member-smoke-session.mjs';
import { buildProductionSajuGuestBirthLabel, requireProductionSajuGuestRunId } from './production-saju-guest-fixture-audit.mjs';

const origin = new URL(process.env.SAJU_ADMISSION_DEPLOYMENT_ORIGIN ?? '');
const phase = process.env.SAJU_ADMISSION_CANARY_PHASE;
assert.ok(['canary', 'production'].includes(phase));
assert.equal(origin.protocol, 'https:');
assert.equal(origin.origin + '/', origin.href);
assert.match(origin.hostname, /^myeongha-[a-z0-9]+-johnny-self\.vercel\.app$/u);
assert.equal(origin.username + origin.password, '');
assert.equal(process.env.GITHUB_RUN_ATTEMPT, '1', 'Never repeat an uncertain synthetic Guest write');
const expectedSha = process.env.SAJU_ADMISSION_EXPECTED_SHA;
assert.match(expectedSha ?? '', /^[a-f0-9]{40}$/u);
const access = process.env.VERCEL_TOKEN;
assert.ok(access);
// Bind the destination to an authenticated provider record BEFORE obtaining/sending a Member session.
const inspection = await fetch(`https://api.vercel.com/v13/deployments/${origin.hostname}?teamId=team_xuYA9OhCWlJETaYFOmeVodgS`, {
  headers: { Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(15_000), redirect: 'error',
});
assert.equal(inspection.status, 200);
const deployment = await inspection.json();
assert.equal(deployment.projectId, 'prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP');
assert.equal(deployment.target, 'production');
assert.equal(deployment.readyState, 'READY');
assert.equal(deployment.url, origin.hostname);
assert.equal(deployment.meta?.githubCommitSha, expectedSha);
if (phase === 'canary') assert.equal(deployment.aliasAssigned, false, 'Canary must not receive public aliases');
const runId = requireProductionSajuGuestRunId(process.env.GITHUB_RUN_ID);
const results = [];
async function send(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(new URL(path, origin), { method, redirect: 'error',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(60_000) });
  const text = await response.text();
  let payload; try { payload = JSON.parse(text); } catch { throw new Error(`Canary non-JSON response: HTTP ${response.status}`); }
  return { status: response.status, payload, retry: response.headers.get('retry-after'), cache: response.headers.get('cache-control') };
}
try {
  const { accessToken } = await acquireProductionMemberSmokeSession();
  const me = await send('/api/me', { token: accessToken });
  assert.equal(me.status, 200);
  assert.equal(me.payload.data.subjectKind, 'member');
  assert.equal(me.payload.data.subjectId, process.env.MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID);
  const tokens = [{ kind: 'member', token: accessToken }];
  const bootstrap = await send('/api/session/bootstrap', { method: 'POST', body: {} });
  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrap.payload.data.kind, 'guest');
  const token = bootstrap.payload.data.guestSession.bearerToken;
  assert.ok(typeof token === 'string' && token.length >= 32);
  const birth = await send('/api/birth-profiles', { method: 'POST', token, body: {
    label: buildProductionSajuGuestBirthLabel(runId), input: { calendarType: 'solar', birthDate: '2000-01-01',
      birthTime: '00:00:00', timeKnown: true, isLeapMonth: false, sex: 'unspecified' },
  } });
  assert.equal(birth.status, 201);
  tokens.push({ kind: 'guest', token });
  for (const identity of tokens) for (const path of ['/api/me/saju/calculation', '/api/me/saju/preview-reading']) {
    const requests = phase === 'canary' ? 3 : 1;
    const responses = await Promise.all(Array.from({ length: requests }, () => send(path, {
      method: 'POST', token: identity.token, ...(path.endsWith('preview-reading') ? { body: { readingText: '전체 사주' } } : {}),
    })));
    assert.deepEqual(responses.map(r => r.status).sort(), phase === 'canary' ? [200, 200, 429] : [200]);
    for (const response of responses) {
      assert.equal(response.cache, 'no-store');
      if (response.status === 429) {
        assert.equal(response.payload.error.code, 'RATE_LIMITED');
        assert.ok(Number(response.retry) >= 1 && Number(response.retry) <= 60);
      } else assert.equal(response.payload.ok, true);
      results.push({ identityKind: identity.kind, route: path, status: response.status,
        requestId: response.payload.meta?.requestId, retryAfter: response.retry });
    }
  }
  const evidence = { status: 'PASS', phase, deploymentId: deployment.id, sha: expectedSha,
    memberAndGuestNormal: true, quotaDenial: phase === 'canary', results, syntheticFixtureRunId: runId,
    rawIdentityCredentialsBirthOrSajuPayloadEmitted: false };
  if (process.env.SAJU_ADMISSION_CANARY_EVIDENCE_PATH) await writeFile(process.env.SAJU_ADMISSION_CANARY_EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(evidence));
} catch (error) {
  console.error(JSON.stringify({ status: 'FAIL', phase, classification: 'PRODUCTION_CANARY_BOUNDARY',
    observed: error instanceof assert.AssertionError ? 'Canary assertion failed; no replay' : 'Canary request failed; no replay',
    syntheticFixtureRunId: runId, productionActivationAuthorizedByResult: false }));
  process.exitCode = 1;
}
