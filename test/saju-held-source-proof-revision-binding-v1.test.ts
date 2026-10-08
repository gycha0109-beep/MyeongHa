import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  bindCurrentSubjectSajuHeldProofV1,
} from '../apps/api/src/saju-held-source-proof-revision-binding-v1.js';
import type { SajuHeldSourceProofVerifierTrustV1 } from '../apps/api/src/saju-held-source-proof-verifier-v1.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from '../apps/api/src/subject-identity-resolver.js';
import type {
  PostgresSubjectPoolV1,
  PostgresSubjectConnectionV1,
  PostgresQueryResultV1,
} from '../apps/api/src/postgres-subject-execution.js';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_SUBJECT_ID = '66666666-6666-4666-8666-666666666666';
const AUTH_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_PROFILE_ID = '77777777-7777-4777-8777-777777777777';
const REVISION_ID = '44444444-4444-4444-8444-444444444444';
const evidence: VerifiedSubjectIdentityEvidenceV1 = {
  kind: 'member', verifiedAuthUserId: AUTH_ID,
};
const keyBytes = Buffer.alloc(32, 73);
const issuedAtMs = 1_800_000_000_000;
const nonceValue = 'Q'.repeat(24);
const DOMAIN = 'myeongha/saju/source-transport-proof/v1\0';

type Mutation = 'revision' | 'input' | 'archive' | 'subject' | 'profile' | 'same_input_revision';
function poolFactory(events: string[], mutation?: Mutation, absent = false) {
  let currentRead = 0;
  const connection: PostgresSubjectConnectionV1 = {
    async query<Row = Record<string, unknown>>(sql: string): Promise<PostgresQueryResultV1<Row>> {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK'
        || sql === 'SET LOCAL ROLE myeongha_api_executor') {
        events.push(sql);
        return { rows: [] };
      }
      if (sql.includes('begin_member_subject_context_v1')) {
        events.push('SUBJECT_CONTEXT');
        return { rows: [{ subjectId: mutation === 'subject' && currentRead > 0 ? OTHER_SUBJECT_ID : SUBJECT_ID, subjectKind: 'member' }] as unknown as Row[] };
      }
      if (sql.includes('assert_myeongha_subject_context_v1')) {
        return { rows: [{}] as unknown as Row[] };
      }
      if (sql.includes('qry_self_birth_profile_current_v1')) {
        currentRead += 1;
        events.push('CURRENT_BIRTH_READ');
        if (absent) return { rows: [] };
        return { rows: [{
          subjectId: SUBJECT_ID,
          birthProfileId: mutation === 'profile' && currentRead > 1 ? OTHER_PROFILE_ID : PROFILE_ID,
          currentRevisionId: (mutation === 'revision' || mutation === 'same_input_revision') && currentRead > 1
            ? '55555555-5555-4555-8555-555555555555' : REVISION_ID,
          currentRevisionNo: (mutation === 'revision' || mutation === 'same_input_revision') && currentRead > 1 ? 8 : 7,
          profileUpdatedAt: '2026-09-19T13:00:00.000Z',
        }] as unknown as Row[] };
      }
      if (sql.includes('qry_birth_profile_current_revision_v1')) {
        const newRevision = (mutation === 'revision' || mutation === 'same_input_revision') && currentRead > 1;
        const id = newRevision ? '55555555-5555-4555-8555-555555555555' : REVISION_ID;
        return { rows: [{
          birthProfileId: mutation === 'profile' && currentRead > 1 ? OTHER_PROFILE_ID : PROFILE_ID,
          profileKind: 'self',
          label: null,
          currentRevisionId: id,
          archivedAt: mutation === 'archive' && currentRead > 1
            ? '2026-09-20T13:00:00.000Z' : null,
          currentRevisionNo: newRevision ? 8 : 7,
          currentCalendarType: 'solar',
          currentBirthDate: mutation === 'input' && currentRead > 1 ? '2001-07-15' : '2001-07-14',
          currentBirthTime: '15:20:00',
          currentTimeKnown: true,
          currentIsLeapMonth: false,
          currentSex: 'female',
          revisionId: id,
          revisionNo: newRevision ? 8 : 7,
          isCurrentRevision: true,
        }] as unknown as Row[] };
      }
      throw new Error('Unexpected SQL in fixture: ' + sql);
    },
    release() { events.push('RELEASE'); },
  };

  const pool: PostgresSubjectPoolV1 = {
    async connect() {
      events.push('CONNECT');
      return connection;
    },
  };
  return { pool, getReadCount: () => currentRead };
}

