import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSajuHeldStagingRehearsalRunnerV1,
  type CreateSajuHeldStagingRunnerInputV1,
} from '../apps/api/src/saju-held-staging-rehearsal-runner-v1.js';

const fakes = vi.hoisted(() => ({
  builtFrom: [] as unknown[],
  preflight: vi.fn(),
  rehearse: vi.fn(),
}));

vi.mock('../apps/api/src/saju-held-staging-preflight-v1.js', () => ({
  assessSajuHeldStagingPreflightV1: fakes.preflight,
}));

vi.mock('../apps/api/src/saju-held-current-birth-server-rehearsal-v1.js', () => ({
  createSajuHeldCurrentBirthServerRehearsalV1: (options: unknown) => {
    fakes.builtFrom.push(options);
    return { rehearse: fakes.rehearse };
  },
}));

const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const SOURCE = 'https://proof-staging.example';
const READING = 'source_transport_integrity_verified_only';

function heldResult() {
  return {
    state: 'held', reason: READING,
    sourceAuthority: 'NOT_EVALUATED', releaseAuthorization: 'NOT_EVALUATED',
    canExecute: false, canPublish: false, canSell: false,
    binding: {
      subjectId: 'SECRET_SUBJECT_IDENTIFIER',
      birthProfileId: 'SECRET_BIRTH_PROFILE',
      birthRevisionId: 'SECRET_BIRTH_REVISION',
      birthRevisionNo: 1,
      readingId: 'SECRET_READING_ID',
      responseId: 'SECRET_RESPONSE_ID',
      requestBodyHash: 'SECRET_REQUEST_HASH',
      responseBodyHash: 'SECRET_RESPONSE_HASH',
    },
  };
}

function fixture() {
  const options = {
    subjectPool: { connect: vi.fn() },
    proofTrust: {
      serviceOrigin: SOURCE,
      serviceBearer: 'SECRET_BEARER',
      keyBytes: Buffer.alloc(32, 73),
      trustedIssuer: 'saju-preview',
      expectedAudience: 'myeongha',
      trustedKeyId: 'preview-key-v1',
      noncePool: { connect: vi.fn() },
    },
  };
  const targetAssertionPort = {
    assertIsolatedStagingTarget: vi.fn(async (_input: {sourceProofOrigin: string}) => true),
  };
  const admissionPort = { consumeAuthorizedAttemptOnce: vi.fn(async () => true) };
  const approvedMemberRequestPort = {
    loadApprovedMemberRequest: vi.fn(async () =>
      new Request('https://approved-staging.example/internal', {
        headers: { authorization: 'Bearer SECRET_TEST_MEMBER_TOKEN' },
      })),
  };
  const memberIdentityVerifier = {
    verifyRequestIdentity: vi.fn(async (_request: Request) =>
      ({ kind: 'member' as const, verifiedAuthUserId: MEMBER_ID })),
  };
  const observer = { observe: vi.fn(async (_report: unknown) => undefined) };
  const input: CreateSajuHeldStagingRunnerInputV1 = {
    preflightInput: {
      client: options,
      sourceDescriptor: {
        httpPath: '/api/internal/preview/source-readings',
        envelopeVersion: 'myeonghwa-source-reading-proof-http-v1',
        proofVersion: 'myeonghwa-source-reading-transport-proof-v1',
        issuer: 'saju-preview',
        audience: 'myeongha',
        keyId: 'preview-key-v1',
        ttlMs: 60_000,
      },
    },
    targetAssertionPort, admissionPort, approvedMemberRequestPort,
    memberIdentityVerifier, observer,
  };
  return {
    options, input, targetAssertionPort, admissionPort,
    approvedMemberRequestPort, memberIdentityVerifier, observer,
  };
}

beforeEach(() => {
  fakes.builtFrom.length = 0;
  fakes.preflight.mockReset().mockReturnValue({
    configuration: 'VALID', stagingConnection: 'NOT_VERIFIED', stagingAdmission: 'HOLD',
  });
  fakes.rehearse.mockReset().mockResolvedValue(heldResult());
});

