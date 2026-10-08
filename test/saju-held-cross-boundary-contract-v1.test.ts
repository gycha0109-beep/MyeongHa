import { createHash, createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSajuHeldCurrentBirthServerRehearsalV1 } from '../apps/api/src/saju-held-current-birth-server-rehearsal-v1.js';
import { createSajuHeldSourceProofServerTrustV1 } from '../apps/api/src/saju-held-source-proof-server-trust-v1.js';
import { verifySajuHeldSourceProofV1 } from '../apps/api/src/saju-held-source-proof-verifier-v1.js';
import type {
  PostgresSubjectPoolV1,
  PostgresQueryResultV1,
} from '../apps/api/src/postgres-subject-execution.js';

const AUTH = '22222222-2222-4222-8222-222222222222';
const SUBJECT = '11111111-1111-4111-8111-111111111111';
const PROFILE = '33333333-3333-4333-8333-333333333333';
const REVISION = '44444444-4444-4444-8444-444444444444';
const NOW = 1_800_000_000_000;
const KEY = Buffer.alloc(32, 73);
const BEARER = 'synthetic-service-only-credential';
const ISSUER = 'saju-preview-service';
const AUDIENCE = 'myeongha-api-service';
const NONCE_ROLE = 'SET LOCAL ROLE myeongha_saju_proof_nonce_runtime';
const SOURCE_DOMAIN = 'myeongha/saju/source-transport-proof/v1\0';

type Mode = 'ok' | 'tampered-response' | 'wrong-key' | 'wrong-issuer'
  | 'wrong-nonce' | 'wrong-request' | 'expired' | 'release-injection'
  | 'upstream-rejected' | 'nonce-db-offline' | 'nonce-role-denied'
  | 'revision-changed';

function normalize(value: unknown): unknown {
  if (value === undefined) return { $undefined: true };
  if (typeof value === 'number' && !Number.isFinite(value)) return { $number: String(value) };
  if (Array.isArray(value)) return value.map(normalize);
  if (value === null || typeof value !== 'object') return value;
  const item = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(item).sort().map(k => [k, normalize(item[k])]));
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(normalize(value))).digest('hex');
}

function readingResponse() {
  const pillar = (label: string) => ({ label, status: 'resolved', value: '합성 검증' });
  return {
    responseVersion: 'myeonghwa-product-reading-response-v2',
    responseId: 'reading_response_' + 'c'.repeat(24),
    state: 'delivered',
    messageCode: 'READING_DELIVERED',
    requiredAction: 'none',
    reading: {
      readingId: 'synthetic-general-natal-reading',
      brand: { brandId: 'myeonghwa', displayName: '명화' },
      subject: {
        displayLabel: '합성 사용자',
        birthInputDisplay: { calendarType: 'solar', date: '2001-07-14', timeKnown: true },
        calculationState: 'resolved',
      },
      calculationSummary: {
        pillars: { year: pillar('년'), month: pillar('월'), day: pillar('일'), hour: pillar('시') },
      },
      sections: [{
        sectionType: 'overview', title: '합성 전송 계약',
        state: 'complete', blocks: [{ type: 'paragraph', text: '실제 원천 해석 아님' }],
      }],
      disclosures: [{ type: 'scope_limitation', text: '합성 전용' }],
      generatedAt: '2026-10-08T00:00:00Z',
    },
  };
}

/**
 * Independent Saju 2B-3C-2 wire-format test double, not a live issuer or
 * a replacement for Saju's own source proof HTTP tests.
 */
