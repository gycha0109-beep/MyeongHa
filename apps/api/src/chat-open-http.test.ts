import { describe, expect, it, vi } from 'vitest';
import { handleChatOpenRequestV1 } from './chat-open-http.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import type {
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

const AUTH_USER_ID = '11111111-1111-4111-8111-111111111111';
const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
const THREAD_ID = '33333333-3333-4333-8333-333333333333';
const THREAD_CHARACTER_ID = '44444444-4444-4444-8444-444444444444';
const RELEASE_ID = '55555555-5555-4555-8555-555555555555';
const BUNDLE_ID = '66666666-6666-4666-8666-666666666666';
const CANDIDATE_THREAD_ID = '77777777-7777-4777-8777-777777777777';
const CANDIDATE_THREAD_CHARACTER_ID = '88888888-8888-4888-8888-888888888888';
const SECOND_CANDIDATE_THREAD_ID = '99999999-9999-4999-8999-999999999999';
const SECOND_CANDIDATE_THREAD_CHARACTER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CHARACTER_ID = 'seyeon';

function post(body: unknown, authorization = 'Bearer member-secret'): Request {
  return new Request('https://myeongha.internal/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorization,
    },
    body: JSON.stringify(body),
  });
}

function verifier(
  evidence: VerifiedSubjectIdentityEvidenceV1 | null,
): IdentityEvidenceVerificationPortV1 {
  return { verifyRequestIdentity: vi.fn(async () => evidence) };
}

type FakePoolOptions = Readonly<{
  commandCreated?: boolean;
  commandThreadId?: string;
  commandErrorConstraint?: string;
  onCommand?: (values: readonly unknown[]) => void;
}>;

function fakePool(options: FakePoolOptions = {}): PostgresSubjectPoolV1 {
  return {
    async connect(): Promise<PostgresSubjectConnectionV1> {
      return {
        async query<Row = Record<string, unknown>>(
          text: string,
          values?: readonly unknown[],
        ): Promise<{ rows: readonly Row[] }> {
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
          if (text.includes('cmd_open_member_single_character_thread_v1')) {
            options.onCommand?.(values ?? []);
            if (options.commandErrorConstraint !== undefined) {
              throw Object.assign(new Error('private database detail'), {
                constraint: options.commandErrorConstraint,
              });
            }
            return {
              rows: [{
                threadId: options.commandThreadId ?? THREAD_ID,
                threadCharacterId: THREAD_CHARACTER_ID,
                created: options.commandCreated ?? true,
                activeContentReleaseId: RELEASE_ID,
                activeContentBundleId: BUNDLE_ID,
                characterId: CHARACTER_ID,
              } as Row],
            };
          }
          throw new Error(`Unexpected SQL in chat-open test: ${text}`);
        },
        release: vi.fn(),
      };
    },
  };
}

function uuidFactory(values = [CANDIDATE_THREAD_ID, CANDIDATE_THREAD_CHARACTER_ID]): () => string {
  let index = 0;
  return () => {
    const value = values[index++];
    if (value === undefined) throw new Error('Test UUID factory exhausted.');
    return value;
  };
}

async function invoke(input: {
  request?: Request;
  evidence?: VerifiedSubjectIdentityEvidenceV1 | null;
  pool?: PostgresSubjectPoolV1;
  createUuid?: () => string;
} = {}): Promise<Response> {
  return handleChatOpenRequestV1({
    request: input.request ?? post({ characterId: CHARACTER_ID }),
    requestId: 'req-chat-open',
    serverTime: '2026-09-06T15:00:00.000Z',
    identityEvidenceVerifier: verifier(
      input.evidence === undefined
        ? { kind: 'member', verifiedAuthUserId: AUTH_USER_ID }
        : input.evidence,
    ),
    pool: input.pool ?? fakePool(),
    createUuid: input.createUuid ?? uuidFactory(),
  });
}

