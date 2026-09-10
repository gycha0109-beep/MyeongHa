import { describe, expect, it, vi } from 'vitest';
import { handleReadingCreateRequestV1 } from './reading-create-http.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import type {
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

const AUTH_USER_ID = '11111111-1111-4111-8111-111111111111';
const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
const SOURCE_PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const SOURCE_REVISION_ID = '44444444-4444-4444-8444-444444444444';
const READING_SESSION_ID = '55555555-5555-4555-8555-555555555555';
const READING_ID = '66666666-6666-4666-8666-666666666666';
const IDEMPOTENCY_KEY = 'reading-create-http-1';
const DOMAIN_CAPABILITY_VERSION = 'saju-domain-v1';

function post(
  body: unknown,
  authorization = 'Bearer member-secret',
): Request {
  return new Request('https://myeongha.internal/api/readings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorization,
    },
    body: JSON.stringify(body),
  });
}

function rawPost(body: string): Request {
  return new Request('https://myeongha.internal/api/readings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer member-secret',
    },
    body,
  });
}

function verifier(
  evidence: VerifiedSubjectIdentityEvidenceV1 | null,
): IdentityEvidenceVerificationPortV1 {
  return { verifyRequestIdentity: vi.fn(async () => evidence) };
}

type FakePoolOptions = Readonly<{
  commandErrorConstraint?: string;
  replayed?: boolean;
  onCommand?: (values: readonly unknown[]) => void;
  queriedSql?: string[];
}>;

function fakePool(options: FakePoolOptions = {}): PostgresSubjectPoolV1 {
  return {
    async connect(): Promise<PostgresSubjectConnectionV1> {
      return {
        async query<Row = Record<string, unknown>>(
          text: string,
          values?: readonly unknown[],
        ): Promise<{ rows: readonly Row[] }> {
          options.queriedSql?.push(text);
          if (
            text === 'BEGIN' ||
            text.startsWith('SET LOCAL ROLE') ||
            text === 'COMMIT' ||
            text === 'ROLLBACK' ||
            text.includes('assert_myeongha_subject_context_v1')
          ) {
            return { rows: [] };
          }
          if (text.includes('begin_member_subject_context_v1')) {
            return { rows: [{ subjectId: SUBJECT_ID, subjectKind: 'member' } as Row] };
          }
          if (text.includes('begin_guest_subject_context_v1')) {
            return { rows: [{ subjectId: SUBJECT_ID, subjectKind: 'guest' } as Row] };
          }
          if (text.includes('cmd_create_reading_session_runtime_v1')) {
            options.onCommand?.(values ?? []);
            if (options.commandErrorConstraint !== undefined) {
              throw Object.assign(new Error('private database detail'), {
                constraint: options.commandErrorConstraint,
              });
            }
            return {
              rows: [{
                readingSessionId: READING_SESSION_ID,
                readingId: READING_ID,
                attemptNo: 1,
                sourceBirthRevisionId: SOURCE_REVISION_ID,
                targetBirthRevisionId: null,
                domainCapabilityVersion: DOMAIN_CAPABILITY_VERSION,
                replayed: options.replayed ?? false,
              } as Row],
            };
          }
          throw new Error(`Unexpected SQL in Reading create HTTP test: ${text}`);
        },
        release: vi.fn(),
      };
    },
  };
}

function ids() {
  return {
    nextReadingSessionId: vi.fn(async () => READING_SESSION_ID),
    nextReadingId: vi.fn(async () => READING_ID),
  };
}

async function invoke(input: {
  request?: Request;
  evidence?: VerifiedSubjectIdentityEvidenceV1 | null;
  pool?: PostgresSubjectPoolV1;
} = {}): Promise<Response> {
  return handleReadingCreateRequestV1({
    request: input.request ?? post({
      idempotencyKey: IDEMPOTENCY_KEY,
      domain: 'general',
      sourceBirthProfileId: SOURCE_PROFILE_ID,
    }),
    requestId: 'req-reading-create',
    serverTime: '2026-09-10T03:00:00.000Z',
    identityEvidenceVerifier: verifier(
      input.evidence === undefined
        ? { kind: 'member', verifiedAuthUserId: AUTH_USER_ID }
        : input.evidence,
    ),
    pool: input.pool ?? fakePool(),
    idPort: ids(),
  });
}

