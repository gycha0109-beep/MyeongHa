import { beforeAll, describe, expect, it } from 'vitest';
import meEndpoint, {
  resolveMeDispatchTargetForTestV1,
  toCanonicalMeRequestForTestV1,
} from '../api/me.js';

const TARGET_ID = 'b6300000-0000-4000-8000-000000000001';
const OTHER_TARGET_ID = 'b6300000-0000-4000-8000-000000000002';

beforeAll(() => {
  process.env.MYEONGHA_DATABASE_URL =
    'postgresql://myeongha_runtime.cnsfpcdiyofqvhpcegfc:test-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require';
  process.env.MYEONGHA_DATABASE_PRINCIPAL = 'myeongha_runtime';
  process.env.MYEONGHA_SUPABASE_URL = 'https://cnsfpcdiyofqvhpcegfc.supabase.co';
  process.env.MYEONGHA_SUPABASE_API_KEY =
    'sb_publishable_test_key_material_for_target_person_route';
  process.env.MYEONGHA_GUEST_FINGERPRINT_SECRET =
    'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes';
});

describe('Target Person /api/me Vercel dispatch', () => {
  it('canonicalizes the private list rewrite to the governed Target Person route', () => {
    const request = new Request(
      'https://myeongha.example/api/me?__myeongha_target_person_read=list',
    );

    const target = resolveMeDispatchTargetForTestV1(request);
    expect(target).toEqual({
      kind: 'target-person-list',
      route: '/api/target-persons',
    });
    expect(toCanonicalMeRequestForTestV1(request, target ?? undefined).url).toBe(
      'https://myeongha.internal/api/target-persons',
    );
  });

  it('canonicalizes the private detail rewrite to the exact Target Person id', () => {
    const request = new Request(
      `https://myeongha.example/api/me?__myeongha_target_person_read=detail&__myeongha_target_person_id=${TARGET_ID}`,
    );

    const target = resolveMeDispatchTargetForTestV1(request);
    expect(target).toEqual({
      kind: 'target-person-detail',
      route: `/api/target-persons/${TARGET_ID}`,
      targetPersonId: TARGET_ID,
    });
    expect(toCanonicalMeRequestForTestV1(request, target ?? undefined).url).toBe(
      `https://myeongha.internal/api/target-persons/${TARGET_ID}`,
    );
  });

  it('accepts Vercel-preserved public detail path only when all locator evidence matches', () => {
    const request = new Request(
      `https://myeongha.example/api/target-persons/${TARGET_ID}?__myeongha_target_person_read=detail&__myeongha_target_person_id=${TARGET_ID}&id=${TARGET_ID}`,
    );

    expect(resolveMeDispatchTargetForTestV1(request)).toMatchObject({
      kind: 'target-person-detail',
      targetPersonId: TARGET_ID,
    });
  });

  it.each([
    `https://myeongha.example/api/me?id=${TARGET_ID}`,
    `https://myeongha.example/api/me?__myeongha_target_person_id=${TARGET_ID}`,
    `https://myeongha.example/api/me?__myeongha_target_person_read=detail&__myeongha_target_person_id=${TARGET_ID}&id=${OTHER_TARGET_ID}`,
    `https://myeongha.example/api/target-persons/${OTHER_TARGET_ID}?__myeongha_target_person_read=detail&__myeongha_target_person_id=${TARGET_ID}`,
    'https://myeongha.example/api/me?__myeongha_target_person_read=list&subjectId=client-controlled',
    `https://myeongha.example/api/me?__myeongha_target_person_read=list&__myeongha_target_person_id=${TARGET_ID}`,
  ])('fails closed for client-only, conflicting, or authority-bearing locator input: %s', (url) => {
    expect(resolveMeDispatchTargetForTestV1(new Request(url))).toBeNull();
  });

  it.each([
    'https://myeongha.example/api/me?__myeongha_target_person_read=list',
    `https://myeongha.example/api/me?__myeongha_target_person_read=detail&__myeongha_target_person_id=${TARGET_ID}`,
  ])('reaches the Target Person runtime but rejects unauthenticated requests: %s', async (url) => {
    const response = await meEndpoint.fetch(new Request(url, { method: 'GET' }));

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      ok: false,
      error: {
        code: 'AUTH_REQUIRED',
        messageKey: 'auth.required',
        retryable: false,
      },
      meta: { apiContractVersion: 'v0.9' },
    });
  });
});
