import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../packages/domain/src/index.js';
import { ApiCommandError } from '../apps/api/src/chat-receive.js';
import {
  READING_CREATE_AUTHORITY_BINDING_V1,
  READING_CREATE_REQUEST_CONTRACT_VERSION_V1,
  ReadingCreateAuthorityPortErrorV1,
  createDirectReading,
  type ReadingCreateAuthorityPortV1,
  type ReadingCreateAuthorityRowV1,
  type ReadingCreateIdPortV1,
} from '../apps/api/src/reading-create-command.js';

const SUBJECT_ID = '91000000-0000-0000-0000-00000000b134';
const SESSION_ID = '92000000-0000-0000-0000-00000000b134';
const READING_ID = '93000000-0000-0000-0000-00000000b134';
const SOURCE_PROFILE_ID = '94000000-0000-0000-0000-00000000b134';
const SOURCE_REVISION_ID = '95000000-0000-0000-0000-00000000b134';

type AuthorityCall = Parameters<ReadingCreateAuthorityPortV1['createReadingSession']>[0];

class FakeIdPortV1 implements ReadingCreateIdPortV1 {
  sessionCalls = 0;
  readingCalls = 0;
  sessionResult: string | Error = SESSION_ID;
  readingResult: string | Error = READING_ID;

  nextReadingSessionId(): string {
    this.sessionCalls += 1;
    if (this.sessionResult instanceof Error) throw this.sessionResult;
    return this.sessionResult;
  }

  nextReadingId(): string {
    this.readingCalls += 1;
    if (this.readingResult instanceof Error) throw this.readingResult;
    return this.readingResult;
  }
}

class FakeAuthorityPortV1 implements ReadingCreateAuthorityPortV1 {
  readonly calls: AuthorityCall[] = [];
  result: readonly ReadingCreateAuthorityRowV1[] | Error | undefined;

  createReadingSession(input: AuthorityCall): readonly ReadingCreateAuthorityRowV1[] {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    if (this.result !== undefined) return this.result;
    return [{
      readingSessionId: input.readingSessionId,
      readingId: input.readingId,
      attemptNo: 1,
      sourceBirthRevisionId: SOURCE_REVISION_ID,
      targetBirthRevisionId: null,
      domainCapabilityVersion: 'reading-general-v1',
      replayed: false,
    }];
  }
}

function ports() {
  return {
    idPort: new FakeIdPortV1(),
    authorityPort: new FakeAuthorityPortV1(),
  };
}

function directRequest() {
  return {
    idempotencyKey: 'reading-b134-1',
    domain: 'general',
    sourceBirthProfileId: SOURCE_PROFILE_ID,
  } as const;
}