function canonicalize(value: unknown): unknown {
  if (value === undefined) return { $undefined: true };
  if (typeof value === 'number' && !Number.isFinite(value)) return { $number: String(value) };
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;
  const r = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(r).sort().map(k => [k, canonicalize(r[k])]));
}
function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}
function readingResponse() {
  const fact = (label: string) => ({ label, status: 'resolved', value: '테스트' });
  return {
    responseVersion: 'myeonghwa-product-reading-response-v2',
    responseId: 'reading_response_' + 'c'.repeat(24),
    state: 'delivered', messageCode: 'READING_DELIVERED', requiredAction: 'none',
    reading: {
      readingId: 'synthetic-reading-natal',
      brand: { brandId: 'myeonghwa', displayName: '명화' },
      subject: {
        displayLabel: '합성 사용자',
        birthInputDisplay: { calendarType: 'solar', date: '2001-07-14', timeKnown: false },
        calculationState: 'resolved',
      },
      calculationSummary: { pillars: {
        year: fact('년'), month: fact('월'), day: fact('일'), hour: fact('시'),
      } },
      sections: [{ sectionType: 'overview', title: '테스트용 원국', state: 'complete',
        blocks: [{ type: 'paragraph', text: '출시 근거가 아님' }] }],
      disclosures: [{ type: 'scope_limitation', text: '합성 자료' }],
      generatedAt: '2026-10-08T00:00:00Z',
    },
  };
}
function envelope(nonce: string, expectedRequest: unknown) {
  const response = readingResponse();
  const material = {
    snapshotId: 'synthetic-snapshot', interpretationRunId: 'synthetic-run',
    registrySnapshotId: 'synthetic-registry', executionId: 'synthetic-execution',
    preparationId: 'synthetic-preparation', selectionId: 'synthetic-selection',
    profileRef: { id: 'synthetic-profile', version: 'version-1', contentHash: 'a'.repeat(64) },
    evidenceBundleHash: 'b'.repeat(64),
    readingId: response.reading.readingId,
    responseId: response.responseId,
    responseBodyHash: hash(response),
  };
  const payload = {
    version: 'myeonghwa-source-reading-transport-proof-v1',
    lifecycle: 'preview',
    issuer: 'saju-preview-service', audience: 'myeongha-api-service',
    keyId: 'preview-key-v1', nonce, issuedAtMs, expiresAtMs: issuedAtMs + 60_000,
    requestBodyHash: hash(expectedRequest), responseBodyHash: hash(response), material,
    productionInterpretationAuthority: 'NOT_EVALUATED',
    releaseAuthorization: 'NOT_EVALUATED',
    canExecute: false, canPublish: false, canSell: false,
  };
  const signatureHex = createHmac('sha256', keyBytes)
    .update(DOMAIN).update(hash(payload)).digest('hex');
  return {
    schemaVersion: 'myeonghwa-source-reading-proof-http-v1',
    lifecycle: 'preview', state: 'held', response,
    proof: { payload, signatureHex },
    productionInterpretationAuthority: 'NOT_EVALUATED',
    releaseAuthorization: 'NOT_EVALUATED',
    canExecute: false, canPublish: false, canSell: false,
  };
}

function fixture(options: { mutation?: Mutation; absent?: boolean; issueMode?: 'ok' | 'throw' | 'tamper' | 'wrong_request' | 'released'; nonce?: string } = {}) {
  const events: string[] = [];
  const db = poolFactory(events, options.mutation, options.absent);
  const used = new Set<string>();
  const verifierTrust: SajuHeldSourceProofVerifierTrustV1 = {
    trustedIssuer: 'saju-preview-service',
    expectedAudience: 'myeongha-api-service',
    trustedKeyId: 'preview-key-v1',
    keyBytes,
    claimNonceOnce: vi.fn(async (key: string) => {
      if (used.has(key)) return false;
      used.add(key);
      return true;
    }),
  };
  const issuePreviewProof = vi.fn(async ({ nonce, request }: { nonce: string; request: unknown }) => {
    events.push('ISSUE_PROOF');
    if (options.issueMode === 'throw') throw new Error('upstream failed');
    const signed = envelope(nonce, options.issueMode === 'wrong_request'
      ? { birth: { calendarType: 'solar', date: '2001-08-01', time: '15:20', sex: 'female' }, reading: { text: '전체 사주' } }
      : request);
    if (options.issueMode === 'tamper') signed.response.reading.sections[0]!.title = 'modified by adversary';
    if (options.issueMode === 'released') {
      return { ...signed, releaseAuthorization: 'AUTHORIZED', canSell: true };
    }
    return signed;
  });
  return {
    events, getReadCount: db.getReadCount,
    issuePreviewProof, verifierTrust,
    input: {
      verifiedEvidence: evidence,
      pool: db.pool,
      issuePort: { issuePreviewProof },
      verifierTrust,
      nonceFactory: () => options.nonce ?? nonceValue,
      nowMsFactory: () => issuedAtMs + 1_000,
    },
  };
}