describe('Reading create HTTP adapter', () => {
  it('requires verified identity before parsing the body or connecting PostgreSQL', async () => {
    const connect = vi.fn(async () => { throw new Error('must not connect'); });
    const response = await invoke({
      request: rawPost('{not-json'),
      evidence: null,
      pool: { connect },
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload.error.code).toBe('AUTH_REQUIRED');
    expect(connect).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON without touching PostgreSQL', async () => {
    const connect = vi.fn(async () => { throw new Error('must not connect'); });
    const response = await invoke({
      request: rawPost('{not-json'),
      pool: { connect },
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('INVALID_REQUEST');
    expect(connect).not.toHaveBeenCalled();
  });

  it('binds canonical Subject and server-owned ids to the governed pending create command', async () => {
    const onCommand = vi.fn((values: readonly unknown[]) => {
      expect(values[0]).toBe(SUBJECT_ID);
      expect(values[1]).toBe(READING_SESSION_ID);
      expect(values[2]).toBe(READING_ID);
      expect(values[3]).toBe(IDEMPOTENCY_KEY);
      expect(values[4]).toMatch(/^sha256:v1:[0-9a-f]{64}$/u);
      expect(values[5]).toBe('reading-request-v1');
      expect(JSON.parse(values[6] as string)).toEqual({
        idempotencyKey: IDEMPOTENCY_KEY,
        domain: 'general',
        sourceBirthProfileId: SOURCE_PROFILE_ID,
      });
      expect(values[7]).toBe('general');
      expect(values[8]).toBe(SOURCE_PROFILE_ID);
      expect(values.slice(9)).toEqual([null, null, null, null, null]);
    });

    const response = await invoke({ pool: fakePool({ onCommand }) });
    const payload = await response.json() as any;

    expect(response.status).toBe(202);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload.data).toEqual({
      readingSessionId: READING_SESSION_ID,
      readingId: READING_ID,
      attemptNo: 1,
      sourceBirthRevisionId: SOURCE_REVISION_ID,
      domainCapabilityVersion: DOMAIN_CAPABILITY_VERSION,
    });
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(payload)).not.toContain(SUBJECT_ID);
    expect(JSON.stringify(payload)).not.toContain('requestHash');
    expect(JSON.stringify(payload)).not.toContain('requestSnapshot');
    expect(JSON.stringify(payload)).not.toContain('responseSnapshot');
    expect(JSON.stringify(payload)).not.toContain('provider');
  });

  it('rejects client authority injection and unsupported coupled Reading shapes', async () => {
    for (const testCase of [
      {
        body: {
          idempotencyKey: IDEMPOTENCY_KEY,
          domain: 'general',
          sourceBirthProfileId: SOURCE_PROFILE_ID,
          subjectId: SUBJECT_ID,
        },
        status: 400,
        code: 'INVALID_REQUEST',
      },
      {
        body: {
          idempotencyKey: IDEMPOTENCY_KEY,
          domain: 'compatibility',
          sourceBirthProfileId: SOURCE_PROFILE_ID,
        },
        status: 409,
        code: 'CAPABILITY_UNAVAILABLE',
      },
      {
        body: {
          idempotencyKey: IDEMPOTENCY_KEY,
          domain: 'general',
          sourceBirthProfileId: SOURCE_PROFILE_ID,
          characterId: 'seyeon',
        },
        status: 409,
        code: 'CAPABILITY_UNAVAILABLE',
      },
    ]) {
      const onCommand = vi.fn();
      const response = await invoke({
        request: post(testCase.body),
        pool: fakePool({ onCommand }),
      });
      const payload = await response.json() as any;
      expect(response.status).toBe(testCase.status);
      expect(payload.error.code).toBe(testCase.code);
      expect(onCommand).not.toHaveBeenCalled();
    }
  });

  it('maps idempotency conflict without leaking PostgreSQL detail', async () => {
    const response = await invoke({
      pool: fakePool({ commandErrorConstraint: 'cmd_reading_create_idempotency_conflict' }),
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(payload.error.retryable).toBe(false);
    expect(JSON.stringify(payload)).not.toContain('private database detail');
  });

  it('uses only the governed create wrapper and never performs direct Reading INSERT', async () => {
    const queriedSql: string[] = [];
    const response = await invoke({ pool: fakePool({ queriedSql }) });

    expect(response.status).toBe(202);
    expect(queriedSql.some((sql) => /insert\s+into\s+public\.(readings|reading_sessions)/iu.test(sql))).toBe(false);
    expect(queriedSql.some((sql) => sql.includes('cmd_create_reading_session_runtime_v1'))).toBe(true);
  });
});
