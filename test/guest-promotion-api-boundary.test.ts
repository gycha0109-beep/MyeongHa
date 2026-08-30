import { describe, expect, it } from 'vitest';
import {
  ApiCommandError,
  GUEST_PROMOTION_AUTHORITY_BINDING_V1,
  GuestPromotionAuthorityPortErrorV1,
  promoteGuestToMember,
  type GuestPromotionAuthIdentityPortV1,
  type GuestPromotionAuthorityPortV1,
  type GuestPromotionAuthorityRowV1,
  type GuestPromotionGuestProofPortV1,
  type VerifiedGuestPromotionAuthIdentityV1,
  type VerifiedGuestPromotionProofV1,
} from '../apps/api/src/index.js';

const SUBJECT_ID = 'b1000000-0000-0000-0000-000000000001';
const SESSION_ID = 'b2000000-0000-0000-0000-000000000001';
const AUTH_USER_ID = 'b3000000-0000-0000-0000-000000000001';

class FakeGuestProofPortV1 implements GuestPromotionGuestProofPortV1 {
  readonly calls: string[] = [];
  result: VerifiedGuestPromotionProofV1 | null | Error = Object.freeze({
    subjectId: SUBJECT_ID,
    guestSessionId: SESSION_ID,
  });

  verifyGuestOwnershipForPromotion(): VerifiedGuestPromotionProofV1 | null {
    this.calls.push('verify-guest');
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

class FakeAuthIdentityPortV1 implements GuestPromotionAuthIdentityPortV1 {
  readonly calls: Array<{ subjectId: string; guestSessionId: string }> = [];
  result: VerifiedGuestPromotionAuthIdentityV1 | null | Error = Object.freeze({
    authUserId: AUTH_USER_ID,
  });

  verifyAuthIdentityForGuestPromotion(input: {
    readonly subjectId: string;
    readonly guestSessionId: string;
  }): VerifiedGuestPromotionAuthIdentityV1 | null {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

class FakeGuestPromotionAuthorityPortV1 implements GuestPromotionAuthorityPortV1 {
  readonly calls: Array<{
    subjectId: string;
    guestSessionId: string;
    authUserId: string;
  }> = [];
  result: readonly GuestPromotionAuthorityRowV1[] | Error = Object.freeze([
    Object.freeze({
      subjectId: SUBJECT_ID,
      guestSessionId: SESSION_ID,
      subjectKind: 'member',
      subjectStatus: 'active',
      replayed: false,
    }),
  ]);

  promoteGuest(input: {
    readonly subjectId: string;
    readonly guestSessionId: string;
    readonly authUserId: string;
  }): readonly GuestPromotionAuthorityRowV1[] {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

function fixture() {
  return {
    guestProofPort: new FakeGuestProofPortV1(),
    authIdentityPort: new FakeAuthIdentityPortV1(),
    authorityPort: new FakeGuestPromotionAuthorityPortV1(),
  };
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

describe('Guest promotion API authority boundary', () => {
  it('pins POST /api/auth/promote-guest to the verified same-subject promotion command', () => {
    expect(GUEST_PROMOTION_AUTHORITY_BINDING_V1).toBe(
      'public.cmd_promote_guest_v1',
    );
  });

  it('promotes only identities resolved by trusted Guest and auth proof ports', async () => {
    const ports = fixture();

    const result = await promoteGuestToMember({ request: {}, ...ports });

    expect(ports.guestProofPort.calls).toEqual(['verify-guest']);
    expect(ports.authIdentityPort.calls).toEqual([
      { subjectId: SUBJECT_ID, guestSessionId: SESSION_ID },
    ]);
    expect(ports.authorityPort.calls).toEqual([
      {
        subjectId: SUBJECT_ID,
        guestSessionId: SESSION_ID,
        authUserId: AUTH_USER_ID,
      },
    ]);
    expect(result).toEqual({
      subjectId: SUBJECT_ID,
      kind: 'member',
      status: 'active',
      replayed: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('accepts an omitted body but strictly rejects invented client identity and idempotency fields', async () => {
    const noBody = fixture();
    await expect(promoteGuestToMember(noBody)).resolves.toMatchObject({
      subjectId: SUBJECT_ID,
      kind: 'member',
    });

    const forbiddenRequests = [
      { guestSessionId: SESSION_ID },
      { subjectId: SUBJECT_ID },
      { authUserId: AUTH_USER_ID },
      { guestToken: 'raw-secret' },
      { authToken: 'raw-auth-token' },
      { password: 'secret' },
      { otp: '123456' },
      { idempotencyKey: 'invented-promotion-key' },
    ];

    for (const request of forbiddenRequests) {
      const ports = fixture();
      await expectApiCode(promoteGuestToMember({ request, ...ports }), 'INVALID_REQUEST');
      expect(ports.guestProofPort.calls).toHaveLength(0);
      expect(ports.authIdentityPort.calls).toHaveLength(0);
      expect(ports.authorityPort.calls).toHaveLength(0);
    }

    for (const request of [null, [], 'body', 1]) {
      const ports = fixture();
      await expectApiCode(promoteGuestToMember({ request, ...ports }), 'INVALID_REQUEST');
      expect(ports.guestProofPort.calls).toHaveLength(0);
    }
  });

  it('requires Guest ownership proof before auth verification or DB authority', async () => {
    const ports = fixture();
    ports.guestProofPort.result = null;

    await expectApiCode(promoteGuestToMember({ request: {}, ...ports }), 'AUTH_REQUIRED');

    expect(ports.guestProofPort.calls).toEqual(['verify-guest']);
    expect(ports.authIdentityPort.calls).toHaveLength(0);
    expect(ports.authorityPort.calls).toHaveLength(0);
  });

  it('requires verified auth identity after Guest proof and before DB authority', async () => {
    const ports = fixture();
    ports.authIdentityPort.result = null;

    await expectApiCode(promoteGuestToMember({ request: {}, ...ports }), 'AUTH_REQUIRED');

    expect(ports.guestProofPort.calls).toEqual(['verify-guest']);
    expect(ports.authIdentityPort.calls).toEqual([
      { subjectId: SUBJECT_ID, guestSessionId: SESSION_ID },
    ]);
    expect(ports.authorityPort.calls).toHaveLength(0);
  });

  it('returns the same canonical member on natural response-loss replay without an idempotency key', async () => {
    const ports = fixture();
    ports.authorityPort.result = Object.freeze([
      Object.freeze({
        subjectId: SUBJECT_ID,
        guestSessionId: SESSION_ID,
        subjectKind: 'member',
        subjectStatus: 'active',
        replayed: true,
      }),
    ]);

    await expect(promoteGuestToMember({ request: {}, ...ports })).resolves.toEqual({
      subjectId: SUBJECT_ID,
      kind: 'member',
      status: 'active',
      replayed: true,
    });
    expect(ports.authorityPort.calls[0]).not.toHaveProperty('idempotencyKey');
  });

  it('maps stale Guest proof state to AUTH_REQUIRED without exposing raw DB detail', async () => {
    const codes = [
      'SUBJECT_NOT_FOUND',
      'SESSION_NOT_FOUND',
      'SESSION_CONSUMED',
      'SESSION_EXPIRED',
      'AUTH_IDENTITY_NOT_FOUND',
    ] as const;

    for (const code of codes) {
      const ports = fixture();
      ports.authorityPort.result = new GuestPromotionAuthorityPortErrorV1(
        code,
        'raw authority detail',
      );
      const error = await expectApiCode(
        promoteGuestToMember({ request: {}, ...ports }),
        'AUTH_REQUIRED',
      );
      expect(error.message).not.toContain('raw authority detail');
    }
  });

  it('keeps ineligible and existing-member identities out of the new-account promotion path', async () => {
    const codes = [
      'SUBJECT_INELIGIBLE',
      'EXISTING_MEMBER_REQUIRES_MERGE',
      'IDENTITY_CONFLICT',
    ] as const;

    for (const code of codes) {
      const ports = fixture();
      ports.authorityPort.result = new GuestPromotionAuthorityPortErrorV1(
        code,
        'raw authority detail',
      );
      const error = await expectApiCode(
        promoteGuestToMember({ request: {}, ...ports }),
        'FORBIDDEN',
      );
      expect(error.message).not.toContain('raw authority detail');
    }
  });

  it('treats invalid trusted proof output and invalid DB trusted input as internal failures', async () => {
    const invalidGuest = fixture();
    invalidGuest.guestProofPort.result = { subjectId: '   ', guestSessionId: SESSION_ID };
    await expect(promoteGuestToMember({ request: {}, ...invalidGuest })).rejects.toThrow(
      'trusted subject id is invalid',
    );
    expect(invalidGuest.authIdentityPort.calls).toHaveLength(0);
    expect(invalidGuest.authorityPort.calls).toHaveLength(0);

    const invalidAuth = fixture();
    invalidAuth.authIdentityPort.result = { authUserId: '' };
    await expect(promoteGuestToMember({ request: {}, ...invalidAuth })).rejects.toThrow(
      'trusted auth user id is invalid',
    );
    expect(invalidAuth.authorityPort.calls).toHaveLength(0);

    const dbInvalid = fixture();
    dbInvalid.authorityPort.result = new GuestPromotionAuthorityPortErrorV1(
      'INVALID_INPUT',
      'trusted server input mismatch',
    );
    await expect(promoteGuestToMember({ request: {}, ...dbInvalid })).rejects.toThrow(
      'rejected trusted server input',
    );
  });

  it('fails closed on malformed successful authority output or identity substitution', async () => {
    const malformed: readonly GuestPromotionAuthorityRowV1[][] = [
      [],
      [
        {
          subjectId: SUBJECT_ID,
          guestSessionId: SESSION_ID,
          subjectKind: 'member',
          subjectStatus: 'active',
          replayed: false,
        },
        {
          subjectId: SUBJECT_ID,
          guestSessionId: SESSION_ID,
          subjectKind: 'member',
          subjectStatus: 'active',
          replayed: true,
        },
      ],
      [
        {
          subjectId: 'different-subject',
          guestSessionId: SESSION_ID,
          subjectKind: 'member',
          subjectStatus: 'active',
          replayed: false,
        },
      ],
      [
        {
          subjectId: SUBJECT_ID,
          guestSessionId: 'different-session',
          subjectKind: 'member',
          subjectStatus: 'active',
          replayed: false,
        },
      ],
      [
        {
          subjectId: SUBJECT_ID,
          guestSessionId: SESSION_ID,
          subjectKind: 'guest',
          subjectStatus: 'active',
          replayed: false,
        },
      ],
      [
        {
          subjectId: SUBJECT_ID,
          guestSessionId: SESSION_ID,
          subjectKind: 'member',
          subjectStatus: 'merged',
          replayed: false,
        },
      ],
      [
        {
          subjectId: SUBJECT_ID,
          guestSessionId: SESSION_ID,
          subjectKind: 'member',
          subjectStatus: 'active',
          replayed: 'yes' as unknown as boolean,
        },
      ],
    ];

    for (const rows of malformed) {
      const ports = fixture();
      ports.authorityPort.result = Object.freeze(rows);
      await expect(promoteGuestToMember({ request: {}, ...ports })).rejects.toThrow();
    }
  });

  it('rethrows proof-provider and DB infrastructure failures unchanged', async () => {
    const guestFailure = fixture();
    const guestInfra = new Error('guest proof service unavailable');
    guestFailure.guestProofPort.result = guestInfra;
    await expect(promoteGuestToMember({ request: {}, ...guestFailure })).rejects.toBe(
      guestInfra,
    );

    const authFailure = fixture();
    const authInfra = new Error('auth provider unavailable');
    authFailure.authIdentityPort.result = authInfra;
    await expect(promoteGuestToMember({ request: {}, ...authFailure })).rejects.toBe(
      authInfra,
    );

    const dbFailure = fixture();
    const dbInfra = new Error('database transport unavailable');
    dbFailure.authorityPort.result = dbInfra;
    await expect(promoteGuestToMember({ request: {}, ...dbFailure })).rejects.toBe(dbInfra);
  });
});