describe('Member single-Character thread open HTTP adapter', () => {
  it('requires verified identity before body parsing or PostgreSQL', async () => {
    const connect = vi.fn(async () => { throw new Error('must not connect'); });
    const response = await invoke({
      request: post({ characterId: CHARACTER_ID }, 'Bearer reflected-secret'),
      evidence: null,
      pool: { connect },
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload.error.code).toBe('AUTH_REQUIRED');
    expect(JSON.stringify(payload)).not.toContain('reflected-secret');
    expect(connect).not.toHaveBeenCalled();
  });

  it('rejects malformed and authority-injecting bodies fail-closed', async () => {
    for (const body of [
      {},
      { characterId: '   ' },
      { presentationKey: CHARACTER_ID },
      { characterId: CHARACTER_ID, subjectId: SUBJECT_ID },
      { characterId: CHARACTER_ID, releaseId: RELEASE_ID },
      { characterId: CHARACTER_ID, bundleId: BUNDLE_ID },
    ]) {
      const connect = vi.fn(async () => { throw new Error('must not connect'); });
      const response = await invoke({ request: post(body), pool: { connect } });
      expect(response.status).toBe(400);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(connect).not.toHaveBeenCalled();
    }
  });

  it('binds the canonical Member subject and server UUID candidates to the governed command', async () => {
    const onCommand = vi.fn((values: readonly unknown[]) => {
      expect(values).toEqual([
        SUBJECT_ID,
        CHARACTER_ID,
        CANDIDATE_THREAD_ID,
        CANDIDATE_THREAD_CHARACTER_ID,
      ]);
    });
    const response = await invoke({ pool: fakePool({ onCommand }) });
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload.data).toEqual({ threadId: THREAD_ID, characterId: CHARACTER_ID, created: true });
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(payload)).not.toContain(SUBJECT_ID);
    expect(JSON.stringify(payload)).not.toContain(RELEASE_ID);
    expect(JSON.stringify(payload)).not.toContain(BUNDLE_ID);
  });

  it('rejects Guest identity without executing the Member command', async () => {
    const onCommand = vi.fn();
    const response = await invoke({
      evidence: { kind: 'guest', verifiedGuestTokenHash: 'verified-guest-hash' },
      pool: fakePool({ onCommand }),
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe('FORBIDDEN');
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('returns an existing logical thread on reuse', async () => {
    const response = await invoke({ pool: fakePool({ commandCreated: false }) });
    const payload = await response.json() as any;
    expect(payload.data).toEqual({ threadId: THREAD_ID, characterId: CHARACTER_ID, created: false });
  });

  it('allows concurrent retry candidates to converge to the DB-authoritative thread', async () => {
    const createUuid = uuidFactory([
      CANDIDATE_THREAD_ID,
      CANDIDATE_THREAD_CHARACTER_ID,
      SECOND_CANDIDATE_THREAD_ID,
      SECOND_CANDIDATE_THREAD_CHARACTER_ID,
    ]);
    const pool = fakePool({ commandCreated: false });
    const [first, second] = await Promise.all([
      invoke({ pool, createUuid }),
      invoke({ pool, createUuid }),
    ]);
    const firstPayload = await first.json() as any;
    const secondPayload = await second.json() as any;
    expect(firstPayload.data.threadId).toBe(THREAD_ID);
    expect(secondPayload.data.threadId).toBe(THREAD_ID);
  });

  it('maps Character unavailability and absent active content without leaking DB detail', async () => {
    const unavailable = await invoke({
      pool: fakePool({ commandErrorConstraint: 'member_character_thread_character_published' }),
    });
    const unavailablePayload = await unavailable.json() as any;
    expect(unavailable.status).toBe(404);
    expect(unavailablePayload.error.code).toBe('NOT_FOUND');
    expect(JSON.stringify(unavailablePayload)).not.toContain('private database detail');

    const noContent = await invoke({
      pool: fakePool({ commandErrorConstraint: 'member_character_thread_active_default_required' }),
    });
    const noContentPayload = await noContent.json() as any;
    expect(noContent.status).toBe(503);
    expect(noContentPayload.error.code).toBe('CAPABILITY_UNAVAILABLE');
    expect(noContentPayload.error.retryable).toBe(true);
  });

  it('never performs direct Chat INSERT', async () => {
    const queriedSql: string[] = [];
    const base = fakePool();
    const pool: PostgresSubjectPoolV1 = {
      async connect() {
        const connection = await base.connect();
        return {
          ...connection,
          async query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]) {
            queriedSql.push(text);
            return connection.query<Row>(text, values);
          },
        };
      },
    };
    const response = await invoke({ pool });
    expect(response.status).toBe(200);
    expect(queriedSql.some((sql) => /insert\s+into\s+public\.(conversation_threads|conversation_thread_characters)/iu.test(sql))).toBe(false);
    expect(queriedSql.some((sql) => sql.includes('cmd_open_member_single_character_thread_v1'))).toBe(true);
  });
});