function signedEnvelope(nonce: string, request: unknown, mode: Mode) {
  const response = readingResponse();
  const responseBodyHash = hash(response);
  const material = {
    snapshotId: 'synthetic-snapshot', interpretationRunId: 'synthetic-run',
    registrySnapshotId: 'synthetic-registry', executionId: 'synthetic-execution',
    preparationId: 'synthetic-preparation', selectionId: 'synthetic-selection',
    profileRef: { id: 'synthetic-profile', version: 'version-1', contentHash: 'a'.repeat(64) },
    evidenceBundleHash: 'b'.repeat(64),
    readingId: response.reading.readingId,
    responseId: response.responseId,
    responseBodyHash,
  };
  const payload = {
    version: 'myeonghwa-source-reading-transport-proof-v1',
    lifecycle: 'preview',
    issuer: mode === 'wrong-issuer' ? 'untrusted-preview-service' : ISSUER,
    audience: AUDIENCE,
    keyId: 'preview-key-v1',
    nonce: mode === 'wrong-nonce' ? 'W'.repeat(32) : nonce,
    issuedAtMs: NOW,
    expiresAtMs: mode === 'expired' ? NOW + 500 : NOW + 60_000,
    requestBodyHash: hash(mode === 'wrong-request' ? { request: 'different' } : request),
    responseBodyHash, material,
    productionInterpretationAuthority: 'NOT_EVALUATED',
    releaseAuthorization: 'NOT_EVALUATED',
    canExecute: false, canPublish: false, canSell: false,
  };
  const signatureHex = createHmac('sha256', mode === 'wrong-key' ? Buffer.alloc(32, 1) : KEY)
    .update(SOURCE_DOMAIN).update(hash(payload)).digest('hex');
  const envelope = {
    schemaVersion: 'myeonghwa-source-reading-proof-http-v1',
    lifecycle: 'preview', state: 'held', response,
    proof: { payload, signatureHex },
    productionInterpretationAuthority: 'NOT_EVALUATED',
    releaseAuthorization: 'NOT_EVALUATED',
    canExecute: false, canPublish: false, canSell: false,
  };
  if (mode === 'tampered-response') response.reading.sections[0]!.title = 'intercepted';
  if (mode === 'release-injection') {
    return { ...envelope, releaseAuthorization: 'AUTHORIZED', canSell: true };
  }
  return envelope;
}

