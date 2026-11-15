import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  SajuProviderCallSourceAuthorityV1,
  VerifiedSajuProviderCallLinkV1,
} from './reading-ai-saju-binding-authority-v1.js';

type ExpectedCall = Parameters<SajuProviderCallSourceAuthorityV1['verifyProviderCall']>[0];

export const SAJU_PROVIDER_CALL_SOURCE_PROOF_VERSION_V1 =
  'saju-provider-call-source-proof-v1' as const;
const LINK_VERSION = 'saju-source-provider-call-link-v1';
const DOMAIN = 'myeongha/a4/saju-provider-call-proof/v1\0';
const IDENT = /^[a-zA-Z0-9._:-]{3,128}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HEX = /^[0-9a-f]{64}$/u;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const TOP_KEYS = ['payload', 'signatureHex'];
const PAYLOAD_KEYS = ['version', 'issuer', 'audience', 'keyId', 'issuedAtMs', 'link'];
const LINK_KEYS = ['version', 'externalRequestRef', 'executionAttemptId', 'observation'];
const OBS_KEYS = ['callId','requestId','providerKey','modelKey','source','outcome','observedAt','usage'];
const USAGE_KEYS = ['inputTokens','outputTokens','cachedInputTokens','reasoningTokens'];
const OUTCOMES = new Set(['response_received','http_failure','network_failure','timeout','invalid_response']);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function exact(v: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
}
/** Mirrors Saju's source-signature canonicalization, not application JSON parsing. */
function canonicalize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicalize);
  if (v === null || typeof v !== 'object') return v;
  const o = v as Record<string, unknown>;
  return Object.fromEntries(Object.keys(o).sort().map(k => [k, canonicalize(o[k])]));
}
function validUsage(observation: Record<string, unknown>): boolean {
  const usage = record(observation.usage);
  if (!usage || !exact(usage, USAGE_KEYS)) return false;
  for (const name of USAGE_KEYS) {
    const n = usage[name];
    if (n !== null && (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0)) {
      return false;
    }
  }
  if (observation.source === 'provider_attempt_without_usage') {
    return USAGE_KEYS.every(k => usage[k] === null);
  }
  return observation.source === 'provider_response_usage'
    && observation.outcome === 'response_received'
    && typeof usage.inputTokens === 'number'
    && typeof usage.outputTokens === 'number'
    && (usage.cachedInputTokens === null || Number(usage.cachedInputTokens) <= usage.inputTokens)
    && (usage.reasoningTokens === null || Number(usage.reasoningTokens) <= usage.outputTokens);
}
function readProof(
  signed: unknown,
  trust: Readonly<{ issuer: string; audience: string; keyId: string; keyBytes: Uint8Array }>,
  expected: ExpectedCall,
  nowMs: number,
): VerifiedSajuProviderCallLinkV1 | null {
  const proof = record(signed);
  if (!proof || !exact(proof, TOP_KEYS) || typeof proof.signatureHex !== 'string'
    || !HEX.test(proof.signatureHex)) return null;
  const payload = record(proof.payload);
  if (!payload || !exact(payload, PAYLOAD_KEYS)
    || payload.version !== SAJU_PROVIDER_CALL_SOURCE_PROOF_VERSION_V1
    || payload.issuer !== trust.issuer || payload.audience !== trust.audience
    || payload.keyId !== trust.keyId
    || !Number.isSafeInteger(payload.issuedAtMs)
    || !Number.isSafeInteger(nowMs) || nowMs < 0
    || Number(payload.issuedAtMs) > nowMs + 15_000) return null;
  const link = record(payload.link);
  const observation = record(link?.observation);
  if (!link || !exact(link, LINK_KEYS) || link.version !== LINK_VERSION
    || typeof link.externalRequestRef !== 'string'
    || !/^saju_source_[0-9a-f-]{36}$/u.test(link.externalRequestRef)
    || !UUID.test(link.externalRequestRef.slice('saju_source_'.length))
    || typeof link.executionAttemptId !== 'string'
    || !UUID.test(link.executionAttemptId)
    || !observation || !exact(observation, OBS_KEYS)
    || typeof observation.callId !== 'string' || !UUID.test(observation.callId)
    || typeof observation.requestId !== 'string' || observation.requestId.length === 0
    || observation.requestId.length > 256
    || typeof observation.modelKey !== 'string' || observation.modelKey.length === 0
    || observation.modelKey.length > 128
    || observation.providerKey !== 'openai'
    || !OUTCOMES.has(String(observation.outcome))
    || !validUsage(observation)
    || typeof observation.observedAt !== 'string'
    || !TIME.test(observation.observedAt)
    || !Number.isFinite(Date.parse(observation.observedAt))
    || Number(payload.issuedAtMs) < Date.parse(observation.observedAt) - 15_000
    || observation.callId !== expected.callId
    || observation.requestId !== expected.sajuRequestId
    || observation.modelKey !== expected.modelKey
    || observation.observedAt !== expected.observedAt
    // The binding alone is insufficient: a signed callId must not authorize
    // replacement token counters, outcome or missing-usage flags.
    || JSON.stringify(canonicalize(observation)) !==
       JSON.stringify(canonicalize(expected.observation))) return null;
  const computed = createHmac('sha256', trust.keyBytes)
    .update(DOMAIN).update(JSON.stringify(canonicalize(payload))).digest();
  const received = Buffer.from(proof.signatureHex, 'hex');
  if (received.length !== computed.length || !timingSafeEqual(received, computed)) return null;
  return Object.freeze({
    sajuRequestId: observation.requestId,
    callId: observation.callId,
    modelKey: observation.modelKey,
    observedAt: observation.observedAt,
    externalRequestRef: link.externalRequestRef,
    executionAttemptId: link.executionAttemptId.toLowerCase(),
  });
}

