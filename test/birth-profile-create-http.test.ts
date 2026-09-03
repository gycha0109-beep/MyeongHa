import { describe, expect, it } from 'vitest';
import {
  BIRTH_PROFILE_CREATE_HTTP_BINDINGS_V1,
  handleBirthProfileCreateRequestV1,
  type HandleBirthProfileCreateRequestInputV1,
} from '../apps/api/src/birth-profile-create-http.js';
import type {
  BirthInputFingerprintPortV1,
  BirthProfileCreateIdPortV1,
} from '../apps/api/src/birth-profile-create-command.js';
import type { IdentityEvidenceVerificationPortV1 } from '../apps/api/src/current-subject-profile-http.js';
import type {
  PostgresQueryResultV1,
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from '../apps/api/src/subject-identity-resolver.js';

const SUBJECT_ID = 'b7200000-0000-0000-0000-000000000001';
const PROFILE_ID = 'b7300000-0000-0000-0000-000000000001';
const REVISION_ID = 'b7400000-0000-0000-0000-000000000001';
const INPUT_HASH = `hmac-sha256:k1:${'a'.repeat(64)}`;

class FakeIdentityVerifier implements IdentityEvidenceVerificationPortV1 {
  calls = 0;
  evidence: VerifiedSubjectIdentityEvidenceV1 | null = Object.freeze({
    kind: 'guest',
    verifiedGuestTokenHash: 'myeongha-guest-bearer-hmac-sha256-v1:test-fingerprint',
  });

  verifyRequestIdentity(): VerifiedSubjectIdentityEvidenceV1 | null {
    this.calls += 1;
    return this.evidence;
  }
}

class FakeConnection implements PostgresSubjectConnectionV1 {
  readonly calls: Array<{ text: string; values: readonly unknown[] }> = [];
  released = false;
  failCreateWithConstraint: string | null = null;

  query<Row = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): PostgresQueryResultV1<Row> {
    this.calls.push({ text, values });

    if (text.includes('begin_guest_subject_context_v1')) {
      return {
        rows: [
          { subjectId: SUBJECT_ID, subjectKind: 'guest' },
        ] as unknown as readonly Row[],
      };
    }
    if (text.includes('cmd_create_birth_profile_runtime_v1')) {
      if (this.failCreateWithConstraint !== null) {
        throw Object.assign(new Error('governed Birth Profile create failure'), {
          constraint: this.failCreateWithConstraint,
          code:
            this.failCreateWithConstraint === 'cmd_birth_profile_create_active_self_exists'
              ? '23505'
              : '23514',
        });
      }
      return {
        rows: [
          {
            birthProfileId: PROFILE_ID,
            revisionId: REVISION_ID,
            revisionNo: 1,
          },
        ] as unknown as readonly Row[],
      };
    }
    return { rows: [] };
  }

  release(): void {
    this.released = true;
  }
}

class FakePool implements PostgresSubjectPoolV1 {
  connectCalls = 0;
  readonly connection = new FakeConnection();

  connect(): PostgresSubjectConnectionV1 {
    this.connectCalls += 1;
    return this.connection;
  }
}

class FakeIdPort implements BirthProfileCreateIdPortV1 {
  nextBirthProfileId(): string {
    return PROFILE_ID;
  }

  nextBirthRevisionId(): string {
    return REVISION_ID;
  }
}

class FakeFingerprintPort implements BirthInputFingerprintPortV1 {
  calls = 0;

  fingerprintBirthInput(): string {
    this.calls += 1;
    return INPUT_HASH;
  }
}

function validRequestBody(): object {
  return {
    label: '나의 명식록',
    input: {
      calendarType: 'solar',
      birthDate: '1990-01-02',
      birthTime: '08:30:00',
      timeKnown: true,
      isLeapMonth: false,
      sex: 'female',
    },
  };
}

