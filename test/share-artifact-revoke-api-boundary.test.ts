import { describe, expect, it } from 'vitest';
import {
  ApiCommandError,
  SHARE_ARTIFACT_REVOKE_COMMAND_AUTHORITY_BINDING_V1,
  ShareArtifactRevokeCommandAuthorityPortErrorV1,
  revokeShareArtifact,
  type ShareArtifactRevokeCommandAuthorityPortV1,
  type ShareArtifactRevokeCommandAuthorityRowV1,
} from '../apps/api/src/index.js';

const SUBJECT_ID = 'e1000000-0000-0000-0000-000000000001';
const SHARE_ID = 'e2000000-0000-0000-0000-000000000001';
const REVOKED_AT = '2026-08-30T04:00:00.000Z';

class FakeShareArtifactRevokeAuthorityPortV1
  implements ShareArtifactRevokeCommandAuthorityPortV1
{
  readonly calls: Array<{ subjectId: string; shareArtifactId: string }> = [];
  result: readonly ShareArtifactRevokeCommandAuthorityRowV1[] | Error = Object.freeze([
    Object.freeze({
      shareArtifactId: SHARE_ID,
      effectiveStatus: 'revoked',
      revokedAt: REVOKED_AT,
      replayed: false,
    }),
  ]);

  revokeShareArtifact(input: {
    readonly subjectId: string;
    readonly shareArtifactId: string;
  }): readonly ShareArtifactRevokeCommandAuthorityRowV1[] {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    return this.result;
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

describe('Share Artifact revoke API authority boundary', () => {
  it('pins DELETE /api/share-artifacts/:id to the owner-scoped revoke command', () => {
    expect(SHARE_ARTIFACT_REVOKE_COMMAND_AUTHORITY_BINDING_V1).toBe(
      'public.cmd_revoke_share_artifact_v1',
    );
  });

  it('passes only resolved owner identity and path artifact id to authority', async () => {
    const authorityPort = new FakeShareArtifactRevokeAuthorityPortV1();

    const result = await revokeShareArtifact({
      resolvedSubjectId: SUBJECT_ID,
      shareArtifactId: SHARE_ID,
      authorityPort,
    });

    expect(authorityPort.calls).toEqual([
      { subjectId: SUBJECT_ID, shareArtifactId: SHARE_ID },
    ]);
    expect(result).toEqual({
      shareArtifactId: SHARE_ID,
      effectiveStatus: 'revoked',
      revokedAt: REVOKED_AT,
      replayed: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('preserves authoritative revoked replay state without creating a new timestamp', async () => {
    const authorityPort = new FakeShareArtifactRevokeAuthorityPortV1();
    authorityPort.result = Object.freeze([
      Object.freeze({
        shareArtifactId: SHARE_ID,
        effectiveStatus: 'revoked',
        revokedAt: REVOKED_AT,
        replayed: true,
      }),
    ]);

    await expect(
      revokeShareArtifact({
        resolvedSubjectId: SUBJECT_ID,
        shareArtifactId: SHARE_ID,
        authorityPort,
      }),
    ).resolves.toEqual({
      shareArtifactId: SHARE_ID,
      effectiveStatus: 'revoked',
      revokedAt: REVOKED_AT,
      replayed: true,
    });
  });

  it('preserves expired as an immutable terminal no-op rather than rewriting it to revoked', async () => {
    const authorityPort = new FakeShareArtifactRevokeAuthorityPortV1();
    authorityPort.result = Object.freeze([
      Object.freeze({
        shareArtifactId: SHARE_ID,
        effectiveStatus: 'expired',
        revokedAt: null,
        replayed: true,
      }),
    ]);

    await expect(
      revokeShareArtifact({
        resolvedSubjectId: SUBJECT_ID,
        shareArtifactId: SHARE_ID,
        authorityPort,
      }),
    ).resolves.toEqual({
      shareArtifactId: SHARE_ID,
      effectiveStatus: 'expired',
      revokedAt: null,
      replayed: true,
    });
  });

  it('requires resolved subject and nonblank path id before authority access', async () => {
    const missingSubjectPort = new FakeShareArtifactRevokeAuthorityPortV1();
    await expectApiCode(
      revokeShareArtifact({ shareArtifactId: SHARE_ID, authorityPort: missingSubjectPort }),
      'AUTH_REQUIRED',
    );
    expect(missingSubjectPort.calls).toHaveLength(0);

    for (const resolvedSubjectId of ['', '   ']) {
      const authorityPort = new FakeShareArtifactRevokeAuthorityPortV1();
      await expectApiCode(
        revokeShareArtifact({ resolvedSubjectId, shareArtifactId: SHARE_ID, authorityPort }),
        'AUTH_REQUIRED',
      );
      expect(authorityPort.calls).toHaveLength(0);
    }

    for (const shareArtifactId of [undefined, null, '', '   ', 7, {}]) {
      const authorityPort = new FakeShareArtifactRevokeAuthorityPortV1();
      await expectApiCode(
        revokeShareArtifact({
          resolvedSubjectId: SUBJECT_ID,
          shareArtifactId,
          authorityPort,
        }),
        'INVALID_REQUEST',
      );
      expect(authorityPort.calls).toHaveLength(0);
    }
  });

  it('maps missing and cross-owner artifacts to the same bounded NOT_FOUND response', async () => {
    const authorityPort = new FakeShareArtifactRevokeAuthorityPortV1();
    authorityPort.result = new ShareArtifactRevokeCommandAuthorityPortErrorV1(
      'SHARE_UNAVAILABLE',
      'raw owner/not-found detail',
    );

    const error = await expectApiCode(
      revokeShareArtifact({
        resolvedSubjectId: SUBJECT_ID,
        shareArtifactId: SHARE_ID,
        authorityPort,
      }),
      'NOT_FOUND',
    );
    expect(error.message).not.toContain('raw owner/not-found detail');
  });

  it('does not normalize an impossible lifecycle state into a public revoke result', async () => {
    const authorityPort = new FakeShareArtifactRevokeAuthorityPortV1();
    authorityPort.result = new ShareArtifactRevokeCommandAuthorityPortErrorV1(
      'SHARE_STATE_INVALID',
      'raw invalid lifecycle state',
    );

    await expect(
      revokeShareArtifact({
        resolvedSubjectId: SUBJECT_ID,
        shareArtifactId: SHARE_ID,
        authorityPort,
      }),
    ).rejects.toThrow('invalid lifecycle state');
  });

  it('maps explicit authority input rejection to INVALID_REQUEST', async () => {
    const authorityPort = new FakeShareArtifactRevokeAuthorityPortV1();
    authorityPort.result = new ShareArtifactRevokeCommandAuthorityPortErrorV1(
      'INVALID_INPUT',
      'invalid share revoke input',
    );

    await expectApiCode(
      revokeShareArtifact({
        resolvedSubjectId: SUBJECT_ID,
        shareArtifactId: SHARE_ID,
        authorityPort,
      }),
      'INVALID_REQUEST',
    );
  });

  it('fails closed when authority returns zero or multiple successful rows', async () => {
    const zero = new FakeShareArtifactRevokeAuthorityPortV1();
    zero.result = Object.freeze([]);
    await expect(
      revokeShareArtifact({
        resolvedSubjectId: SUBJECT_ID,
        shareArtifactId: SHARE_ID,
        authorityPort: zero,
      }),
    ).rejects.toThrow('exactly one successful row');

    const multiple = new FakeShareArtifactRevokeAuthorityPortV1();
    multiple.result = Object.freeze([
      {
        shareArtifactId: SHARE_ID,
        effectiveStatus: 'revoked',
        revokedAt: REVOKED_AT,
        replayed: false,
      },
      {
        shareArtifactId: SHARE_ID,
        effectiveStatus: 'revoked',
        revokedAt: REVOKED_AT,
        replayed: true,
      },
    ]);
    await expect(
      revokeShareArtifact({
        resolvedSubjectId: SUBJECT_ID,
        shareArtifactId: SHARE_ID,
        authorityPort: multiple,
      }),
    ).rejects.toThrow('exactly one successful row');
  });

  it('fails closed on identity substitution or malformed terminal projection', async () => {
    const malformed: readonly ShareArtifactRevokeCommandAuthorityRowV1[][] = [
      [
        {
          shareArtifactId: 'different-artifact',
          effectiveStatus: 'revoked',
          revokedAt: REVOKED_AT,
          replayed: false,
        },
      ],
      [
        {
          shareArtifactId: SHARE_ID,
          effectiveStatus: 'active',
          revokedAt: null,
          replayed: false,
        },
      ],
      [
        {
          shareArtifactId: SHARE_ID,
          effectiveStatus: 'revoked',
          revokedAt: null,
          replayed: false,
        },
      ],
      [
        {
          shareArtifactId: SHARE_ID,
          effectiveStatus: 'revoked',
          revokedAt: 'not-a-time',
          replayed: false,
        },
      ],
      [
        {
          shareArtifactId: SHARE_ID,
          effectiveStatus: 'expired',
          revokedAt: REVOKED_AT,
          replayed: true,
        },
      ],
      [
        {
          shareArtifactId: SHARE_ID,
          effectiveStatus: 'revoked',
          revokedAt: REVOKED_AT,
          replayed: 'yes' as unknown as boolean,
        },
      ],
    ];

    for (const rows of malformed) {
      const authorityPort = new FakeShareArtifactRevokeAuthorityPortV1();
      authorityPort.result = Object.freeze(rows);
      await expect(
        revokeShareArtifact({
          resolvedSubjectId: SUBJECT_ID,
          shareArtifactId: SHARE_ID,
          authorityPort,
        }),
      ).rejects.toThrow();
    }
  });

  it('rethrows infrastructure failures unchanged', async () => {
    const authorityPort = new FakeShareArtifactRevokeAuthorityPortV1();
    const infrastructureFailure = new Error('database transport unavailable');
    authorityPort.result = infrastructureFailure;

    await expect(
      revokeShareArtifact({
        resolvedSubjectId: SUBJECT_ID,
        shareArtifactId: SHARE_ID,
        authorityPort,
      }),
    ).rejects.toBe(infrastructureFailure);
  });
});
