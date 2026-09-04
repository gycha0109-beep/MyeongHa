import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBirthRuntimeClient } from '../apps/web/birth-runtime-client.js';

const root = process.cwd();
const webRoot = join(root, 'apps', 'web');
const authSource = readFileSync(join(webRoot, 'product-auth.js'), 'utf8');
const clientSource = readFileSync(join(webRoot, 'birth-runtime-client.js'), 'utf8');
const pageSource = readFileSync(join(webRoot, 'birth-page.js'), 'utf8');
const birthHtml = readFileSync(join(webRoot, 'birth.html'), 'utf8');
const myHtml = readFileSync(join(webRoot, 'my.html'), 'utf8');
const myPage = readFileSync(join(webRoot, 'my-page.js'), 'utf8');

function envelope(data) {
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'v0.9',
      requestId: 'test-request',
      serverTime: '2026-09-05T00:00:00.000Z',
    },
  };
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const guestBearer = async () => ({ kind: 'guest', token: 'opaque-guest-token' });

describe('web Birth session guard', () => {
  it('keeps active bearer bootstrap server-owned and rejects JWT-like guest tokens', () => {
    expect(authSource).toContain('export async function ensureActiveBearer()');
    expect(authSource).toContain("postJson('/api/session/bootstrap', {})");
    expect(authSource).toContain('isJwtLike(token)');
    expect(authSource).toContain('writeSession(GUEST_TOKEN_KEY, token)');
  });

  it('uses the same resolved bearer for authoritative current read and create', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url) === '/api/me/birth-profile') {
        return jsonResponse(200, envelope({ birthProfile: null }));
      }
      return jsonResponse(200, envelope({
        birthProfileId: 'birth-profile-id',
        revisionId: 'revision-id',
        revisionNo: 1,
      }));
    };
    const client = createBirthRuntimeClient({ fetchImpl, resolveBearer: guestBearer });

    await expect(client.readCurrentBirthProfile()).resolves.toBeNull();
    await expect(client.createBirthProfile({
      label: null,
      input: {
        calendarType: 'solar',
        birthDate: '2001-02-03',
        birthTime: null,
        timeKnown: false,
        isLeapMonth: false,
        sex: null,
      },
    })).resolves.toEqual({ birthProfileId: 'birth-profile-id', revisionId: 'revision-id', revisionNo: 1 });

    expect(calls).toHaveLength(2);
    expect(new Headers(calls[0].init.headers).get('Authorization')).toBe('Bearer opaque-guest-token');
    expect(new Headers(calls[1].init.headers).get('Authorization')).toBe('Bearer opaque-guest-token');
    expect(calls[0].init.method).toBe('GET');
    expect(calls[1].init.method).toBe('POST');
  });

  it('fails closed on unauthorized, malformed, and network-failed current reads', async () => {
    const unauthorized = createBirthRuntimeClient({
      fetchImpl: async () => jsonResponse(401, { ok: false }),
      resolveBearer: guestBearer,
    });
    await expect(unauthorized.readCurrentBirthProfile()).rejects.toMatchObject({ code: 'WEB_BIRTH_SESSION_REQUIRED' });

    const malformed = createBirthRuntimeClient({
      fetchImpl: async () => jsonResponse(200, envelope({ unexpected: true })),
      resolveBearer: guestBearer,
    });
    await expect(malformed.readCurrentBirthProfile()).rejects.toMatchObject({ code: 'WEB_BIRTH_MALFORMED_CURRENT' });

    const network = createBirthRuntimeClient({
      fetchImpl: async () => { throw new Error('network down'); },
      resolveBearer: guestBearer,
    });
    await expect(network.readCurrentBirthProfile()).rejects.toMatchObject({ code: 'WEB_BIRTH_CURRENT_REQUEST_FAILED' });
  });

  it('validates existing current self profile identity before treating it as present', async () => {
    const client = createBirthRuntimeClient({
      fetchImpl: async () => jsonResponse(200, envelope({
        birthProfile: {
          birthProfileId: 'birth-profile-id',
          profileKind: 'self',
          archivedAt: null,
          currentRevision: { revisionId: 'revision-id', revisionNo: 3 },
        },
      })),
      resolveBearer: guestBearer,
    });
    await expect(client.readCurrentBirthProfile()).resolves.toEqual({
      birthProfileId: 'birth-profile-id',
      revisionId: 'revision-id',
      revisionNo: 3,
    });
  });

  it('preflights again at submit and never exposes edit semantics for an existing Birth profile', () => {
    expect(pageSource).toContain('const current = await client.readCurrentBirthProfile();');
    expect(pageSource).toContain('if (current) {');
    expect(pageSource).toContain('showExisting(current);');
    expect(pageSource).toContain('const receipt = await client.createBirthProfile(request);');
    expect(birthHtml).toContain('이미 저장된 출생 정보가 있습니다.');
    expect(birthHtml).toContain('두 번째 본인 Birth Profile을 만들지 않습니다.');
    expect(birthHtml).not.toContain('수정 저장');
    expect(clientSource).toContain("const DEFAULT_CURRENT_ENDPOINT = '/api/me/birth-profile'");
    expect(clientSource).not.toContain('subjectId');
    expect(clientSource).not.toContain('authUserId');
    expect(clientSource).not.toContain('inputHash');
  });

  it('keeps the My Birth route fail-closed until authoritative null is rendered', () => {
    expect(myHtml).toContain('id="my-birth-route" href="#my-birth-title"');
    expect(myPage).toContain("if (mode === 'create')");
    expect(myPage).toContain("route.href = 'birth.html'");
    expect(myPage).toContain("route.href = '#my-birth-title'");
    expect(myPage).toContain("setBirthRoute('create')");
    expect(myPage).toContain("setBirthRoute('current')");
    expect(myHtml).toContain('알림과 이용 권한 설정은 준비 중입니다.');
    expect(myPage).toContain('내 정보를 보려면 현재 세션이 필요합니다.');
    expect(myPage).toContain('확인되지 않은 계정 정보를 대신 표시하지 않습니다.');
  });
});
