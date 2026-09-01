import { describe, expect, it } from 'vitest';
import { ApiCommandError } from '../apps/api/src/api-error.js';
import {
  resolveSubjectIdentity,
  type ResolvedSubjectContextV1,
  type SubjectIdentityResolutionPortV1,
} from '../apps/api/src/subject-identity-resolver.js';

const SUBJECT_ID = '83000000-0000-0000-0000-000000000001';
const AUTH_USER_ID = '93000000-0000-0000-0000-000000000001';
const GUEST_TOKEN_HASH = 'guest-verifier-fingerprint-v1';

class FakeSubjectIdentityResolutionPortV1 implements SubjectIdentityResolutionPortV1 {
  readonly memberCalls: Array<{ readonly verifiedAuthUserId: string }> = [];
  readonly guestCalls: Array<{ readonly verifiedGuestTokenHash: string }> = [];

  memberResult: ResolvedSubjectContextV1 | null = Object.freeze({
    subjectId: SUBJECT_ID,
    subjectKind: 'member',
  });
  guestResult: ResolvedSubjectContextV1 | null = Object.freeze({
    subjectId: SUBJECT_ID,
    subjectKind: 'guest',
  });

  resolveMemberSubject(input: {
    readonly verifiedAuthUserId: string;
  }): ResolvedSubjectContextV1 | null {
    this.memberCalls.push(input);
    return this.memberResult;
  }

  resolveGuestSubject(input: {
    readonly verifiedGuestTokenHash: string;
  }): ResolvedSubjectContextV1 | null {
    this.guestCalls.push(input);
    return this.guestResult;
  }
}

async function expectApiCode(
  promise: Promise<unknown>,
  code: string,
): Promise<ApiCommandError> {
  try {
    await promise;
    throw new Error('Expected ApiCommandError.');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiCommandError);
    expect((error as ApiCommandError).code).toBe(code);
    return error as ApiCommandError;
  }
}

describe('subject identity resolver', () => {
  it('resolves verified Member auth identity without accepting an owner id', async () => {
    const port = new FakeSubjectIdentityResolutionPortV1();

    const result = await resolveSubjectIdentity({
      verifiedEvidence: {
        kind: 'member',
        verifiedAuthUserId: AUTH_USER_ID,
      },
      resolutionPort: port,
    });

    expect(port.memberCalls).toEqual([{ verifiedAuthUserId: AUTH_USER_ID }]);
    expect(port.guestCalls).toEqual([]);
    expect(result).toEqual({ subjectId: SUBJECT_ID, subjectKind: 'member' });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('resolves only the verified Guest verifier fingerprint, never a raw bearer', async () => {
    const port = new FakeSubjectIdentityResolutionPortV1();

    const result = await resolveSubjectIdentity({
      verifiedEvidence: {
        kind: 'guest',
        verifiedGuestTokenHash: GUEST_TOKEN_HASH,
      },
      resolutionPort: port,
    });

    expect(port.memberCalls).toEqual([]);
    expect(port.guestCalls).toEqual([
      { verifiedGuestTokenHash: GUEST_TOKEN_HASH },
    ]);
    expect(result).toEqual({ subjectId: SUBJECT_ID, subjectKind: 'guest' });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    {
      evidence: {
        kind: 'member' as const,
        verifiedAuthUserId: AUTH_USER_ID,
      },
      setMissing: (port: FakeSubjectIdentityResolutionPortV1) => {
        port.memberResult = null;
      },
    },
    {
      evidence: {
        kind: 'guest' as const,
        verifiedGuestTokenHash: GUEST_TOKEN_HASH,
      },
      setMissing: (port: FakeSubjectIdentityResolutionPortV1) => {
        port.guestResult = null;
      },
    },
  ])('fails closed when verified evidence does not resolve a current subject', async ({
    evidence,
    setMissing,
  }) => {
    const port = new FakeSubjectIdentityResolutionPortV1();
    setMissing(port);

    await expectApiCode(
      resolveSubjectIdentity({ verifiedEvidence: evidence, resolutionPort: port }),
      'AUTH_REQUIRED',
    );
  });

  it('fails closed when a Member resolver returns a Guest context', async () => {
    const port = new FakeSubjectIdentityResolutionPortV1();
    port.memberResult = Object.freeze({
      subjectId: SUBJECT_ID,
      subjectKind: 'guest',
    });

    await expect(
      resolveSubjectIdentity({
        verifiedEvidence: {
          kind: 'member',
          verifiedAuthUserId: AUTH_USER_ID,
        },
        resolutionPort: port,
      }),
    ).rejects.toThrow('different subject kind');
  });

  it('fails closed when a Guest resolver returns a Member context', async () => {
    const port = new FakeSubjectIdentityResolutionPortV1();
    port.guestResult = Object.freeze({
      subjectId: SUBJECT_ID,
      subjectKind: 'member',
    });

    await expect(
      resolveSubjectIdentity({
        verifiedEvidence: {
          kind: 'guest',
          verifiedGuestTokenHash: GUEST_TOKEN_HASH,
        },
        resolutionPort: port,
      }),
    ).rejects.toThrow('different subject kind');
  });

  it('rejects malformed trusted Member evidence before calling the port', async () => {
    const port = new FakeSubjectIdentityResolutionPortV1();

    await expect(
      resolveSubjectIdentity({
        verifiedEvidence: {
          kind: 'member',
          verifiedAuthUserId: '   ',
        },
        resolutionPort: port,
      }),
    ).rejects.toThrow('trusted authentication user id is invalid');
    expect(port.memberCalls).toEqual([]);
  });

  it('rejects malformed trusted Guest evidence before calling the port', async () => {
    const port = new FakeSubjectIdentityResolutionPortV1();

    await expect(
      resolveSubjectIdentity({
        verifiedEvidence: {
          kind: 'guest',
          verifiedGuestTokenHash: '',
        },
        resolutionPort: port,
      }),
    ).rejects.toThrow('trusted guest verifier fingerprint is invalid');
    expect(port.guestCalls).toEqual([]);
  });

  it('rejects an invalid canonical subject returned by the trusted port', async () => {
    const port = new FakeSubjectIdentityResolutionPortV1();
    port.memberResult = Object.freeze({
      subjectId: ' ',
      subjectKind: 'member',
    });

    await expect(
      resolveSubjectIdentity({
        verifiedEvidence: {
          kind: 'member',
          verifiedAuthUserId: AUTH_USER_ID,
        },
        resolutionPort: port,
      }),
    ).rejects.toThrow('trusted subject id is invalid');
  });
});
