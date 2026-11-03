import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

const version = '123e4567-e89b-42d3-a456-426614174000';
it.each(['wrong-version', 'unadmitted-api'])('stops %s before sign-in or Guest writes', scenario => {
  const code = `
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      if (!String(url).startsWith('https://myeongha.gycha0109.workers.dev/api/')) process.exit(42);
      if (String(url).includes('/auth/') || init?.headers?.Authorization) process.exit(43);
      if (String(url).endsWith('/api/health')) return Response.json({status:'ok'}, {headers:{
        'cache-control':'no-store', 'x-myeongha-worker-version': ${JSON.stringify(scenario === 'wrong-version' ? 'ffffffff-ffff-ffff-ffff-ffffffffffff' : version)}
      }});
      return Response.json({ok:false}, {status:404,headers:{'cache-control':'no-store','x-myeongha-worker-version':${JSON.stringify(version)}}});
    };
    await import('./scripts/verify-cloudflare-saju-admission-canary.mjs');
    if (calls !== ${scenario === 'wrong-version' ? 1 : 2}) process.exit(44);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    encoding: 'utf8', env: { ...process.env,
      CLOUDFLARE_EXPECTED_WORKER_VERSION: version, SAJU_ADMISSION_CANARY_PHASE: 'quota',
      SAJU_ADMISSION_CANARY_EVIDENCE_PATH: '', GITHUB_RUN_ID: '123456789', GITHUB_RUN_ATTEMPT: '1',
      MYEONGHA_PRODUCTION_MEMBER_EMAIL: 'never-send@example.invalid',
      MYEONGHA_PRODUCTION_MEMBER_PASSWORD: 'never-send-password',
    },
  });
  expect(result.status).toBe(1);
  const evidence = JSON.parse(result.stdout);
  expect(evidence.status).toBe('FAIL');
  expect(evidence.fixtureAttempted).toBe(false);
  expect(evidence.stage).toBe('version-preflight');
  expect(result.stdout + result.stderr).not.toContain('never-send');
});

it('keeps an unknown Member sign-in origin from receiving credentials', async () => {
  const { acquireProductionMemberSmokeSession } = await import('../scripts/production-member-smoke-session.mjs');
  await expect(acquireProductionMemberSmokeSession({ origin: 'https://attacker.invalid' })).rejects.toThrow('Unapproved');
});

it.each(['normal', 'upstream-503', 'transport-failure', 'window-expired'])('exercises redacted Member/Guest quota paths (%s)', scenario => {
  const code = `
    const counts = new Map();
    const originalNow = Date.now;
    let clockOffsetMs = 0;
    Date.now = () => originalNow() + clockOffsetMs;
    let inFlight = 0;
    let peakInFlight = 0;
    globalThis.fetch = async (url, init = {}) => {
      const parsed = new URL(url);
      if (parsed.origin !== 'https://myeongha.gycha0109.workers.dev') process.exit(42);
      const path = parsed.pathname;
      const headers = {'cache-control':'no-store','x-myeongha-worker-version':${JSON.stringify(version)}};
      const answer = (data, status = 200) => Response.json(data, {status,headers});
      if (path === '/api/health') return answer({status:'ok'});
      if (path === '/api/auth/sign-in') return answer({ok:true,data:{status:'authenticated',session:{accessToken:'synthetic-member-bearer'}}});
      if (path === '/api/session/bootstrap') return answer({ok:true,data:{kind:'guest',guestSession:{bearerToken:'synthetic-guest-bearer-very-long-value'}}});
      if (path === '/api/birth-profiles') return answer({ok:true},201);
      const token = init.headers?.Authorization;
      if (!token) return answer({ok:false},401);
      if (path === '/api/me') return answer({ok:true,data:{subjectKind:'member',subjectId:'synthetic-subject-identity'}});
      const key = token + path;
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key,count);
      inFlight++;
      peakInFlight = Math.max(peakInFlight, inFlight);
      if (peakInFlight > 8) process.exit(45);
      await new Promise(resolve => setTimeout(resolve, 4));
      inFlight--;
      if (${JSON.stringify(scenario)} === 'upstream-503' && token === 'Bearer synthetic-member-bearer' && path.endsWith('calculation') && count === 4) return answer({ok:false},503);
      if (${JSON.stringify(scenario)} === 'transport-failure' && token === 'Bearer synthetic-member-bearer' && path.endsWith('calculation') && count === 4) throw new Error('synthetic transport detail is private');
      if (${JSON.stringify(scenario)} === 'window-expired' && token === 'Bearer synthetic-member-bearer' && path.endsWith('calculation') && count === 61) clockOffsetMs = 61000;
      if (count > (path.endsWith('calculation') ? 60 : 20)) return Response.json({ok:false,error:{code:'RATE_LIMITED'}},{status:429,headers:{...headers,'retry-after':'30'}});
      return answer({ok:true});
    };
    await import('./scripts/verify-cloudflare-saju-admission-canary.mjs');
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    encoding: 'utf8', env: { ...process.env,
      CLOUDFLARE_EXPECTED_WORKER_VERSION: version, SAJU_ADMISSION_CANARY_PHASE: 'quota',
      SAJU_ADMISSION_CANARY_EVIDENCE_PATH: '', GITHUB_RUN_ID: '123456789', GITHUB_RUN_ATTEMPT: '1',
      MYEONGHA_PRODUCTION_MEMBER_EMAIL: 'synthetic-email@example.invalid',
      MYEONGHA_PRODUCTION_MEMBER_PASSWORD: 'synthetic-password-never-output',
      MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID: 'synthetic-subject-identity',
    },
  });
  expect(result.status).toBe(scenario === 'normal' ? 0 : 1);
  const evidence = JSON.parse(result.stdout);
  expect(evidence.status).toBe(scenario === 'normal' ? 'PASS' : 'FAIL');
  expect(evidence.productionActivationAuthorizedByResult).toBe(false);
  if (scenario !== 'normal') {
    expect(evidence.stage).toBe('normal-and-quota');
    expect(evidence.quotaDenial).toBeUndefined();
    const failureBatch = evidence.results.find(r => r.route === '/api/me/saju/calculation' && r.identityKind === 'member');
    expect(failureBatch.requestedCount).toBe(61);
    expect(failureBatch.attemptCount).toBeGreaterThanOrEqual(4);
    if (scenario === 'window-expired') {
      expect(failureBatch.attemptCount).toBe(61);
      expect(failureBatch.statusCounts).toMatchObject({ '200': 60, '429': 1 });
      expect(failureBatch.elapsedMs).toBeGreaterThanOrEqual(61000);
    } else {
      expect(failureBatch.attemptCount).toBeLessThan(61);
      expect(failureBatch.statusCounts[scenario === 'upstream-503' ? '503' : '0']).toBe(1);
      expect(failureBatch.elapsedMs).toBeGreaterThanOrEqual(0);
    }
    expect(result.stdout + result.stderr).not.toContain('synthetic transport detail is private');
  } else {
    expect(evidence.memberAndGuestNormal).toBe(true);
    expect(evidence.quotaDenial).toBe(true);
    expect(evidence.results.filter(r => r.status === 200)).toHaveLength(160);
    expect(evidence.results.filter(r => r.status === 429)).toHaveLength(4);
  }
  for (const privateValue of ['synthetic-password', 'synthetic-subject-identity', 'synthetic-member-bearer', 'synthetic-guest-bearer', '2000-01-01']) {
    expect(result.stdout + result.stderr).not.toContain(privateValue);
  }
});