describe('8C-2B-1A — staging-only one-shot runner', () => {
  it('R01: constructs without touching admission, Auth, Subject, nonce or HTTP', () => {
    const f = fixture();
    const runner = createSajuHeldStagingRehearsalRunnerV1(f.input);
    expect(runner.version).toBe('myeongha-held-saju-staging-runner-v1');
    expect(Object.isFrozen(runner)).toBe(true);
    expect(fakes.preflight).not.toHaveBeenCalled();
    expect(fakes.builtFrom).toHaveLength(0);
    expect(f.targetAssertionPort.assertIsolatedStagingTarget).not.toHaveBeenCalled();
    expect(f.admissionPort.consumeAuthorizedAttemptOnce).not.toHaveBeenCalled();
    expect(f.approvedMemberRequestPort.loadApprovedMemberRequest).not.toHaveBeenCalled();
    expect(f.memberIdentityVerifier.verifyRequestIdentity).not.toHaveBeenCalled();
    expect(f.options.subjectPool.connect).not.toHaveBeenCalled();
    expect(f.options.proofTrust.noncePool.connect).not.toHaveBeenCalled();
  });

  it('R07-R08: validates target, consumes admission, verifies Member, calls same-options 8B once', async () => {
    const f = fixture();
    const outcome = await createSajuHeldStagingRehearsalRunnerV1(f.input).runOnce();
    expect(outcome).toEqual({
      version: 'myeongha-held-saju-staging-runner-v1',
      result: 'TRANSPORT_HELD_ONLY',
      reason: 'TRANSPORT_INTEGRITY_VERIFIED_ONLY',
      stagingConnection: 'NOT_VERIFIED',
      sourceAuthority: 'NOT_EVALUATED',
      releaseAuthorization: 'NOT_EVALUATED',
      canExecute: false, canPublish: false, canSell: false,
    });
    expect(fakes.preflight).toHaveBeenCalledWith(f.input.preflightInput);
    expect(f.targetAssertionPort.assertIsolatedStagingTarget).toHaveBeenCalledWith({
      sourceProofOrigin: SOURCE,
    });
    expect(f.admissionPort.consumeAuthorizedAttemptOnce).toHaveBeenCalledOnce();
    expect(f.approvedMemberRequestPort.loadApprovedMemberRequest).toHaveBeenCalledOnce();
    expect(f.memberIdentityVerifier.verifyRequestIdentity).toHaveBeenCalledWith(expect.any(Request));
    expect(fakes.builtFrom).toEqual([f.input.preflightInput.client]);
    expect(fakes.rehearse).toHaveBeenCalledExactlyOnceWith({
      kind: 'member', verifiedAuthUserId: MEMBER_ID,
    });
    expect(f.observer.observe).toHaveBeenCalledWith(outcome);
    expect(Object.isFrozen(outcome)).toBe(true);
  });

  it.each([
    ['configuration blocked', { configuration: 'BLOCKED' }],
    ['staging admission changed', { stagingAdmission: 'READY' }],
    ['staging connection claim changed', { stagingConnection: 'CONNECTED' }],
  ])('R04: blocks invalid preflight state: %s', async (_name, bad) => {
    const f = fixture();
    fakes.preflight.mockReturnValue({
      configuration: 'VALID', stagingAdmission: 'HOLD',
      stagingConnection: 'NOT_VERIFIED', ...bad,
    });
    const result = await createSajuHeldStagingRehearsalRunnerV1(f.input).runOnce();
    expect(result).toMatchObject({ result: 'BLOCKED', reason: 'PREFLIGHT_BLOCKED' });
    expect(f.targetAssertionPort.assertIsolatedStagingTarget).not.toHaveBeenCalled();
    expect(f.admissionPort.consumeAuthorizedAttemptOnce).not.toHaveBeenCalled();
    expect(fakes.rehearse).not.toHaveBeenCalled();
  });

  it.each([false, undefined, 'true'])('R03: blocks unverified target result: %s', async value => {
    const f = fixture();
    f.targetAssertionPort.assertIsolatedStagingTarget.mockResolvedValue(value as never);
    const result = await createSajuHeldStagingRehearsalRunnerV1(f.input).runOnce();
    expect(result).toMatchObject({ result: 'BLOCKED', reason: 'TARGET_UNVERIFIED' });
    expect(f.admissionPort.consumeAuthorizedAttemptOnce).not.toHaveBeenCalled();
    expect(f.memberIdentityVerifier.verifyRequestIdentity).not.toHaveBeenCalled();
    expect(fakes.rehearse).not.toHaveBeenCalled();
  });

  it.each([false, undefined, 'consumed'])('R02: blocks invalid one-shot admission: %s', async value => {
    const f = fixture();
    f.admissionPort.consumeAuthorizedAttemptOnce.mockResolvedValue(value as never);
    const result = await createSajuHeldStagingRehearsalRunnerV1(f.input).runOnce();
    expect(result).toMatchObject({ result: 'BLOCKED', reason: 'ADMISSION_UNAVAILABLE' });
    expect(f.approvedMemberRequestPort.loadApprovedMemberRequest).not.toHaveBeenCalled();
    expect(f.memberIdentityVerifier.verifyRequestIdentity).not.toHaveBeenCalled();
    expect(fakes.rehearse).not.toHaveBeenCalled();
  });

  it('R05: blocks missing member credential without reading Birth', async () => {
    const f = fixture();
    f.approvedMemberRequestPort.loadApprovedMemberRequest.mockResolvedValue(null as never);
    const result = await createSajuHeldStagingRehearsalRunnerV1(f.input).runOnce();
    expect(result).toMatchObject({ result: 'BLOCKED', reason: 'MEMBER_NOT_VERIFIED' });
    expect(f.memberIdentityVerifier.verifyRequestIdentity).not.toHaveBeenCalled();
    expect(fakes.rehearse).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { kind: 'guest', verifiedGuestTokenHash: 'secret' },
    { kind: 'member', verifiedAuthUserId: '' },
    { kind: 'member', verifiedAuthUserId: 'unverified-non-uuid' },
    { kind: 'member', verifiedAuthUserId: MEMBER_ID, subjectId: 'client-subject' },
  ])('R05-R06: rejects non-member/non-exact trusted identity %#', async evidence => {
    const f = fixture();
    f.memberIdentityVerifier.verifyRequestIdentity.mockResolvedValue(evidence as never);
    const result = await createSajuHeldStagingRehearsalRunnerV1(f.input).runOnce();
    expect(result).toMatchObject({ result: 'BLOCKED', reason: 'MEMBER_NOT_VERIFIED' });
    expect(fakes.rehearse).not.toHaveBeenCalled();
  });

  it('R09: blocks generic proof rejection and redacts errors', async () => {
    const f = fixture();
    fakes.rehearse.mockRejectedValue(new Error('SECRET_BIRTH+SECRET_PROOF+SECRET_BEARER'));
    const result = await createSajuHeldStagingRehearsalRunnerV1(f.input).runOnce();
    expect(result).toMatchObject({ result: 'BLOCKED', reason: 'PROOF_UNAVAILABLE' });
    expect(JSON.stringify(result)).not.toContain('SECRET_');
    expect(fakes.rehearse).toHaveBeenCalledOnce();
  });

  it('R09: maps binder blocked state to protected failure', async () => {
    const f = fixture();
    fakes.rehearse.mockResolvedValue({ ...heldResult(), state: 'blocked', reason: 'source_proof_unavailable' });
    const result = await createSajuHeldStagingRehearsalRunnerV1(f.input).runOnce();
    expect(result).toMatchObject({ result: 'BLOCKED', reason: 'PROOF_UNAVAILABLE' });
  });

  it('R13: preserves Revision-change rejection', async () => {
    const f = fixture();
    fakes.rehearse.mockResolvedValue({
      ...heldResult(), state: 'blocked', reason: 'current_birth_revision_changed',
    });
    const result = await createSajuHeldStagingRehearsalRunnerV1(f.input).runOnce();
    expect(result).toMatchObject({ result: 'BLOCKED', reason: 'REVISION_CHANGED' });
  });

  it.each([
    { canSell: true },
    { canPublish: true },
    { canExecute: true },
    { sourceAuthority: 'AUTHORIZED' },
    { releaseAuthorization: 'AUTHORIZED' },
    { state: 'held', reason: 'unexpected_success' },
    { binding: undefined },
  ])('R14: never promotes tampered 8B output %#', async changed => {
    const f = fixture();
    fakes.rehearse.mockResolvedValue({ ...heldResult(), ...changed });
    const result = await createSajuHeldStagingRehearsalRunnerV1(f.input).runOnce();
    expect(result).toMatchObject({ result: 'BLOCKED', canSell: false, canExecute: false });
  });

  it('R10: rejects sequential reuse even after first allowed run', async () => {
    const f = fixture();
    const runner = createSajuHeldStagingRehearsalRunnerV1(f.input);
    expect((await runner.runOnce()).result).toBe('TRANSPORT_HELD_ONLY');
    const second = await runner.runOnce();
    expect(second).toMatchObject({ result: 'BLOCKED', reason: 'ADMISSION_UNAVAILABLE' });
    expect(f.admissionPort.consumeAuthorizedAttemptOnce).toHaveBeenCalledOnce();
    expect(fakes.rehearse).toHaveBeenCalledOnce();
  });

  it('R10: rejects concurrent reuse while first run is pending', async () => {
    const f = fixture();
    let release!: (value: boolean) => void;
    const pending = new Promise<boolean>(resolve => { release = resolve; });
    f.targetAssertionPort.assertIsolatedStagingTarget.mockImplementation(() => pending);
    const runner = createSajuHeldStagingRehearsalRunnerV1(f.input);
    const first = runner.runOnce();
    const next = await runner.runOnce();
    expect(next).toMatchObject({ result: 'BLOCKED', reason: 'ADMISSION_UNAVAILABLE' });
    release(true);
    expect((await first).result).toBe('TRANSPORT_HELD_ONLY');
    expect(f.admissionPort.consumeAuthorizedAttemptOnce).toHaveBeenCalledOnce();
    expect(fakes.rehearse).toHaveBeenCalledOnce();
  });

  it('R11: never emits Birth/Subject/credential/signature/binding identifiers to observer', async () => {
    const f = fixture();
    const result = await createSajuHeldStagingRehearsalRunnerV1(f.input).runOnce();
    const reported = JSON.stringify([result, f.observer.observe.mock.calls]);
    expect(reported).not.toContain('SECRET_');
    expect(reported).not.toContain(SOURCE);
    expect(reported).not.toContain(MEMBER_ID);
    expect(reported).not.toContain('binding');
    expect(Object.keys(result).sort()).toEqual([
      'version', 'result', 'reason', 'stagingConnection', 'sourceAuthority',
      'releaseAuthorization', 'canExecute', 'canPublish', 'canSell',
    ].sort());
  });

  it('R11: fails closed without raw error leakage if observer throws', async () => {
    const f = fixture();
    f.observer.observe.mockRejectedValue(new Error('SECRET_OBSERVER_TOKEN'));
    const result = await createSajuHeldStagingRehearsalRunnerV1(f.input).runOnce();
    expect(result).toMatchObject({ result: 'BLOCKED', reason: 'PROOF_UNAVAILABLE' });
    expect(JSON.stringify(result)).not.toContain('SECRET_');
    expect(fakes.rehearse).toHaveBeenCalledOnce();
  });

  it('R12: missing privileged ports fail at construction, not via public fallback', () => {
    const f = fixture();
    expect(() => createSajuHeldStagingRehearsalRunnerV1({
      ...f.input, admissionPort: undefined,
    } as unknown as CreateSajuHeldStagingRunnerInputV1)).toThrow(TypeError);
    expect(fakes.rehearse).not.toHaveBeenCalled();
  });
});
