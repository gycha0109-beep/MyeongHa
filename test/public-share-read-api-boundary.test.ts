import { describe, expect, it } from 'vitest';
import {
  ApiCommandError,
  PUBLIC_SHARE_READ_AUTHORITY_BINDING_V1,
  PublicShareReadAuthorityPortErrorV1,
  getPublicShareArtifact,
  type PublicShareArtifactAuthorityRowV1,
  type PublicShareReadAuthorityPortV1,
  type PublicShareTokenFingerprintPortV1,
} from '../apps/api/src/index.js';

const RAW_TOKEN = 'opaque.public.share.token';
const TOKEN_HASH = 'hmac-sha256:k2:public-share-token';

class FakeFingerprintPortV1 implements PublicShareTokenFingerprintPortV1 {
  readonly calls: Array<{ rawPublicToken: string }> = [];
  result: string | Error = TOKEN_HASH;

  fingerprintPublicShareToken(input: { readonly rawPublicToken: string }): string {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

class FakePublicShareAuthorityPortV1 implements PublicShareReadAuthorityPortV1 {
  readonly calls: Array<{ publicTokenHash: string }> = [];
  result: readonly PublicShareArtifactAuthorityRowV1[] | Error = Object.freeze([
    Object.freeze({
      artifactVersion: 'share-v1',
      snapshot: Object.freeze({
        title: 'public-safe',
        blocks: Object.freeze([Object.freeze({ kind: 'summary', text: 'safe' })]),
      }),
    }),
  ]);

  getPublicShareArtifact(input: {
    readonly publicTokenHash: string;
  }): readonly PublicShareArtifactAuthorityRowV1[] {
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

describe('Public Share Artifact read API authority boundary', () => {
  it('pins GET /s/:publicToken to the public-safe stored snapshot query', () => {
    expect(PUBLIC_SHARE_READ_AUTHORITY_BINDING_V1).toBe(
      'public.qry_public_share_artifact_v1',
    );
  });

  it('fingerprints the raw opaque token before DB authority lookup', async () => {
    const fingerprintPort = new FakeFingerprintPortV1();
    const authorityPort = new FakePublicShareAuthorityPortV1();

    await getPublicShareArtifact({
      publicToken: RAW_TOKEN,
      fingerprintPort,
      authorityPort,
    });

    expect(fingerprintPort.calls).toEqual([{ rawPublicToken: RAW_TOKEN }]);
    expect(authorityPort.calls).toEqual([{ publicTokenHash: TOKEN_HASH }]);
    expect(authorityPort.calls[0]).not.toHaveProperty('rawPublicToken');
  });

  it('returns only artifact version and the stored public snapshot projection', async () => {
    const fingerprintPort = new FakeFingerprintPortV1();
    const authorityPort = new FakePublicShareAuthorityPortV1();

    const result = await getPublicShareArtifact({
      publicToken: RAW_TOKEN,
      fingerprintPort,
      authorityPort,
    });

    expect(result).toEqual({
      artifactVersion: 'share-v1',
      snapshot: {
        title: 'public-safe',
        blocks: [{ kind: 'summary', text: 'safe' }],
      },
    });
    expect(Object.keys(result).sort()).toEqual(['artifactVersion', 'snapshot']);
    expect(result).not.toHaveProperty('subjectId');
    expect(result).not.toHaveProperty('readingId');
    expect(result).not.toHaveProperty('publicTokenHash');
    expect(result).not.toHaveProperty('snapshotHash');
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('preserves the stored public snapshot as opaque JSON instead of inventing a SRC-20 schema', async () => {
    const fingerprintPort = new FakeFingerprintPortV1();
    const authorityPort = new FakePublicShareAuthorityPortV1();
    const opaqueSnapshot = Object.freeze({
      futurePublicShape: Object.freeze({ versioned: true }),
      blocks: Object.freeze([1, 'two', null]),
    });
    authorityPort.result = Object.freeze([
      Object.freeze({ artifactVersion: 'share-future-v7', snapshot: opaqueSnapshot }),
    ]);

    const result = await getPublicShareArtifact({
      publicToken: RAW_TOKEN,
      fingerprintPort,
      authorityPort,
    });

    expect(result).toEqual({
      artifactVersion: 'share-future-v7',
      snapshot: opaqueSnapshot,
    });
    expect(result.snapshot).toBe(opaqueSnapshot);
  });

  it('rejects missing, blank, or non-string raw tokens before fingerprinting', async () => {
    for (const publicToken of [undefined, null, '', '   ', 7, {}, []]) {
      const fingerprintPort = new FakeFingerprintPortV1();
      const authorityPort = new FakePublicShareAuthorityPortV1();

      await expectApiCode(
        getPublicShareArtifact({ publicToken, fingerprintPort, authorityPort }),
        'INVALID_REQUEST',
      );
      expect(fingerprintPort.calls).toHaveLength(0);
      expect(authorityPort.calls).toHaveLength(0);
    }
  });

  it('does not normalize or trim a valid opaque token before fingerprinting', async () => {
    const fingerprintPort = new FakeFingerprintPortV1();
    const authorityPort = new FakePublicShareAuthorityPortV1();
    const rawToken = '  opaque-token-with-significant-edge-space ';

    await getPublicShareArtifact({
      publicToken: rawToken,
      fingerprintPort,
      authorityPort,
    });

    expect(fingerprintPort.calls).toEqual([{ rawPublicToken: rawToken }]);
  });

  it('maps revoked, expired, clock-expired, and unknown shares to one bounded NOT_FOUND surface', async () => {
    const authorityPort = new FakePublicShareAuthorityPortV1();
    authorityPort.result = new PublicShareReadAuthorityPortErrorV1(
      'SHARE_UNAVAILABLE',
      'raw status or token existence detail',
    );
    const fingerprintPort = new FakeFingerprintPortV1();

    const error = await expectApiCode(
      getPublicShareArtifact({
        publicToken: RAW_TOKEN,
        fingerprintPort,
        authorityPort,
      }),
      'NOT_FOUND',
    );
    expect(error.message).not.toContain('raw status or token existence detail');
  });

  it('treats invalid trusted fingerprint output and DB trusted-input rejection as internal failures', async () => {
    for (const fingerprint of ['', '   ']) {
      const fingerprintPort = new FakeFingerprintPortV1();
      fingerprintPort.result = fingerprint;
      const authorityPort = new FakePublicShareAuthorityPortV1();

      await expect(
        getPublicShareArtifact({
          publicToken: RAW_TOKEN,
          fingerprintPort,
          authorityPort,
        }),
      ).rejects.toThrow('invalid fingerprint');
      expect(authorityPort.calls).toHaveLength(0);
    }

    const fingerprintPort = new FakeFingerprintPortV1();
    const authorityPort = new FakePublicShareAuthorityPortV1();
    authorityPort.result = new PublicShareReadAuthorityPortErrorV1(
      'INVALID_INPUT',
      'trusted fingerprint was invalid',
    );
    await expect(
      getPublicShareArtifact({
        publicToken: RAW_TOKEN,
        fingerprintPort,
        authorityPort,
      }),
    ).rejects.toThrow('rejected trusted fingerprint input');
  });

  it('fails closed on zero/multiple rows or malformed stored projection', async () => {
    const malformed: Array<readonly PublicShareArtifactAuthorityRowV1[]> = [
      [],
      [
        { artifactVersion: 'share-v1', snapshot: {} },
        { artifactVersion: 'share-v1', snapshot: {} },
      ],
      [{ artifactVersion: '', snapshot: {} }],
      [{ artifactVersion: '   ', snapshot: {} }],
      [{ artifactVersion: 'share-v1', snapshot: undefined }],
    ];

    for (const rows of malformed) {
      const fingerprintPort = new FakeFingerprintPortV1();
      const authorityPort = new FakePublicShareAuthorityPortV1();
      authorityPort.result = Object.freeze(rows);
      await expect(
        getPublicShareArtifact({
          publicToken: RAW_TOKEN,
          fingerprintPort,
          authorityPort,
        }),
      ).rejects.toThrow();
    }
  });

  it('allows JSON null because the read boundary does not invent a positive snapshot schema', async () => {
    const fingerprintPort = new FakeFingerprintPortV1();
    const authorityPort = new FakePublicShareAuthorityPortV1();
    authorityPort.result = Object.freeze([
      Object.freeze({ artifactVersion: 'share-v1', snapshot: null }),
    ]);

    await expect(
      getPublicShareArtifact({
        publicToken: RAW_TOKEN,
        fingerprintPort,
        authorityPort,
      }),
    ).resolves.toEqual({ artifactVersion: 'share-v1', snapshot: null });
  });

  it('rethrows fingerprint-provider and DB infrastructure failures unchanged', async () => {
    const fingerprintPort = new FakeFingerprintPortV1();
    const fingerprintFailure = new Error('fingerprint key service unavailable');
    fingerprintPort.result = fingerprintFailure;
    const authorityPort = new FakePublicShareAuthorityPortV1();
    await expect(
      getPublicShareArtifact({
        publicToken: RAW_TOKEN,
        fingerprintPort,
        authorityPort,
      }),
    ).rejects.toBe(fingerprintFailure);
    expect(authorityPort.calls).toHaveLength(0);

    const secondFingerprintPort = new FakeFingerprintPortV1();
    const dbFailure = new Error('database transport unavailable');
    const secondAuthorityPort = new FakePublicShareAuthorityPortV1();
    secondAuthorityPort.result = dbFailure;
    await expect(
      getPublicShareArtifact({
        publicToken: RAW_TOKEN,
        fingerprintPort: secondFingerprintPort,
        authorityPort: secondAuthorityPort,
      }),
    ).rejects.toBe(dbFailure);
  });
});