describe('2B-3C-4 verified Subject + current Birth revision binding', () => {
  it('holds only when source proof, owner and both authoritative Revision reads agree', async () => {
    const f = fixture();
    const result = await bindCurrentSubjectSajuHeldProofV1(f.input);
    expect(result).toMatchObject({
      state: 'held', reason: 'source_transport_integrity_verified_only',
      sourceAuthority: 'NOT_EVALUATED', releaseAuthorization: 'NOT_EVALUATED',
      canExecute: false, canPublish: false, canSell: false,
      binding: {
        subjectId: SUBJECT_ID, birthProfileId: PROFILE_ID,
        birthRevisionId: REVISION_ID, birthRevisionNo: 7,
        readingId: 'synthetic-reading-natal',
      },
    });
    expect(f.issuePreviewProof).toHaveBeenCalledTimes(1);
    expect(f.issuePreviewProof.mock.calls[0]?.[0]).toEqual({
      nonce: nonceValue,
      request: {
        birth: { calendarType: 'solar', date: '2001-07-14', time: '15:20', sex: 'female' },
        reading: { text: '전체 사주' },
      },
    });
    expect(f.getReadCount()).toBe(2);
    expect(f.events.filter(v => v === 'COMMIT')).toHaveLength(2);
    expect(f.events.filter(v => v === 'RELEASE')).toHaveLength(2);
    expect(f.events.indexOf('ISSUE_PROOF')).toBeGreaterThan(f.events.indexOf('RELEASE'));
    expect(f.events.lastIndexOf('CONNECT')).toBeGreaterThan(f.events.indexOf('ISSUE_PROOF'));
    expect(JSON.stringify(result)).not.toContain('2001-07-14');
    expect(JSON.stringify(result)).not.toContain('테스트용 원국');
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    ['revision', 'current_birth_revision_changed'],
    ['same_input_revision', 'current_birth_revision_changed'],
    ['input', 'current_birth_revision_changed'],
    ['subject', 'current_birth_revision_changed'],
    ['profile', 'current_birth_revision_changed'],
    ['archive', 'birth_profile_unavailable'],
  ] as const)('rejects an authoritative post-proof change: %s', async (mutation, reason) => {
    const f = fixture({ mutation });
    const result = await bindCurrentSubjectSajuHeldProofV1(f.input);
    expect(result).toMatchObject({
      state: 'blocked', reason, canExecute: false, canPublish: false, canSell: false,
    });
    expect(result).not.toHaveProperty('binding');
    expect(f.issuePreviewProof).toHaveBeenCalledTimes(1);
    expect(f.getReadCount()).toBe(2);
  });

  it.each([
    ['throw', 'source_proof_unavailable'],
    ['tamper', 'source_proof_invalid'],
    ['wrong_request', 'source_proof_invalid'],
    ['released', 'source_proof_invalid'],
  ] as const)('fails closed on source proof failure: %s', async (issueMode, reason) => {
    const f = fixture({ issueMode });
    const result = await bindCurrentSubjectSajuHeldProofV1(f.input);
    expect(result).toMatchObject({ state: 'blocked', reason, canSell: false });
    expect(f.getReadCount()).toBe(1);
  });

  it('does not invoke Saju if there is no authorized current self Birth profile', async () => {
    const f = fixture({ absent: true });
    const result = await bindCurrentSubjectSajuHeldProofV1(f.input);
    expect(result).toMatchObject({ state: 'blocked', reason: 'birth_profile_unavailable' });
    expect(f.issuePreviewProof).not.toHaveBeenCalled();
  });

  it('refuses invalid caller-provided nonce factory before issuing an upstream proof', async () => {
    const f = fixture({ nonce: 'weak' });
    const result = await bindCurrentSubjectSajuHeldProofV1(f.input);
    expect(result).toMatchObject({ state: 'blocked', reason: 'invalid_current_birth_request' });
    expect(f.issuePreviewProof).not.toHaveBeenCalled();
  });

  it('fails closed on replay when the shared nonce claim rejects a repeated proof', async () => {
    const f = fixture();
    expect((await bindCurrentSubjectSajuHeldProofV1(f.input)).state).toBe('held');
    expect(await bindCurrentSubjectSajuHeldProofV1(f.input))
      .toMatchObject({ state: 'blocked', reason: 'source_proof_invalid' });
  });

  it('fails closed when the cross-instance replay claim storage is unavailable', async () => {
    const f = fixture();
    const input = {
      ...f.input,
      verifierTrust: {
        ...f.verifierTrust,
        claimNonceOnce: async () => { throw Error('storage unavailable'); },
      },
    };
    expect(await bindCurrentSubjectSajuHeldProofV1(input))
      .toMatchObject({ state: 'blocked', reason: 'source_proof_invalid' });
  });
});
