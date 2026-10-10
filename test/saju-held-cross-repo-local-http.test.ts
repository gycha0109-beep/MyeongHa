import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createSajuHeldSourceProofHttpIssuePortV1,
  SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1,
  SajuHeldSourceProofHttpErrorV1,
  type SajuHeldSourceProofHttpFetchV1,
} from '../apps/api/src/saju-held-source-proof-http-client-v1.js';
import { verifySajuHeldSourceProofV1 } from '../apps/api/src/saju-held-source-proof-verifier-v1.js';

const port = Number(process.env.MYEONGHA_LOCAL_SAJU_PORT);
const bearer = process.env.MYEONGHA_LOCAL_SAJU_BEARER;
const key = process.env.MYEONGHA_LOCAL_SAJU_HMAC_KEY;
const issuer = process.env.MYEONGHA_LOCAL_SAJU_ISSUER;
const audience = process.env.MYEONGHA_LOCAL_SAJU_AUDIENCE;
const keyId = process.env.MYEONGHA_LOCAL_SAJU_KEY_ID;
const enabled = Number.isInteger(port) && port > 0 && port <= 65535
  && Boolean(bearer && key && issuer && audience && keyId);

const origin = 'https://saju-proof-local-test.invalid';
const endpoint = enabled ? 'http://127.0.0.1:' + port + SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1 : '';

/**
 * Test-only transport shim: the actual MyeongHa client keeps its strict
 * HTTPS-only server configuration. Only this Vitest suite may redirect the
 * exact fixed destination to the live Saju process on 127.0.0.1.
 */
const loopbackFetch: SajuHeldSourceProofHttpFetchV1 = async (url, init) => {
  if (!enabled || url !== origin + SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1
    || init.method !== 'POST' || init.redirect !== 'manual') {
    throw new Error('Local proof routing is not allowed.');
  }
  return fetch(endpoint, init);
};

const vectors = [
  {
    birth: { calendarType: 'solar' as const, date: '2024-03-10', time: '12:00',
      sex: 'unspecified' as const },
    reading: { text: '전체 사주' },
  },
  {
    birth: { calendarType: 'solar' as const, date: '2001-07-14', time: '15:20',
      sex: 'female' as const },
    reading: { text: '전체 사주' },
  },
  {
    birth: { calendarType: 'solar' as const, date: '1990-04-15', time: '13:20',
      sex: 'male' as const },
    reading: { text: '전체 사주' },
  },
] as const;

describe.skipIf(!enabled)('real cross-repository loopback: Saju issuer -> MyeongHa client', () => {
  it('exposes only the protected issuer route and rejects absent credentials on an actual socket', async () => {
    expect((await fetch(endpoint, { redirect: 'manual' })).status).toBe(405);
    expect((await fetch('http://127.0.0.1:' + port + '/api/readings',
      { redirect: 'manual' })).status).toBe(404);
    expect((await fetch(endpoint, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })).status).toBe(401);
    const invalid = await fetch(endpoint, {
      method: 'POST', redirect: 'manual',
      headers: {
        authorization: 'Bearer ' + bearer,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ nonce: 'bad', request: vectors[0] }),
    });
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get('cache-control')).toBe('no-store');
  });

  it('fails closed on an invalid Bearer in the real Saju service', async () => {
    const client = createSajuHeldSourceProofHttpIssuePortV1({
      serviceOrigin: origin,
      serviceBearer: 'deliberately-wrong-local-bearer',
      fetchImpl: loopbackFetch,
    });
    await expect(client.issuePreviewProof({
      nonce: randomBytes(24).toString('base64url'),
      request: structuredClone(vectors[0]),
    })).rejects.toMatchObject({
      code: 'UPSTREAM_REJECTED',
    } satisfies Partial<SajuHeldSourceProofHttpErrorV1>);
  });

  it('verifies a real Saju signed envelope with MyeongHa HMAC, request binding and replay blocking', async () => {
    const client = createSajuHeldSourceProofHttpIssuePortV1({
      serviceOrigin: origin, serviceBearer: bearer!, fetchImpl: loopbackFetch,
    });
    let matched: { envelope: unknown; request: typeof vectors[number]; nonce: string } | undefined;
    for (const request of vectors) {
      const nonce = randomBytes(24).toString('base64url');
      try {
        const envelope = await client.issuePreviewProof({ nonce, request: structuredClone(request) });
        matched = { envelope, request, nonce };
        break;
      } catch (error) {
        if (!(error instanceof SajuHeldSourceProofHttpErrorV1)
          || error.code !== 'UPSTREAM_REJECTED') throw error;
      }
    }
    // 409 means the real engine refused to issue an incomplete source proof.
    // That is a separate source-evidence gap, not a successful bridge proof.
    expect(matched, 'Saju must issue a source-backed Preview proof for at least one disposable vector')
      .toBeDefined();
    if (!matched) return;
    const { envelope, nonce, request } = matched;
    const consumed = new Set<string>(); // synthetic replay store; NOT operational admission.
    const claimNonceOnce = async (id: string) => {
      if (consumed.has(id)) return false;
      consumed.add(id);
      return true;
    };
    const trust = {
      trustedIssuer: issuer!, expectedAudience: audience!, trustedKeyId: keyId!,
      keyBytes: Buffer.from(key!, 'base64'),
      claimNonceOnce,
    };
    const context = { expectedNonce: nonce, expectedRequestBody: request, nowMs: Date.now() };

    expect(await verifySajuHeldSourceProofV1(envelope, {
      ...trust, expectedAudience: 'wrong-audience',
    }, context)).toMatchObject({ state: 'blocked', canSell: false });
    expect(await verifySajuHeldSourceProofV1(envelope, trust, {
      ...context, expectedNonce: randomBytes(24).toString('base64url'),
    })).toMatchObject({ state: 'blocked', canExecute: false });

    const good = await verifySajuHeldSourceProofV1(envelope, trust, context);
    expect(good).toMatchObject({
      state: 'held', transportIntegrity: 'VERIFIED',
      sourceAuthority: 'NOT_EVALUATED', releaseAuthorization: 'NOT_EVALUATED',
      canExecute: false, canPublish: false, canSell: false,
    });
    expect(await verifySajuHeldSourceProofV1(envelope, trust, context))
      .toMatchObject({ state: 'blocked', transportIntegrity: 'NOT_VERIFIED' });
    const tampered = structuredClone(envelope) as { response: { responseId: string } };
    tampered.response.responseId = 'forged-response';
    expect(await verifySajuHeldSourceProofV1(tampered, trust, {
      ...context, expectedNonce: nonce,
    })).toMatchObject({ state: 'blocked', canPublish: false });
    console.log('[saju-bridge] Real issuer HTTP + signed envelope + MyeongHa verifier: HELD transport-only.');
  });
});
