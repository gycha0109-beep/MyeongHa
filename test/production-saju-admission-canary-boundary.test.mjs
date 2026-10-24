import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

it.each([
  { projectId: 'wrong-project', target: 'production', readyState: 'READY', aliasAssigned: false },
  { projectId: 'prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP', target: 'preview', readyState: 'READY', aliasAssigned: false },
  { projectId: 'prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP', target: 'production', readyState: 'READY', aliasAssigned: true },
  { projectId: 'prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP', target: 'production', readyState: 'READY', aliasAssigned: false, meta: { githubCommitSha: 'b'.repeat(40) } },
])('rejects an untrusted deployment before requesting or sending a Member session: %j', fixture => {
  const deployment = { url: 'myeongha-boundary-johnny-self.vercel.app', meta: { githubCommitSha: 'a'.repeat(40) }, ...fixture };
  const code = `
    let calls=0;
    globalThis.fetch=async url=>{
      if (!String(url).startsWith('https://api.vercel.com/v13/deployments/')) process.exit(42);
      calls++; return Response.json(${JSON.stringify(deployment)});
    };
    try { await import('./scripts/verify-production-saju-admission-canary.mjs'); process.exit(43); }
    catch { if(calls!==1) process.exit(44); console.log('DENIED_BEFORE_AUTH'); }
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', env: {
    ...process.env, SAJU_ADMISSION_DEPLOYMENT_ORIGIN: 'https://myeongha-boundary-johnny-self.vercel.app',
    SAJU_ADMISSION_EXPECTED_SHA: 'a'.repeat(40), SAJU_ADMISSION_CANARY_PHASE: 'canary',
    GITHUB_RUN_ID: '123456789', GITHUB_RUN_ATTEMPT: '1', VERCEL_TOKEN: 'synthetic-provider-token',
    MYEONGHA_PRODUCTION_MEMBER_EMAIL: 'never-send@example.invalid', MYEONGHA_PRODUCTION_MEMBER_PASSWORD: 'never-send-synthetic-value',
  } });
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe('DENIED_BEFORE_AUTH');
  expect(result.stdout + result.stderr).not.toContain('never-send');
});