function jsonRequest(body: unknown, method = 'POST'): Request {
  const init: RequestInit =
    method === 'POST'
      ? {
          method,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {
          method,
          headers: { 'content-type': 'application/json' },
        };
  return new Request('https://myeongha.vercel.app/api/birth-profiles', init);
}

function makeInput(overrides: Partial<HandleBirthProfileCreateRequestInputV1> = {}) {
  const verifier = new FakeIdentityVerifier();
  const pool = new FakePool();
  const idPort = new FakeIdPort();
  const fingerprintPort = new FakeFingerprintPort();

  return {
    verifier,
    pool,
    fingerprintPort,
    input: {
      request: jsonRequest(validRequestBody()),
      requestId: 'request-birth-create-1',
      serverTime: '2026-09-03T08:00:00.000Z',
      identityEvidenceVerifier: verifier,
      pool,
      idPort,
      fingerprintPort,
      ...overrides,
    } satisfies HandleBirthProfileCreateRequestInputV1,
  };
}

describe('production Birth Profile create HTTP foundation', () => {
  it('pins POST to the approved governed runtime wrapper only', () => {
    expect(BIRTH_PROFILE_CREATE_HTTP_BINDINGS_V1).toEqual({
      method: 'POST',
      route: '/api/birth-profiles',
      createAuthority: 'public.cmd_create_birth_profile_runtime_v1',
      apiContractVersion: 'v0.9',
    });
  });

  it('resolves canonical subject in PostgreSQL and creates through the runtime wrapper', async () => {
    const { input, pool, fingerprintPort } = makeInput();
    const response = await handleBirthProfileCreateRequestV1(input);

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      data: {
        birthProfileId: PROFILE_ID,
        revisionId: REVISION_ID,
        revisionNo: 1,
      },
      meta: {
        apiContractVersion: 'v0.9',
        requestId: 'request-birth-create-1',
        serverTime: '2026-09-03T08:00:00.000Z',
      },
    });
    expect(fingerprintPort.calls).toBe(1);

    const createCall = pool.connection.calls.find((call) =>
      call.text.includes('cmd_create_birth_profile_runtime_v1'),
    );
    expect(createCall?.values).toEqual([
      SUBJECT_ID,
      PROFILE_ID,
      REVISION_ID,
      '나의 명식록',
      'solar',
      '1990-01-02',
      '08:30:00',
      true,
      false,
      'female',
      INPUT_HASH,
    ]);
    expect(createCall?.text).not.toContain('cmd_create_birth_profile_v1(');
    expect(pool.connection.calls.some((call) => call.text === 'SET LOCAL ROLE myeongha_api_executor')).toBe(true);
    expect(pool.connection.calls.some((call) => call.text === 'COMMIT')).toBe(true);
    expect(pool.connection.released).toBe(true);
    expect(JSON.stringify(body)).not.toContain('inputHash');
    expect(JSON.stringify(body)).not.toContain('input_hash');
  });

  it('returns 401 without opening PostgreSQL when request identity is absent', async () => {
    const { input, verifier, pool } = makeInput();
    verifier.evidence = null;

    const response = await handleBirthProfileCreateRequestV1(input);
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'AUTH_REQUIRED', retryable: false },
    });
    expect(pool.connectCalls).toBe(0);
  });

  it('rejects malformed JSON before opening PostgreSQL', async () => {
    const { input, pool } = makeInput({
      request: new Request('https://myeongha.vercel.app/api/birth-profiles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
    });

    const response = await handleBirthProfileCreateRequestV1(input);
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(pool.connectCalls).toBe(0);
  });

  it('rejects client subject authority and rolls the transaction back', async () => {
    const { input, pool } = makeInput({
      request: jsonRequest({
        ...validRequestBody(),
        subject_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
    });

    const response = await handleBirthProfileCreateRequestV1(input);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });
    expect(
      pool.connection.calls.some((call) =>
        call.text.includes('cmd_create_birth_profile_runtime_v1'),
      ),
    ).toBe(false);
    expect(pool.connection.calls.some((call) => call.text === 'ROLLBACK')).toBe(true);
    expect(pool.connection.released).toBe(true);
  });

  it('maps the governed active-self conflict to the existing INVALID_REQUEST contract', async () => {
    const { input, pool } = makeInput();
    pool.connection.failCreateWithConstraint = 'cmd_birth_profile_create_active_self_exists';

    const response = await handleBirthProfileCreateRequestV1(input);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        messageKey: 'request.invalid',
        retryable: false,
      },
    });
    expect(pool.connection.calls.some((call) => call.text === 'ROLLBACK')).toBe(true);
  });

  it('returns 405/no-store without identity or DB work for unsupported methods', async () => {
    const { input, verifier, pool } = makeInput({
      request: jsonRequest(validRequestBody(), 'GET'),
    });

    const response = await handleBirthProfileCreateRequestV1(input);
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('');
    expect(verifier.calls).toBe(0);
    expect(pool.connectCalls).toBe(0);
  });

  it('returns 404/no-store for query-bearing or non-canonical route shapes', async () => {
    for (const url of [
      'https://myeongha.vercel.app/api/birth-profiles?subject_id=forbidden',
      'https://myeongha.vercel.app/api/birth-profiles/extra',
    ]) {
      const { input, verifier, pool } = makeInput({
        request: new Request(url, { method: 'POST', body: '{}' }),
      });
      const response = await handleBirthProfileCreateRequestV1(input);
      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(verifier.calls).toBe(0);
      expect(pool.connectCalls).toBe(0);
    }
  });
});
