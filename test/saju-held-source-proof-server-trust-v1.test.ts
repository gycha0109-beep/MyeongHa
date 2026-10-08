import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createSajuHeldSourceProofServerTrustV1,
  type SajuHeldSourceProofServerTrustOptionsV1,
} from '../apps/api/src/saju-held-source-proof-server-trust-v1.js';
import {
  verifySajuHeldSourceProofV1,
} from '../apps/api/src/saju-held-source-proof-verifier-v1.js';
import type {
  PostgresSubjectPoolV1, PostgresQueryResultV1,
} from '../apps/api/src/postgres-subject-execution.js';

const issuedAtMs = 1_800_000_000_000;
const keyBytes = Buffer.alloc(32, 73);
const nonce = 'Q'.repeat(24);
const expectedRequest = {
  birth: { calendarType: 'solar' as const, date: '2001-07-14', time: null },
  reading: { text: '전체 사주' },
};
const domain = 'myeongha/saju/source-transport-proof/v1\0';

function canonicalize(value: unknown): unknown {
  if (value === undefined) return { $undefined: true };
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return { $number: String(value) };
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;
  const object = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(object).sort().map(key =>
    [key, canonicalize(object[key])]));
}
function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}
function proofEnvelope() {
  const response = {
    responseVersion: 'myeonghwa-product-reading-response-v2',
    responseId: 'reading_response_' + 'c'.repeat(24),
    state: 'delivered', messageCode: 'READING_DELIVERED', requiredAction: 'none',
    reading: {
      readingId: 'synthetic-reading-natal',
      brand: { brandId: 'myeonghwa', displayName: '명화' },
      subject: { displayLabel: '합성 사용자',
        birthInputDisplay: { calendarType: 'solar', date: '2001-07-14', timeKnown: false },
        calculationState: 'resolved' },
      calculationSummary: { pillars: Object.fromEntries(
        ['year','month','day','hour'].map(key =>
          [key, { label: key, status: 'resolved', value: '테스트' }])) },
      sections: [{ sectionType: 'overview', title: '테스트', state: 'complete',
        blocks: [{ type: 'paragraph', text: '출시 근거 아님' }] }],
      disclosures: [{ type: 'scope_limitation', text: '합성 자료' }],
      generatedAt: '2026-10-08T00:00:00Z',
    },
  };
  const material = {
    snapshotId: 'synthetic-snapshot', interpretationRunId: 'synthetic-run',
    registrySnapshotId: 'synthetic-registry', executionId: 'synthetic-execution',
    preparationId: 'synthetic-preparation', selectionId: 'synthetic-selection',
    profileRef: { id: 'synthetic-profile', version: 'version-1',
      contentHash: 'a'.repeat(64) },
    evidenceBundleHash: 'b'.repeat(64),
    readingId: response.reading.readingId,
    responseId: response.responseId, responseBodyHash: hash(response),
  };
  const payload = {
    version: 'myeonghwa-source-reading-transport-proof-v1',
    lifecycle: 'preview', issuer: 'saju-preview-service',
    audience: 'myeongha-api-service', keyId: 'preview-key-v1',
    nonce, issuedAtMs, expiresAtMs: issuedAtMs + 60_000,
    requestBodyHash: hash(expectedRequest), responseBodyHash: hash(response),
    material, productionInterpretationAuthority: 'NOT_EVALUATED',
    releaseAuthorization: 'NOT_EVALUATED',
    canExecute: false, canPublish: false, canSell: false,
  };
  return {
    schemaVersion: 'myeonghwa-source-reading-proof-http-v1',
    lifecycle: 'preview', state: 'held', response,
    proof: { payload, signatureHex: createHmac('sha256', keyBytes)
      .update(domain).update(hash(payload)).digest('hex') },
    productionInterpretationAuthority: 'NOT_EVALUATED',
    releaseAuthorization: 'NOT_EVALUATED',
    canExecute: false, canPublish: false, canSell: false,
  };
}

function fixture(config: { claimDbUnavailable?: boolean; failRole?: boolean } = {}) {
  const queries: string[] = [];
  const values: unknown[][] = [];
  const consumed = new Set<string>();
  const release = vi.fn();
  const pool: PostgresSubjectPoolV1 = {
    async connect() {
      if (config.claimDbUnavailable) throw Error('DB connection unavailable');
      return {
        async query<Row = Record<string, unknown>>(
          sql: string, args?: readonly unknown[],
        ): Promise<PostgresQueryResultV1<Row>> {
          queries.push(sql);
          if (args !== undefined) values.push([...args]);
          if (config.failRole && sql.startsWith('SET LOCAL ROLE')) {
            throw Error('Missing runtime role membership');
          }
          if (sql.includes('insert into public.saju_source_proof_nonce_claims')) {
            const digest = args?.[0];
            if (typeof digest !== 'string') throw Error('Invalid SQL fixture');
            if (consumed.has(digest)) return { rows: [] };
            consumed.add(digest);
            return { rows: [{ replay_key_digest: digest }] as Row[] };
          }
          return { rows: [] };
        },
        release,
      };
    },
  };
  const fetchImpl = vi.fn(async (_url: string, _init: {
    method: 'POST'; headers: Readonly<Record<string, string>>;
    body: string; redirect: 'manual'; signal: AbortSignal;
  }) => Response.json(proofEnvelope(), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store' },
  }));
  const input = {
    serviceOrigin: 'https://saju-proof.example',
    serviceBearer: 'synthetic-service-bearer',
    trustedIssuer: 'saju-preview-service',
    expectedAudience: 'myeongha-api-service',
    trustedKeyId: 'preview-key-v1',
    keyBytes,
    noncePool: pool,
    fetchImpl,
    nonceNowMsFactory: () => issuedAtMs + 1_000,
  };
  const context = {
    expectedNonce: nonce, expectedRequestBody: expectedRequest,
    nowMs: issuedAtMs + 1_000,
  };
  return { input, context, fetchImpl, queries, values, release };
}