/**
 * Independent source proof of the *actual Saju provider call*.
 *
 * A separate authenticated, append-only Saju-owned receipt reader must be
 * mounted for loadSignedCallById. User/browser supplied payloads are forbidden.
 * This does not replace the DB verifier, issue a Reading, or collect costs.
 */
export function createSajuSignedProviderCallSourceAuthorityV1(input: Readonly<{
  trustedIssuer: string;
  expectedAudience: string;
  trustedKeyId: string;
  keyBytes: Uint8Array;
  nowMs: () => number;
  loadSignedCallById: (callId: string) => Promise<unknown>;
}>): SajuProviderCallSourceAuthorityV1 {
  if (!IDENT.test(input.trustedIssuer) || !IDENT.test(input.expectedAudience)
    || !IDENT.test(input.trustedKeyId) || !(input.keyBytes instanceof Uint8Array)
    || input.keyBytes.byteLength < 32 || typeof input.nowMs !== 'function'
    || typeof input.loadSignedCallById !== 'function') {
    throw new TypeError('Trusted Saju provider call proof dependencies required');
  }
  const key = Uint8Array.from(input.keyBytes);
  const trust = Object.freeze({
    issuer: input.trustedIssuer, audience: input.expectedAudience,
    keyId: input.trustedKeyId, keyBytes: key,
  });
  return Object.freeze({
    async verifyProviderCall(request: ExpectedCall) {
      if (!UUID.test(request.callId) || typeof request.sajuRequestId !== 'string'
        || request.sajuRequestId.length < 1 || request.sajuRequestId.length > 256
        || typeof request.modelKey !== 'string' || request.modelKey.length < 1
        || request.modelKey.length > 128 || typeof request.observedAt !== 'string'
        || !TIME.test(request.observedAt)) return null;
      try {
        const signed = await input.loadSignedCallById(request.callId);
        return readProof(signed, trust, request, input.nowMs());
      } catch {
        // Missing/unavailable source-owned immutable receipt store is HOLD.
        return null;
      }
    },
  });
}
