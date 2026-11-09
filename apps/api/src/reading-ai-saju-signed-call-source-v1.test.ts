import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSajuSignedProviderCallSourceAuthorityV1 } from './reading-ai-saju-signed-call-source-v1.js';

const KEY = new Uint8Array(Buffer.from('a'.repeat(64), 'hex'));
const ID = '123e4567-e89b-42d3-a456-426614174002';
const CALL = '123e4567-e89b-42d3-a456-426614174003';
const SOURCE = '123e4567-e89b-42d3-a456-426614174004';
const AT = '2026-11-09T08:00:00.000Z';
const NOW = Date.parse(AT) + 1_000;
const REQUEST = { sajuRequestId: 'host_private', callId: CALL, modelKey: 'gpt-5.6', observedAt: AT };
const DOMAIN = 'myeongha/a4/saju-provider-call-proof/v1\0';

const OBS = Object.freeze({
  callId: CALL, requestId: REQUEST.sajuRequestId, providerKey: 'openai' as const,
  modelKey: REQUEST.modelKey, source: 'provider_response_usage' as const, outcome: 'response_received' as const,
  observedAt: AT,
  usage: { inputTokens: 120, outputTokens: 35, cachedInputTokens: 20, reasoningTokens: 10 },
});
const PROOF_REQUEST = { ...REQUEST, observation: OBS };
function canonicalize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicalize);
  if (v === null || typeof v !== 'object') return v;
  const o = v as Record<string, unknown>;
  return Object.fromEntries(Object.keys(o).sort().map(k => [k, canonicalize(o[k])]));
}
function signed(overrides: Record<string, unknown> = {}) {
  const payload = {
    version: 'saju-provider-call-source-proof-v1',
    issuer: 'saju.private', audience: 'myeongha.admin', keyId: 'a4.key.1',
    issuedAtMs: NOW, link: {
      version: 'saju-source-provider-call-link-v1',
      externalRequestRef: 'saju_source_' + SOURCE, executionAttemptId: ID,
      observation: OBS,
    }, ...overrides,
  };
  return { payload, signatureHex: createHmac('sha256', KEY).update(DOMAIN)
    .update(JSON.stringify(canonicalize(payload))).digest('hex') };
}
function authority(load: (callId: string) => Promise<unknown>) {
  return createSajuSignedProviderCallSourceAuthorityV1({
    trustedIssuer:'saju.private', expectedAudience:'myeongha.admin', trustedKeyId:'a4.key.1',
    keyBytes: KEY, nowMs:()=>NOW + 2000, loadSignedCallById: load,
  });
}

describe('A4 private Saju source-issued provider proof', () => {
  it('accepts only the exact signed source call and returns a DB-verifiable link', async () => {
    const proof = signed();
    const source = authority(async callId => {
      expect(callId).toBe(CALL);
      return proof;
    });
    expect(await source.verifyProviderCall(PROOF_REQUEST)).toEqual({
      ...REQUEST, externalRequestRef: 'saju_source_' + SOURCE, executionAttemptId: ID,
    });
  });

  it('rejects wrong issuer/key/audience and altered source-to-attempt links', async () => {
    const valid = signed();
    const tampered = {
      ...valid, payload: {...valid.payload, link: {
        ...valid.payload.link, executionAttemptId:'123e4567-e89b-42d3-a456-426614174999',
      }},
    };
    expect(await authority(async()=>tampered).verifyProviderCall(PROOF_REQUEST)).toBeNull();
    expect(await authority(async()=>signed({issuer:'someone.else'})).verifyProviderCall(PROOF_REQUEST))
      .toBeNull();
    expect(await authority(async()=>signed({audience:'other.reader'})).verifyProviderCall(PROOF_REQUEST))
      .toBeNull();
    const wrongKey = createSajuSignedProviderCallSourceAuthorityV1({
      trustedIssuer:'saju.private', expectedAudience:'myeongha.admin', trustedKeyId:'a4.key.1',
      keyBytes: new Uint8Array(32), nowMs:()=>NOW + 2000, loadSignedCallById:async()=>valid,
    });
    expect(await wrongKey.verifyProviderCall(PROOF_REQUEST)).toBeNull();
    expect(await authority(async()=>valid).verifyProviderCall({...PROOF_REQUEST,modelKey:'other'}))
      .toBeNull();
    expect(await authority(async()=>valid).verifyProviderCall({...PROOF_REQUEST,observation:{...OBS,usage:{...OBS.usage,inputTokens:9999}}})).toBeNull();
    expect(await authority(async()=>valid).verifyProviderCall({...PROOF_REQUEST,observation:{...OBS,outcome:'http_failure'}})).toBeNull();
    expect(await authority(async()=>valid).verifyProviderCall({...PROOF_REQUEST,callId:ID}))
      .toBeNull();
  });

  it('rejects malformed, missing and future-dated proofs without a false cost attribution', async () => {
    expect(await authority(async()=>null).verifyProviderCall(PROOF_REQUEST)).toBeNull();
    expect(await authority(async()=>{throw Error('source receipt store unavailable')})
      .verifyProviderCall(PROOF_REQUEST)).toBeNull();
    expect(await authority(async()=>signed({issuedAtMs:NOW+90_000}))
      .verifyProviderCall(PROOF_REQUEST)).toBeNull();
    expect(await authority(async()=>signed({extra:'unexpected'}))
      .verifyProviderCall(PROOF_REQUEST)).toBeNull();
    expect(await authority(async()=>signed({link:{
      ...signed().payload.link,
      observation: {...OBS, usage:{inputTokens:null,outputTokens:null,cachedInputTokens:null,reasoningTokens:null}},
    }})).verifyProviderCall(PROOF_REQUEST)).toBeNull();
  });

  it('refuses production trust without a real server-owned source read port and 32-byte key', () => {
    expect(()=>createSajuSignedProviderCallSourceAuthorityV1({
      trustedIssuer:'saju.private', expectedAudience:'myeongha.admin', trustedKeyId:'a4.key.1',
      keyBytes:new Uint8Array(2), nowMs:()=>NOW,
      loadSignedCallById:async()=>signed(),
    })).toThrow();
  });
});