describe('2B-3C-8A server-only Saju transport + proof trust composition', () => {
  it('verifies an independently signed HTTP response with one durable SQL nonce claim', async () => {
    const f = fixture();
    const ports = createSajuHeldSourceProofServerTrustV1(f.input);
    expect(f.queries).toHaveLength(0);
    expect(f.fetchImpl).not.toHaveBeenCalled();
    const response = await ports.issuePort.issuePreviewProof({
      nonce, request: expectedRequest,
    });
    const first = await verifySajuHeldSourceProofV1(
      response, ports.verifierTrust, f.context,
    );
    expect(first).toMatchObject({
      state: 'held', transportIntegrity: 'VERIFIED',
      sourceAuthority: 'NOT_EVALUATED', releaseAuthorization: 'NOT_EVALUATED',
      canExecute: false, canPublish: false, canSell: false,
    });
    expect(f.fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = f.fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://saju-proof.example/api/internal/preview/source-readings');
    expect(init.redirect).toBe('manual');
    expect(init.headers.authorization).toBe('Bearer synthetic-service-bearer');
    expect(f.queries).toEqual([
      'BEGIN', 'SET LOCAL ROLE myeongha_saju_proof_nonce_runtime',
      expect.stringContaining('on conflict (replay_key_digest) do nothing'), 'COMMIT',
    ]);
    expect(f.values[0]?.[0]).toMatch(/^[0-9a-f]{64}$/u);
    expect(f.values[0]?.[1]).toBe(new Date(issuedAtMs + 90_000).toISOString());
    expect(f.release).toHaveBeenCalledOnce();
    expect(JSON.stringify(first)).not.toContain('synthetic-service-bearer');
    expect(JSON.stringify(first)).not.toContain('2001-07-14');

    expect(await verifySajuHeldSourceProofV1(response, ports.verifierTrust, f.context))
      .toMatchObject({ state: 'blocked', transportIntegrity: 'NOT_VERIFIED' });
    expect(f.release).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['database offline', { claimDbUnavailable: true }],
    ['role membership missing', { failRole: true }],
  ])('fails closed on %s without in-memory replay fallback', async (_label, failure) => {
    const f = fixture(failure);
    const ports = createSajuHeldSourceProofServerTrustV1(f.input);
    const response = await ports.issuePort.issuePreviewProof({
      nonce, request: expectedRequest,
    });
    expect(await verifySajuHeldSourceProofV1(response, ports.verifierTrust, f.context))
      .toMatchObject({ state: 'blocked', transportIntegrity: 'NOT_VERIFIED', canSell: false });
  });

  it('rejects signed payload with wrong verifier key before opening nonce DB', async () => {
    const f = fixture();
    const ports = createSajuHeldSourceProofServerTrustV1({
      ...f.input, keyBytes: Buffer.alloc(32, 77),
    });
    const response = await ports.issuePort.issuePreviewProof({
      nonce, request: expectedRequest,
    });
    expect(await verifySajuHeldSourceProofV1(response, ports.verifierTrust, f.context))
      .toMatchObject({ state: 'blocked', transportIntegrity: 'NOT_VERIFIED' });
    expect(f.queries).toHaveLength(0);
  });

  it('copies verifier key before caller mutation', () => {
    const f = fixture();
    const key = Buffer.from(keyBytes);
    const ports = createSajuHeldSourceProofServerTrustV1({ ...f.input, keyBytes: key });
    key.fill(0);
    expect(Buffer.from(ports.verifierTrust.keyBytes)).toEqual(keyBytes);
    expect(ports.verifierTrust.keyBytes).not.toBe(key);
  });

  it('rejects incomplete or unsafe trust configuration synchronously', () => {
    const f = fixture();
    for (const overrides of [
      { keyBytes: Buffer.alloc(8) }, { trustedIssuer: 'x' },
      { expectedAudience: '' }, { trustedKeyId: 'bad/key' },
      { serviceOrigin: 'http://saju-proof.example' }, { serviceBearer: '' },
      { noncePool: {} }, { timeoutMs: 40_000 },
    ]) {
      const invalid = { ...f.input, ...overrides } as unknown as SajuHeldSourceProofServerTrustOptionsV1;
      expect(() => createSajuHeldSourceProofServerTrustV1(invalid)).toThrow();
    }
    expect(f.queries).toHaveLength(0);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
});
