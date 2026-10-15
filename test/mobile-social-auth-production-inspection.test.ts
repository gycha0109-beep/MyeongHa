import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

import {
  classifySocialAuthProductionEnvsV1,
  inspectVercelSocialAuthProductionV1,
  SOCIAL_AUTH_VERCEL_PRODUCTION_INSPECT_V1 as pinned,
} from '../scripts/operations/inspect-vercel-social-auth-production.mjs';

describe('read-only Vercel Production OAuth gate inspection', () => {
  it('distinguishes Production boolean flags, unreadable and missing values', () => {
    const value = classifySocialAuthProductionEnvsV1([
      { key: 'MYEONGHA_SOCIAL_AUTH_GOOGLE_ENABLED', value: 'true', target: ['production'] },
      { key: 'MYEONGHA_SOCIAL_AUTH_KAKAO_ENABLED', value: 'false', target: ['production'] },
      { key: 'MYEONGHA_SOCIAL_AUTH_NAVER_ENABLED', type: 'sensitive', target: ['production'] },
      { key: 'MYEONGHA_SOCIAL_AUTH_GOOGLE_ENABLED', value: 'false', target: ['preview'] },
      { key: 'MYEONGHA_NAVER_CLIENT_ID', value: 'redacted', target: ['production'] },
    ]);
    expect(value.flags).toMatchObject({
      MYEONGHA_SOCIAL_AUTH_GOOGLE_ENABLED: 'enabled',
      MYEONGHA_SOCIAL_AUTH_KAKAO_ENABLED: 'disabled',
      MYEONGHA_SOCIAL_AUTH_NAVER_ENABLED: 'unverified',
      MYEONGHA_NAVER_OAUTH_BRIDGE_ENABLED: 'missing',
    });
    expect(value.support.MYEONGHA_NAVER_CLIENT_ID).toBe('present');
    expect(JSON.stringify(value)).not.toContain('redacted');
  });

  it('calls project-scoped Vercel metadata with GET only and never sends a body', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ envs: [] }),
    }));
    const result = await inspectVercelSocialAuthProductionV1({
      projectId: pinned.projectId,
      teamId: pinned.teamId,
      token: 'secret-test-token',
      fetchImpl,
    });
    expect(result.flags.MYEONGHA_SOCIAL_AUTH_GOOGLE_ENABLED).toBe('missing');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, options] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain(pinned.projectId);
    expect(String(url)).toContain(pinned.teamId);
    expect(options.method).toBe('GET');
    expect(options.body).toBeUndefined();
  });

  it('does not leak API provider payloads or tokens when access is denied', async () => {
    const token = 'a-highly-secret-token';
    const promise = inspectVercelSocialAuthProductionV1({
      projectId: pinned.projectId,
      teamId: pinned.teamId,
      token,
      fetchImpl: async () => ({
        ok: false,
        status: 403,
        json: async () => ({ secrets: token }),
      }),
    });
    await expect(promise).rejects.toThrow('HTTP 403');
    await expect(inspectVercelSocialAuthProductionV1({
      projectId: 'wrong-project', teamId: pinned.teamId, token,
      fetchImpl: async () => ({ ok: true, json: async () => ({ envs: [] }) }),
    })).rejects.toThrow('identity');
  });

  it('production workflow never runs on pull requests or writes to Vercel', async () => {
    const workflow = await readFile(
      new URL('../.github/workflows/mobile-social-auth-production-inspect.yml', import.meta.url),
      'utf8',
    );
    const script = await readFile(
      new URL('../scripts/operations/inspect-vercel-social-auth-production.mjs', import.meta.url),
      'utf8',
    );
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('refs/heads/main');
    expect(workflow).not.toContain('pull_request:');
    expect(workflow).toContain('secrets.VERCEL_MOBILE_PUSH_ACTIVATION_TOKEN');
    expect(script).toContain("method: 'GET'");
    expect(script).not.toContain("method: 'POST'");
    expect(script).not.toContain("method: 'PATCH'");
    expect(script).not.toContain('console.log(payload)');
  });
});