function expectedHash(value: unknown): string {
  return `sha256:v1:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

async function expectApiCode(promise: Promise<unknown>, code: string): Promise<ApiCommandError> {
  try {
    await promise;
    throw new Error('Expected ApiCommandError.');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiCommandError);
    expect((error as ApiCommandError).code).toBe(code);
    return error as ApiCommandError;
  }
}

describe('B134 direct Reading create API boundary', () => {
  it('binds only to the verified Reading Session create authority and contract version', () => {
    expect(READING_CREATE_AUTHORITY_BINDING_V1).toBe('public.cmd_create_reading_session_v1');
    expect(READING_CREATE_REQUEST_CONTRACT_VERSION_V1).toBe('reading-request-v1');
  });

  it('creates one direct pending logical Reading authority request with no transport or character inputs', async () => {
    const p = ports();
    const request = directRequest();

    const result = await createDirectReading({
      resolvedSubjectId: SUBJECT_ID,
      request,
      ...p,
    });

    expect(result).toEqual({
      readingSessionId: SESSION_ID,
      readingId: READING_ID,
      attemptNo: 1,
      sourceBirthRevisionId: SOURCE_REVISION_ID,
      domainCapabilityVersion: 'reading-general-v1',
    });
    expect(p.authorityPort.calls).toEqual([{
      subjectId: SUBJECT_ID,
      readingSessionId: SESSION_ID,
      readingId: READING_ID,
      requestIdempotencyKey: 'reading-b134-1',
      requestHash: expectedHash(request),
      requestContractVersion: 'reading-request-v1',
      requestSnapshotJsonb: request,
      sajuDomain: 'general',
      sourceBirthProfileId: SOURCE_PROFILE_ID,
      targetBirthProfileId: null,
      sourceTurnId: null,
      requestedThreadCharacterId: null,
      requestedCharacterId: null,
      requestedCharacterContentBundleId: null,
    }]);
    expect(result).not.toHaveProperty('transportAttemptId');
    expect(result).not.toHaveProperty('sajuResponse');
  });

  it('accepts exact authority replay without requiring newly proposed identities to match', async () => {
    const p = ports();
    p.authorityPort.result = [{
      readingSessionId: '96000000-0000-0000-0000-00000000b134',
      readingId: '97000000-0000-0000-0000-00000000b134',
      attemptNo: 1,
      sourceBirthRevisionId: SOURCE_REVISION_ID,
      targetBirthRevisionId: null,
      domainCapabilityVersion: 'reading-general-v1',
      replayed: true,
    }];

    const result = await createDirectReading({
      resolvedSubjectId: SUBJECT_ID,
      request: directRequest(),
      ...p,
    });

    expect(result.readingSessionId).toBe('96000000-0000-0000-0000-00000000b134');
    expect(result.readingId).toBe('97000000-0000-0000-0000-00000000b134');
  });

  it('fails closed on target Birth or compatibility requests while SRC-08 remains unresolved', async () => {
    for (const request of [
      { ...directRequest(), targetBirthProfileId: '98000000-0000-0000-0000-00000000b134' },
      { ...directRequest(), domain: 'compatibility' },
    ]) {
      const p = ports();
      await expectApiCode(
        createDirectReading({ resolvedSubjectId: SUBJECT_ID, request, ...p }),
        'CAPABILITY_UNAVAILABLE',
      );
      expect(p.idPort.sessionCalls).toBe(0);
      expect(p.idPort.readingCalls).toBe(0);
      expect(p.authorityPort.calls).toHaveLength(0);
    }
  });

  it('fails closed on character- or turn-coupled variants instead of inventing current rollout resolution', async () => {
    for (const request of [
      { ...directRequest(), characterId: 'character-a' },
      { ...directRequest(), sourceTurnId: '99000000-0000-0000-0000-00000000b134' },
    ]) {
      const p = ports();
      await expectApiCode(
        createDirectReading({ resolvedSubjectId: SUBJECT_ID, request, ...p }),
        'CAPABILITY_UNAVAILABLE',
      );
      expect(p.idPort.sessionCalls).toBe(0);
      expect(p.authorityPort.calls).toHaveLength(0);
    }
  });

  it('rejects unsupported fields and malformed optional feature ids before trusted ports run', async () => {
    for (const request of [
      { ...directRequest(), readingId: READING_ID },
      { ...directRequest(), targetBirthProfileId: null },
      { ...directRequest(), characterId: '' },
      { ...directRequest(), sourceTurnId: 7 },
    ]) {
      const p = ports();
      await expectApiCode(
        createDirectReading({ resolvedSubjectId: SUBJECT_ID, request, ...p }),
        'INVALID_REQUEST',
      );
      expect(p.idPort.sessionCalls).toBe(0);
      expect(p.authorityPort.calls).toHaveLength(0);
    }
  });

  it('validates auth, idempotency, domain registry, and source Birth profile id before persistence', async () => {
    const authPorts = ports();
    await expectApiCode(
      createDirectReading({
        request: directRequest(),
        ...authPorts,
      }),
      'AUTH_REQUIRED',
    );
    expect(authPorts.idPort.sessionCalls).toBe(0);
    expect(authPorts.authorityPort.calls).toHaveLength(0);

    const cases = [
      { request: { ...directRequest(), idempotencyKey: '' }, code: 'INVALID_REQUEST' },
      { request: { ...directRequest(), domain: 'invented-domain' }, code: 'INVALID_REQUEST' },
      { request: { ...directRequest(), sourceBirthProfileId: ' ' }, code: 'INVALID_REQUEST' },
    ] as const;

    for (const testCase of cases) {
      const p = ports();
      await expectApiCode(
        createDirectReading({
          resolvedSubjectId: SUBJECT_ID,
          request: testCase.request,
          ...p,
        }),
        testCase.code,
      );
      expect(p.idPort.sessionCalls).toBe(0);
      expect(p.authorityPort.calls).toHaveLength(0);
    }
  });

  it('maps bounded DB authority failures without leaking persistence details', async () => {
    const cases = [
      ['SOURCE_PROFILE_NOT_FOUND', 'NOT_FOUND'],
      ['SOURCE_PROFILE_NOT_READY', 'CAPABILITY_UNAVAILABLE'],
      ['PROFILE_CARDINALITY_INVALID', 'CAPABILITY_UNAVAILABLE'],
      ['DOMAIN_UNAVAILABLE', 'CAPABILITY_UNAVAILABLE'],
      ['IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT'],
      ['INVALID_INPUT', 'INVALID_REQUEST'],
    ] as const;

    for (const [authorityCode, apiCode] of cases) {
      const p = ports();
      p.authorityPort.result = new ReadingCreateAuthorityPortErrorV1(
        authorityCode,
        `raw ${authorityCode}`,
      );
      const error = await expectApiCode(
        createDirectReading({ resolvedSubjectId: SUBJECT_ID, request: directRequest(), ...p }),
        apiCode,
      );
      expect(error.message).not.toContain('raw ');
    }
  });

  it('fails closed on impossible authority cardinality or direct-reading projection shape', async () => {
    const invalidResults: readonly (readonly ReadingCreateAuthorityRowV1[])[] = [
      [],
      [{
        readingSessionId: SESSION_ID,
        readingId: READING_ID,
        attemptNo: 2,
        sourceBirthRevisionId: SOURCE_REVISION_ID,
        targetBirthRevisionId: null,
        domainCapabilityVersion: 'reading-general-v1',
        replayed: false,
      }],
      [{
        readingSessionId: SESSION_ID,
        readingId: READING_ID,
        attemptNo: 1,
        sourceBirthRevisionId: SOURCE_REVISION_ID,
        targetBirthRevisionId: '9a000000-0000-0000-0000-00000000b134',
        domainCapabilityVersion: 'reading-general-v1',
        replayed: false,
      }],
      [{
        readingSessionId: '9b000000-0000-0000-0000-00000000b134',
        readingId: READING_ID,
        attemptNo: 1,
        sourceBirthRevisionId: SOURCE_REVISION_ID,
        targetBirthRevisionId: null,
        domainCapabilityVersion: 'reading-general-v1',
        replayed: false,
      }],
    ];

    for (const result of invalidResults) {
      const p = ports();
      p.authorityPort.result = result;
      await expect(
        createDirectReading({ resolvedSubjectId: SUBJECT_ID, request: directRequest(), ...p }),
      ).rejects.toBeInstanceOf(Error);
    }
  });

  it('rethrows infrastructure and trusted server-id conflicts as internal failures', async () => {
    for (const error of [
      new Error('database unavailable'),
      new ReadingCreateAuthorityPortErrorV1('SERVER_ID_CONFLICT', 'raw id conflict'),
    ]) {
      const p = ports();
      p.authorityPort.result = error;
      await expect(
        createDirectReading({ resolvedSubjectId: SUBJECT_ID, request: directRequest(), ...p }),
      ).rejects.not.toBeInstanceOf(ApiCommandError);
    }
  });
});
