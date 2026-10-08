import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rehearseCurrentSubjectSajuMultiSlotSourceProofV1 } from '../apps/api/src/saju-held-multi-slot-source-proof-v1.js';
import { bindCurrentSubjectSajuHeldProofV1, type SajuHeldRevisionBindingResultV1 } from '../apps/api/src/saju-held-source-proof-revision-binding-v1.js';
import { readBoundCurrentBirthContextV1 } from '../apps/api/src/current-subject-saju-calculation-http.js';
import { hashSajuHeldSourceProofRequestV1 } from '../apps/api/src/saju-held-source-proof-verifier-v1.js';
import { buildCurrentBirthSourceProofRehearsalRequestV1 } from '../apps/api/src/saju-source-proof-request-normalization-v1.js';

vi.mock('../apps/api/src/saju-held-source-proof-revision-binding-v1.js', () => ({
  bindCurrentSubjectSajuHeldProofV1: vi.fn(),
}));
vi.mock('../apps/api/src/current-subject-saju-calculation-http.js', () => ({
  readBoundCurrentBirthContextV1: vi.fn(),
}));
const bind = vi.mocked(bindCurrentSubjectSajuHeldProofV1);
const read = vi.mocked(readBoundCurrentBirthContextV1);

function snapshot() {
  return {
    resolvedSubject: { subjectId: 'subject-1', subjectKind: 'member' as const },
    profile: {
      birthProfileId: 'birth-1', profileKind: 'self', label: null, archivedAt: null,
      currentRevision: {
        revisionId: 'revision-7', revisionNo: 7,
        input: {
          calendarType: 'solar', birthDate: '2001-07-14', birthTime: '15:20:00',
          timeKnown: true, isLeapMonth: false, sex: 'female',
        },
      },
      revisions: [{ revisionId: 'revision-7', revisionNo: 7, isCurrent: true }],
    },
  };
}

function bound(slot: 'natal' | 'relationship',
  changes: Record<string, unknown> = {}): SajuHeldRevisionBindingResultV1 {
  const s = snapshot();
  const text = slot === 'natal' ? '전체 사주' : '연애운';
  const request = buildCurrentBirthSourceProofRehearsalRequestV1(s.profile, text);
  return {
    version: 'myeongha-held-source-proof-revision-binding-v1',
    state: 'held', reason: 'source_transport_integrity_verified_only',
    sourceAuthority: 'NOT_EVALUATED', releaseAuthorization: 'NOT_EVALUATED',
    canExecute: false, canPublish: false, canSell: false,
    binding: {
      subjectId: s.resolvedSubject.subjectId, birthProfileId: s.profile.birthProfileId,
      birthRevisionId: s.profile.currentRevision.revisionId, birthRevisionNo: 7,
      readingId: 'reading-' + slot,
      responseId: 'response-' + slot,
      requestBodyHash: hashSajuHeldSourceProofRequestV1(request),
      responseBodyHash: (slot === 'natal' ? 'a' : 'b').repeat(64),
      ...changes,
    },
  };
}
let nonceCounter = 0;
function input() {
  return {
    verifiedEvidence: { kind: 'member' as const, verifiedAuthUserId: 'auth-test' },
    pool: { connect: vi.fn(async () => { throw Error('unused mocked pool'); }) },
    issuePort: { issuePreviewProof: vi.fn(async () => null) },
    verifierTrust: {
      trustedIssuer: 'issuer', expectedAudience: 'audience', trustedKeyId: 'key-v1',
      keyBytes: Buffer.alloc(32, 1), claimNonceOnce: vi.fn(async () => true),
    },
    nonceFactory: () => (++nonceCounter === 1 ? 'Q' : 'R').repeat(24),
    nowMsFactory: () => 1_800_000_001_000,
  };
}

beforeEach(() => {
  vi.resetAllMocks(); nonceCounter = 0;
  bind.mockResolvedValueOnce(bound('natal')).mockResolvedValueOnce(bound('relationship'));
  read.mockResolvedValue(snapshot());
});

