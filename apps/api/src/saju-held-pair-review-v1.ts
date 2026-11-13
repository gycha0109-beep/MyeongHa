import { randomBytes, verify, type KeyObject } from 'node:crypto';
import type { readApprovedSajuPairIssueScopeV1 } from './postgres-approved-saju-issue-scope-v1.js';
import { hashSajuHeldSourceProofRequestV1 as hashJson } from './saju-held-source-proof-verifier-v1.js';
import { readBoundedUpstreamJsonTextV1 } from './upstream-json-response-resource.js';

const VERSION = 'myeonghwa-held-pair-review-v1';
const PATH = '/api/preview/compatibility-evidence';
const HASH = /^[a-f0-9]{64}$/u;
type Pair = NonNullable<Awaited<ReturnType<typeof readApprovedSajuPairIssueScopeV1>>>['request'];

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function discard(response: Response): null {
  void response.body?.cancel().catch(() => undefined);
  return null;
}

/** Evidence transport for a held comparison. Official issuance uses a separate authority. */
export function createSajuHeldPairReviewPortV1(input: Readonly<{
  origin: string;
  bearerToken: string;
  keyId: string;
  verificationKey: KeyObject;
  fetchImpl?: typeof fetch;
}>) {
  const origin = new URL(input.origin);
  if (origin.origin !== input.origin || origin.protocol !== 'https:' ||
    !/^[a-zA-Z0-9._:-]{3,128}$/u.test(input.keyId) || !/^\S{24,1024}$/u.test(input.bearerToken) ||
    input.verificationKey.type !== 'public' || input.verificationKey.asymmetricKeyType !== 'ed25519') {
    throw new TypeError('The held comparison review requires its private HTTPS host and verification key.');
  }
  const { bearerToken, keyId, verificationKey, fetchImpl = fetch } = input;
  const url = new URL(PATH, origin).toString();
  return Object.freeze({
    async inspectSource(pair: Pair) {
      const body = { birth: pair.birth, partnerBirth: pair.partnerBirth, candidateScope: 'traditional_marital_palace_comparison' };
      const requestJson = JSON.stringify(body);
      const nonce = randomBytes(32).toString('base64url');
      const signal = AbortSignal.timeout(10_000);
      const response = await fetchImpl(url, {
        method: 'POST', redirect: 'error', cache: 'no-store', signal,
        headers: { Authorization: 'Bearer ' + bearerToken, 'Content-Type': 'application/json',
          'x-myeongha-pair-review-nonce': nonce },
        body: requestJson,
      });
      const encoded = response.headers.get('x-myeonghwa-pair-review-proof');
      if (!response.ok || response.headers.get('x-myeonghwa-reading-lifecycle') !== 'preview' ||
        encoded === null || !/^[a-zA-Z0-9_-]{1,2048}$/u.test(encoded)) {
        return discard(response);
      }
      let proof: unknown;
      try {
        proof = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      } catch {
        return discard(response);
      }
      if (!record(proof) || Object.keys(proof).length !== 2 || !record(proof.payload) ||
        typeof proof.signature !== 'string' || !/^[a-zA-Z0-9_-]{86}$/u.test(proof.signature)) {
        return discard(response);
      }
      const { payload, signature } = proof;
      if (Object.keys(payload).length !== 6 || payload.version !== VERSION || payload.keyId !== keyId ||
        payload.state !== 'held' || payload.nonce !== nonce || payload.requestBodyHash !== hashJson(JSON.parse(requestJson)) ||
        typeof payload.responseBodyHash !== 'string' || !HASH.test(payload.responseBodyHash) ||
        !verify(null, Buffer.from(VERSION + '\0' + hashJson(payload)), verificationKey, Buffer.from(signature, 'base64url'))) {
        return discard(response);
      }
      const result: unknown = JSON.parse(await readBoundedUpstreamJsonTextV1(response, {
        maximumBodyBytes: 128 * 1024, signal,
      }));
      if (!record(result) || hashJson(result) !== payload.responseBodyHash ||
        result.lifecycle !== 'internal_preview_only' || result.maySell !== false || result.mayPublish !== false ||
        result.mayPersist !== false || result.generatedInterpretationClaims !== false ||
        !record(result.evidence) || !record(result.evidence.readingReview) ||
        result.evidence.readingReview.state !== 'held' ||
        result.evidence.readingReview.actualCompatibilityReadingReady !== false ||
        result.evidence.readingReview.mayGrantOfficialAuthority !== false) return null;
      return result;
    },
  });
}