function fixture(mode: Mode = 'ok') {
  const events: string[] = [];
  let currentRead = 0;
  const claims = new Set<string>();
  const fetchBodies: { nonce: string; request: unknown }[] = [];
  let lastEnvelope: unknown;

  const subjectPool: PostgresSubjectPoolV1 = {
    async connect() {
      events.push('SUBJECT_CONNECT');
      return {
        async query<Row = Record<string, unknown>>(sql: string): Promise<PostgresQueryResultV1<Row>> {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK'
            || sql === 'SET LOCAL ROLE myeongha_api_executor') {
            events.push(sql);
            return { rows: [] };
          }
          if (sql.includes('begin_member_subject_context_v1')) {
            events.push('SUBJECT_CONTEXT');
            return { rows: [{ subjectId: SUBJECT, subjectKind: 'member' }] as Row[] };
          }
          if (sql.includes('assert_myeongha_subject_context_v1')) {
            return { rows: [{}] as Row[] };
          }
          if (sql.includes('qry_self_birth_profile_current_v1')) {
            currentRead += 1;
            events.push('CURRENT_BIRTH_READ');
            const changed = mode === 'revision-changed' && currentRead > 1;
            return { rows: [{
              subjectId: SUBJECT, birthProfileId: PROFILE,
              currentRevisionId: changed ? '55555555-5555-4555-8555-555555555555' : REVISION,
              currentRevisionNo: changed ? 8 : 7,
              profileUpdatedAt: '2026-09-19T13:00:00.000Z',
            }] as Row[] };
          }
          if (sql.includes('qry_birth_profile_current_revision_v1')) {
            const changed = mode === 'revision-changed' && currentRead > 1;
            return { rows: [{
              birthProfileId: PROFILE, profileKind: 'self', label: null,
              currentRevisionId: changed ? '55555555-5555-4555-8555-555555555555' : REVISION,
              archivedAt: null, currentRevisionNo: changed ? 8 : 7,
              currentCalendarType: 'solar', currentBirthDate: '2001-07-14',
              currentBirthTime: '15:20:00', currentTimeKnown: true,
              currentIsLeapMonth: false, currentSex: 'female',
              revisionId: changed ? '55555555-5555-4555-8555-555555555555' : REVISION,
              revisionNo: changed ? 8 : 7, isCurrentRevision: true,
            }] as Row[] };
          }
          throw Error('Unexpected Subject/Birth SQL in synthetic contract.');
        },
        release() { events.push('SUBJECT_RELEASE'); },
      };
    },
  };

  const nonceConnect = vi.fn(async () => {
    events.push('NONCE_CONNECT');
    if (mode === 'nonce-db-offline') throw Error('Synthetic nonce DB offline');
    return {
      async query<Row = Record<string, unknown>>(
        sql: string, args?: readonly unknown[],
      ): Promise<PostgresQueryResultV1<Row>> {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          events.push('NONCE_' + sql);
          return { rows: [] };
        }
        if (sql === NONCE_ROLE) {
          events.push('NONCE_ROLE');
          if (mode === 'nonce-role-denied') throw Error('Synthetic role membership denied');
          return { rows: [] };
        }
        if (sql.includes('insert into public.saju_source_proof_nonce_claims')) {
          events.push('NONCE_CLAIM');
          const digest = args?.[0];
          if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/u.test(digest)) {
            throw Error('Synthetic nonce claim digest invalid');
          }
          if (claims.has(digest)) return { rows: [] };
          claims.add(digest);
          return { rows: [{ replay_key_digest: digest }] as Row[] };
        }
        throw Error('Unexpected nonce SQL in synthetic contract.');
      },
      release() { events.push('NONCE_RELEASE'); },
    };
  });
  const noncePool: PostgresSubjectPoolV1 = { connect: nonceConnect };

  const fetchImpl = vi.fn(async (url: string, init: {
    method: 'POST'; headers: Readonly<Record<string, string>>;
    body: string; redirect: 'manual'; signal: AbortSignal;
  }) => {
    events.push('ISSUE_HTTP');
    expect(url).toBe('https://saju-proof.example/api/internal/preview/source-readings');
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('manual');
    expect(init.headers.authorization).toBe('Bearer ' + BEARER);
    expect(init.headers['content-type']).toBe('application/json');
    const body = JSON.parse(init.body) as { nonce: string; request: unknown };
    expect(Object.keys(body).sort()).toEqual(['nonce', 'request']);
    expect(body.request).toMatchObject({ reading: { text: '전체 사주' } });
    fetchBodies.push(body);
    if (mode === 'upstream-rejected') {
      return Response.json({ error: { code: 'SOURCE_PROOF_AUTH_REQUIRED' } }, {
        status: 401, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }
    lastEnvelope = signedEnvelope(body.nonce, body.request, mode);
    return Response.json(lastEnvelope, {
      status: 200, headers: {
        'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
      },
    });
  });

  const proofTrust = {
    serviceOrigin: 'https://saju-proof.example', serviceBearer: BEARER,
    trustedIssuer: ISSUER, expectedAudience: AUDIENCE,
    trustedKeyId: 'preview-key-v1', keyBytes: KEY,
    noncePool, fetchImpl, nonceNowMsFactory: () => NOW + 1_000,
  };
  return {
    events, claims, currentReads: () => currentRead, nonceConnect,
    fetchImpl, fetchBodies, lastEnvelope: () => lastEnvelope,
    proofTrust, subjectPool,
    runtime: createSajuHeldCurrentBirthServerRehearsalV1({ subjectPool, proofTrust }),
  };
}

const evidence = { kind: 'member' as const, verifiedAuthUserId: AUTH };

afterEach(() => vi.restoreAllMocks());

describe('2B-3C-8C-1 held Saju protected bridge composition', () => {
  it('executes current owner Birth -> HTTPS Bearer -> HMAC -> PostgreSQL nonce -> revision recheck, with HOLD only', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW + 1_000);
    const f = fixture();
    expect(f.events).toEqual([]);
    const result = await f.runtime.rehearse(evidence);
    expect(result).toMatchObject({
      state: 'held', reason: 'source_transport_integrity_verified_only',
      sourceAuthority: 'NOT_EVALUATED', releaseAuthorization: 'NOT_EVALUATED',
      canExecute: false, canPublish: false, canSell: false,
      binding: {
        subjectId: SUBJECT, birthProfileId: PROFILE,
        birthRevisionId: REVISION, birthRevisionNo: 7,
        readingId: 'synthetic-general-natal-reading',
      },
    });
    expect(f.currentReads()).toBe(2);
    expect(f.fetchImpl).toHaveBeenCalledOnce();
    expect(f.nonceConnect).toHaveBeenCalledOnce();
    expect(f.claims.size).toBe(1);
    const firstRead = f.events.indexOf('CURRENT_BIRTH_READ');
    const issue = f.events.indexOf('ISSUE_HTTP');
    const claim = f.events.indexOf('NONCE_CLAIM');
    const secondRead = f.events.lastIndexOf('CURRENT_BIRTH_READ');
    expect(firstRead).toBeLessThan(issue);
    expect(issue).toBeLessThan(claim);
    expect(claim).toBeLessThan(secondRead);
    expect(f.events).toContain('NONCE_ROLE');
    expect(JSON.stringify(result)).not.toContain(BEARER);
    expect(JSON.stringify(result)).not.toContain('2001-07-14');

    // The same signed envelope is no longer acceptable on another replica
    // sharing the nonce claim store. Test double models the unique-key result;
    // real concurrent PostgreSQL behavior is covered separately by 7B.
    const proofPorts = createSajuHeldSourceProofServerTrustV1(f.proofTrust);
    const bound = f.fetchBodies[0]!;
    const replay = await verifySajuHeldSourceProofV1(
      f.lastEnvelope(), proofPorts.verifierTrust,
      { expectedNonce: bound.nonce, expectedRequestBody: bound.request, nowMs: NOW + 1_000 },
    );
    expect(replay).toMatchObject({
      state: 'blocked', transportIntegrity: 'NOT_VERIFIED',
      canExecute: false, canPublish: false, canSell: false,
    });
    expect(f.claims.size).toBe(1);
  });

  it.each([
    'tampered-response', 'wrong-key', 'wrong-issuer', 'wrong-nonce',
    'wrong-request', 'expired', 'release-injection', 'upstream-rejected',
  ] as const)('blocks %s before writing a nonce or rereading Birth', async mode => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW + 1_000);
    const f = fixture(mode);
    const result = await f.runtime.rehearse(evidence);
    expect(result).toMatchObject({
      state: 'blocked',
      sourceAuthority: 'NOT_EVALUATED',
      releaseAuthorization: 'NOT_EVALUATED',
      canExecute: false, canPublish: false, canSell: false,
    });
    expect(f.fetchImpl).toHaveBeenCalledOnce();
    expect(f.nonceConnect).not.toHaveBeenCalled();
    expect(f.currentReads()).toBe(1);
  });

  it.each(['nonce-db-offline', 'nonce-role-denied'] as const)(
    'fails closed when %s without in-memory fallback or Birth reread', async mode => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW + 1_000);
      const f = fixture(mode);
      const result = await f.runtime.rehearse(evidence);
      expect(result).toMatchObject({
        state: 'blocked', reason: 'source_proof_invalid',
        canExecute: false, canPublish: false, canSell: false,
      });
      expect(f.nonceConnect).toHaveBeenCalledOnce();
      expect(f.currentReads()).toBe(1);
      expect(f.claims.size).toBe(0);
    },
  );

  it('blocks a changed Birth revision after a valid proof and nonce claim', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW + 1_000);
    const f = fixture('revision-changed');
    const result = await f.runtime.rehearse(evidence);
    expect(result).toMatchObject({
      state: 'blocked', reason: 'current_birth_revision_changed',
      sourceAuthority: 'NOT_EVALUATED', releaseAuthorization: 'NOT_EVALUATED',
      canExecute: false, canPublish: false, canSell: false,
    });
    expect(f.fetchImpl).toHaveBeenCalledOnce();
    expect(f.currentReads()).toBe(2);
    expect(f.claims.size).toBe(1);
  });
});
