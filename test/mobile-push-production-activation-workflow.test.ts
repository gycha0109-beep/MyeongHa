import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  VERCEL_MOBILE_PUSH_SECRET_BINDINGS_V1,
  ensureVercelMobilePushSecretsV1,
} from '../scripts/operations/ensure-vercel-mobile-push-env.mjs';
import {
  VERCEL_MOBILE_PUSH_REDEPLOY_V1,
  redeployVercelMobilePushProductionV1,
} from '../scripts/operations/redeploy-vercel-mobile-push-production.mjs';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Mobile Push Production activation authority', () => {
  it('uses dedicated activation credentials and never reuses the security-alert token', () => {
    const workflow = readFileSync(
      '.github/workflows/mobile-push-production-activate.yml',
      'utf8',
    );
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('VERCEL_MOBILE_PUSH_ACTIVATION_TOKEN');
    expect(workflow).toContain('EXPO_TOKEN');
    expect(workflow).not.toContain('VERCEL_SECURITY_ALERTS_TOKEN');
    expect(workflow).toContain('ACTIVATE_MOBILE_PUSH_V1');
    expect(workflow).toContain('credential_values_emitted=false');
    expect(workflow).toContain(
      'redeploy-vercel-mobile-push-production.mjs',
    );
    expect(workflow).not.toContain('vercel redeploy');
    expect(workflow).not.toContain('VERCEL_TOKEN:');
  });

  it('pins the exact two sensitive server-side token-protection keys', () => {
    expect(VERCEL_MOBILE_PUSH_SECRET_BINDINGS_V1).toEqual({
      projectId: 'prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP',
      teamId: 'team_xuYA9OhCWlJETaYFOmeVodgS',
      requiredKeys: [
        'MYEONGHA_PUSH_TOKEN_ENCRYPTION_K1_SECRET',
        'MYEONGHA_PUSH_TOKEN_FINGERPRINT_K1_SECRET',
      ],
      requiredType: 'sensitive',
      target: 'production',
    });
  });

  it('creates only a missing sensitive Production secret and does not rotate an existing one', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const first = {
      envs: [
        {
          key: 'MYEONGHA_PUSH_TOKEN_ENCRYPTION_K1_SECRET',
          type: 'sensitive',
          target: ['production'],
        },
      ],
    };
    const second = {
      envs: [
        ...first.envs,
        {
          key: 'MYEONGHA_PUSH_TOKEN_FINGERPRINT_K1_SECRET',
          type: 'sensitive',
          target: ['production'],
        },
      ],
    };
    let reads = 0;
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), ...(init === undefined ? {} : { init }) });
      if ((init?.method ?? 'GET') === 'GET') {
        reads += 1;
        return response(reads === 1 ? first : second);
      }
      return response({ created: true });
    };

    const result = await ensureVercelMobilePushSecretsV1({
      token: 'test-token',
      projectId: VERCEL_MOBILE_PUSH_SECRET_BINDINGS_V1.projectId,
      teamId: VERCEL_MOBILE_PUSH_SECRET_BINDINGS_V1.teamId,
      fetchImpl,
    });

    expect(result.ready).toBe(true);
    expect(result.created).toEqual([
      'MYEONGHA_PUSH_TOKEN_FINGERPRINT_K1_SECRET',
    ]);
    const posts = calls.filter((call) => call.init?.method === 'POST');
    expect(posts).toHaveLength(1);
    const payload = JSON.parse(String(posts[0]?.init?.body));
    expect(payload.key).toBe(
      'MYEONGHA_PUSH_TOKEN_FINGERPRINT_K1_SECRET',
    );
    expect(payload.type).toBe('sensitive');
    expect(payload.target).toEqual(['production']);
    expect(Buffer.byteLength(payload.value, 'utf8')).toBeGreaterThanOrEqual(32);
  });

  it('redeploys Production through the direct Vercel API and waits for READY', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const responses = [
      response({
        id: 'dpl_Source123',
        readyState: 'READY',
        target: 'production',
        projectId: VERCEL_MOBILE_PUSH_REDEPLOY_V1.projectId,
      }),
      response({
        id: 'dpl_Redeploy456',
        readyState: 'BUILDING',
        target: 'production',
      }),
      response({
        id: 'dpl_Redeploy456',
        readyState: 'READY',
        target: 'production',
        projectId: VERCEL_MOBILE_PUSH_REDEPLOY_V1.projectId,
      }),
    ];
    let cursor = 0;
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), ...(init === undefined ? {} : { init }) });
      const next = responses[cursor];
      cursor += 1;
      if (next === undefined) throw new Error('Unexpected provider request.');
      return next;
    };

    const result = await redeployVercelMobilePushProductionV1({
      token: 'test-token',
      projectId: VERCEL_MOBILE_PUSH_REDEPLOY_V1.projectId,
      teamId: VERCEL_MOBILE_PUSH_REDEPLOY_V1.teamId,
      productionHost: VERCEL_MOBILE_PUSH_REDEPLOY_V1.productionHost,
      fetchImpl,
      sleepImpl: async () => {},
      pollAttempts: 3,
      pollIntervalMs: 0,
    });

    expect(result).toEqual({
      ready: true,
      deploymentId: 'dpl_Redeploy456',
      sourceDeploymentId: 'dpl_Source123',
      state: 'READY',
    });
    expect(calls).toHaveLength(3);
    expect(calls[0]?.url).toContain(
      '/v13/deployments/myeongha.vercel.app?teamId=',
    );
    expect(calls[1]?.init?.method).toBe('POST');
    expect(calls[1]?.url).toContain('/v13/deployments?forceNew=1&teamId=');
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      deploymentId: 'dpl_Source123',
      target: 'production',
    });
    expect(calls[2]?.url).toContain('/v13/deployments/dpl_Redeploy456?teamId=');
  });

  it('fails closed instead of accepting a readable Production secret', async () => {
    const fetchImpl: typeof fetch = async () =>
      response({
        envs: [
          {
            key: 'MYEONGHA_PUSH_TOKEN_ENCRYPTION_K1_SECRET',
            type: 'plain',
            target: ['production'],
          },
        ],
      });

    await expect(
      ensureVercelMobilePushSecretsV1({
        token: 'test-token',
        projectId: VERCEL_MOBILE_PUSH_SECRET_BINDINGS_V1.projectId,
        teamId: VERCEL_MOBILE_PUSH_SECRET_BINDINGS_V1.teamId,
        fetchImpl,
      }),
    ).rejects.toThrow('must use sensitive type');
  });

  it('keeps the one-shot push trigger explicit', () => {
    expect(
      readFileSync(
        '.github/mobile-push-production-activate.trigger',
        'utf8',
      ).trim(),
    ).toBe('ACTIVATE_MOBILE_PUSH_V1');
  });
});
