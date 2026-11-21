import { describe, expect, it } from 'vitest';
import {
  isIsolatedLocalAuthRequestV1,
  parseLocalAuthRuntimeConfigV1,
} from './local-auth-dev-runtime.js';

const env = Object.freeze({
  MYEONGHA_LOCAL_AUTH_MODE: 'isolated-v1',
  MYEONGHA_LOCAL_AUTH_ORIGIN: 'http://127.0.0.1:8787',
  MYEONGHA_LOCAL_SUPABASE_URL: 'http://127.0.0.1:15432',
  MYEONGHA_LOCAL_SUPABASE_BROWSER_URL: 'http://127.0.0.1:15432',
  MYEONGHA_LOCAL_SUPABASE_API_KEY: 'sb_publishable_local_test_key_123456',
  MYEONGHA_LOCAL_DATABASE_URL: 'postgres://myeongha_runtime:disposable@127.0.0.1:15433/myeongha_saju_subject_local_verify?sslmode=disable',
  MYEONGHA_LOCAL_IDENTITY_SYNC_DATABASE_URL: 'postgres://myeongha_local_auth_sync:disposable@127.0.0.1:15433/myeongha_saju_subject_local_verify?sslmode=disable',
  MYEONGHA_LOCAL_GUEST_FINGERPRINT_SECRET: 'f'.repeat(48),
  MYEONGHA_LOCAL_AUTH_RATE_LIMIT_SECRET: 'r'.repeat(48),
  MYEONGHA_LOCAL_GUEST_SESSION_TTL_SECONDS: '86400',
});

describe('isolated local Auth runtime boundary', () => {
  it('admits only the explicitly enabled loopback MyeongHa origin', () => {
    const envRecord = env as Record<string, string | undefined>;
    expect(isIsolatedLocalAuthRequestV1(
      new Request('http://127.0.0.1:8787/api/auth/sign-in'), envRecord,
    )).toBe(true);
    expect(isIsolatedLocalAuthRequestV1(
      new Request('http://localhost:8787/api/auth/sign-in'), envRecord,
    )).toBe(false);
    expect(isIsolatedLocalAuthRequestV1(
      new Request('http://127.0.0.1:8788/api/auth/sign-in'), envRecord,
    )).toBe(false);
    expect(isIsolatedLocalAuthRequestV1(
      new Request('https://example.com/api/auth/sign-in'), envRecord,
    )).toBe(false);
    expect(isIsolatedLocalAuthRequestV1(
      new Request('http://127.0.0.1:8787/api/auth/sign-in'), undefined,
    )).toBe(false);
    let localBindingReads = 0;
    const productionBindings = new Proxy({}, {
      get() { localBindingReads += 1; throw new Error('unexpected local binding read'); },
    }) as Record<string, string | undefined>;
    expect(isIsolatedLocalAuthRequestV1(
      new Request('https://auth.synthetic-myeongha.dev/api/me'), productionBindings,
    )).toBe(false);
    expect(localBindingReads).toBe(0);
  });

  it('accepts only fixed local GoTrue and disposable app database settings', () => {
    const parsed = parseLocalAuthRuntimeConfigV1(env);
    expect(parsed.appOrigin).toBe('http://127.0.0.1:8787');
    expect(parsed.goTrueOrigin).toBe('http://127.0.0.1:15432');
    expect(parsed.userData.databasePrincipal).toBe('myeongha_runtime');
    expect(parsed.guestSessionTtlSeconds).toBe(86_400);
  });

  const unsafeOverrides: Array<[string, Record<string, string | undefined>]> = [
    ['mode is absent', { MYEONGHA_LOCAL_AUTH_MODE: undefined }],
    ['GoTrue points outside loopback', { MYEONGHA_LOCAL_SUPABASE_URL: 'https://example.com' }],
    ['app database points outside loopback', { MYEONGHA_LOCAL_DATABASE_URL: 'postgres://myeongha_runtime:secret@example.com:15433/myeongha_saju_subject_local_verify?sslmode=disable' }],
    ['database is not disposable app DB', { MYEONGHA_LOCAL_DATABASE_URL: 'postgres://myeongha_runtime:secret@127.0.0.1:15433/postgres?sslmode=disable' }],
    ['app database uses a privileged login', { MYEONGHA_LOCAL_DATABASE_URL: 'postgres://postgres:secret@127.0.0.1:15433/myeongha_saju_subject_local_verify?sslmode=disable' }],
  ];
  it.each(unsafeOverrides)('rejects unsafe local configuration (%s)', (_label, override) => {
    expect(() => parseLocalAuthRuntimeConfigV1({ ...env, ...override })).toThrow();
  });
});