describe('2B-3C-5 independent signed slot crossing, synthetic boundary tests', () => {
  it('holds two distinct server-selected intents without granting product use', async () => {
    const output = await rehearseCurrentSubjectSajuMultiSlotSourceProofV1(input());
    expect(output).toEqual({
      version: 'myeongha-held-multi-slot-source-proof-v1',
      state: 'held', reason: 'two_independent_transport_proofs_verified_only',
      checkedSlots: ['natal', 'relationship'],
      sourceAuthority: 'NOT_EVALUATED', releaseAuthorization: 'NOT_EVALUATED',
      canExecute: false, canPublish: false, canSell: false,
    });
    expect(bind).toHaveBeenCalledTimes(2);
    expect(bind.mock.calls.map(([value]) => value.readingText)).toEqual(['전체 사주', '연애운']);
    expect(read).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(output.checkedSlots)).toBe(true);
    expect(JSON.stringify(output)).not.toContain('2001-07-14');
  });

  it.each(['subjectId', 'birthProfileId', 'birthRevisionId', 'birthRevisionNo'] as const)(
    'rejects separately held slots with mismatched %s', async (key) => {
      bind.mockReset();
      bind.mockResolvedValueOnce(bound('natal')).mockResolvedValueOnce(
        bound('relationship', { [key]: key === 'birthRevisionNo' ? 8 : 'different' }),
      );
      expect(await rehearseCurrentSubjectSajuMultiSlotSourceProofV1(input())).toMatchObject({
        state: 'blocked', reason: 'mixed_subject_or_revision', checkedSlots: [], canSell: false,
      });
      expect(read).not.toHaveBeenCalled();
    },
  );

  it.each(['readingId', 'responseId', 'requestBodyHash', 'responseBodyHash'] as const)(
    'blocks duplicate signed %s', async (key) => {
      const first = bound('natal');
      if (first.binding === undefined) throw Error('fixture');
      bind.mockReset();
      bind.mockResolvedValueOnce(first).mockResolvedValueOnce(
        bound('relationship', { [key]: first.binding[key] }),
      );
      expect(await rehearseCurrentSubjectSajuMultiSlotSourceProofV1(input())).toMatchObject({
        state: 'blocked', reason: 'duplicate_source_identity', checkedSlots: [],
      });
    },
  );
});


describe('2B-3C-5 adversarial final authority and replay conditions', () => {
  it('blocks a missing required source proof without leaking the first slot', async () => {
    bind.mockReset();
    bind.mockResolvedValueOnce(bound('natal')).mockResolvedValueOnce({
      version: 'myeongha-held-source-proof-revision-binding-v1',
      state: 'blocked', reason: 'source_proof_invalid',
      sourceAuthority: 'NOT_EVALUATED', releaseAuthorization: 'NOT_EVALUATED',
      canExecute: false, canPublish: false, canSell: false,
    });
    expect(await rehearseCurrentSubjectSajuMultiSlotSourceProofV1(input())).toMatchObject({
      state: 'blocked', reason: 'required_slot_blocked', checkedSlots: [],
    });
    expect(read).not.toHaveBeenCalled();
  });

  it('refuses a replayed nonce even if a slot attempts to return held', async () => {
    const request = input();
    request.nonceFactory = () => 'Q'.repeat(24);
    bind.mockReset();
    bind.mockImplementation(async (one) => {
      try { one.nonceFactory?.(); } catch {
        return {
          version: 'myeongha-held-source-proof-revision-binding-v1',
          state: 'blocked', reason: 'invalid_current_birth_request',
          sourceAuthority: 'NOT_EVALUATED', releaseAuthorization: 'NOT_EVALUATED',
          canExecute: false, canPublish: false, canSell: false,
        };
      }
      return bound(one.readingText === '전체 사주' ? 'natal' : 'relationship');
    });
    expect(await rehearseCurrentSubjectSajuMultiSlotSourceProofV1(request)).toMatchObject({
      state: 'blocked', reason: 'reused_slot_nonce', checkedSlots: [],
    });
  });

  it.each([
    ['subject', 'other'], ['profile', 'other'], ['revision', 'different'],
  ] as const)('rejects stale final %s identity', async (what, next) => {
    const latest = snapshot();
    if (what === 'subject') latest.resolvedSubject.subjectId = next;
    if (what === 'profile') latest.profile.birthProfileId = next;
    if (what === 'revision') latest.profile.currentRevision.revisionId = next;
    read.mockResolvedValue(latest);
    expect(await rehearseCurrentSubjectSajuMultiSlotSourceProofV1(input())).toMatchObject({
      state: 'blocked', reason: 'final_birth_revision_changed', checkedSlots: [],
    });
  });

  it('detects changed Birth input even if the Revision ID was not updated', async () => {
    const latest = snapshot();
    latest.profile.currentRevision.input.birthDate = '2001-07-15';
    read.mockResolvedValue(latest);
    expect(await rehearseCurrentSubjectSajuMultiSlotSourceProofV1(input())).toMatchObject({
      state: 'blocked', reason: 'final_birth_revision_changed', checkedSlots: [],
    });
  });

  it('fails closed when the final owner-authority read errors', async () => {
    read.mockRejectedValue(new Error('DB unavailable'));
    expect(await rehearseCurrentSubjectSajuMultiSlotSourceProofV1(input())).toMatchObject({
      state: 'blocked', reason: 'final_birth_profile_unavailable', checkedSlots: [],
    });
  });
});
