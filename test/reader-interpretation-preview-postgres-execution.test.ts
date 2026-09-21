import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { ContentReleaseRuntime } from '../packages/world-content/src/index.js';
import type {
  ReaderInterpretationPreviewContextAuthorityPortV1,
} from '../apps/api/src/reader-interpretation-preview-http.js';
import {
  executeReaderInterpretationPreviewPostgresV1,
} from '../apps/api/src/reader-interpretation-preview-postgres-execution.js';
import type {
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';
import {
  PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1,
  READER_INTERPRETATION_HOSTED_CANARY_EVIDENCE_V1,
} from '../apps/api/src/production-reader-interpretation-activation.js';

const CANONICAL_SUBJECT_ID = '11111111-1111-4111-8111-111111111111';

function enabledActivationEnv(subjectId = CANONICAL_SUBJECT_ID) {
  return {
    [PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.mode]: 'internal_preview',
    [PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.policyVersion]:
      'reader-internal-preview-v1',
    [PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.allowedSubjectHashes]:
      createHash('sha256').update(subjectId, 'utf8').digest('hex'),
    [PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.hostedCanaryRunId]:
      READER_INTERPRETATION_HOSTED_CANARY_EVIDENCE_V1.runId,
    [PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.expectedSajuSha]:
      READER_INTERPRETATION_HOSTED_CANARY_EVIDENCE_V1.sajuSha,
    [PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.expectedMyeonghaSha]:
      READER_INTERPRETATION_HOSTED_CANARY_EVIDENCE_V1.myeonghaSha,
  };
}

function subjectPool(): {
  readonly pool: PostgresSubjectPoolV1;
  readonly query: ReturnType<typeof vi.fn>;
  readonly release: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('begin_member_subject_context_v1')) {
      return {
        rows: [{
          subjectId: CANONICAL_SUBJECT_ID,
          subjectKind: 'member',
        }],
      };
    }
    return { rows: [] };
  });
  const release = vi.fn();
  const connection = {
    query,
    release,
  } as unknown as PostgresSubjectConnectionV1;
  return {
    pool: {
      connect: vi.fn(async () => connection),
    },
    query,
    release,
  };
}

describe('Reader Interpretation Preview PostgreSQL execution', () => {
  it('binds canonical subject transaction before rejecting forged client authority', async () => {
    const database = subjectPool();
    const contextAuthorityPort: ReaderInterpretationPreviewContextAuthorityPortV1 = {
      resolveContext: vi.fn(),
    };
    const createContextAuthorityPort = vi.fn(() => contextAuthorityPort);

    await expect(executeReaderInterpretationPreviewPostgresV1({
      pool: database.pool,
      verifiedEvidence: {
        kind: 'member',
        verifiedAuthUserId: '22222222-2222-4222-8222-222222222222',
      },
      effectiveAt: '2026-09-22T00:00:00.000Z',
      body: {
        threadId: '33333333-3333-4333-8333-333333333333',
        officialReadingId: '44444444-4444-4444-8444-444444444444',
        readerCharacterId: 'baekheon',
      },
      activationEnv: enabledActivationEnv(),
      contentReleaseRuntime: {} as ContentReleaseRuntime,
      createContextAuthorityPort,
      groundingProjectionPort: { projectGrounding: vi.fn() },
    })).rejects.toMatchObject({
      name: 'ReaderInterpretationPreviewHttpErrorV1',
      code: 'INVALID_REQUEST',
    });

    expect(database.query).toHaveBeenCalledWith('BEGIN');
    expect(database.query).toHaveBeenCalledWith('SET LOCAL ROLE myeongha_api_executor');
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('begin_member_subject_context_v1'),
      ['22222222-2222-4222-8222-222222222222'],
    );
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('assert_myeongha_subject_context_v1'),
      [CANONICAL_SUBJECT_ID],
    );
    expect(database.query).toHaveBeenCalledWith('ROLLBACK');
    expect(database.release).toHaveBeenCalledTimes(1);
    expect(createContextAuthorityPort).toHaveBeenCalledTimes(1);
    expect(contextAuthorityPort.resolveContext).not.toHaveBeenCalled();
  });

  it('stops disabled Production Reader composition immediately after canonical subject resolution', async () => {
    const database = subjectPool();
    const contextAuthorityPort: ReaderInterpretationPreviewContextAuthorityPortV1 = {
      resolveContext: vi.fn(),
    };
    const createContextAuthorityPort = vi.fn(() => contextAuthorityPort);
    const groundingProjectionPort = { projectGrounding: vi.fn() };

    await expect(executeReaderInterpretationPreviewPostgresV1({
      pool: database.pool,
      verifiedEvidence: {
        kind: 'member',
        verifiedAuthUserId: '22222222-2222-4222-8222-222222222222',
      },
      effectiveAt: '2026-09-22T00:00:00.000Z',
      body: {
        threadId: '33333333-3333-4333-8333-333333333333',
        officialReadingId: '44444444-4444-4444-8444-444444444444',
      },
      activationEnv: {},
      contentReleaseRuntime: {} as ContentReleaseRuntime,
      createContextAuthorityPort,
      groundingProjectionPort,
    })).rejects.toMatchObject({ code: 'ACTIVATION_DISABLED' });

    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('assert_myeongha_subject_context_v1'),
      [CANONICAL_SUBJECT_ID],
    );
    expect(database.query).toHaveBeenCalledTimes(5);
    expect(createContextAuthorityPort).not.toHaveBeenCalled();
    expect(contextAuthorityPort.resolveContext).not.toHaveBeenCalled();
    expect(groundingProjectionPort.projectGrounding).not.toHaveBeenCalled();
  });

  it('hashes the canonical subjects.id rather than verified auth identity for cohort admission', async () => {
    const database = subjectPool();
    const createContextAuthorityPort = vi.fn(() => ({
      resolveContext: vi.fn(),
    }));
    const groundingProjectionPort = { projectGrounding: vi.fn() };

    await expect(executeReaderInterpretationPreviewPostgresV1({
      pool: database.pool,
      verifiedEvidence: {
        kind: 'member',
        verifiedAuthUserId: '22222222-2222-4222-8222-222222222222',
      },
      effectiveAt: '2026-09-22T00:00:00.000Z',
      body: {
        threadId: '33333333-3333-4333-8333-333333333333',
        officialReadingId: '44444444-4444-4444-8444-444444444444',
      },
      activationEnv: enabledActivationEnv(
        '22222222-2222-4222-8222-222222222222',
      ),
      contentReleaseRuntime: {} as ContentReleaseRuntime,
      createContextAuthorityPort,
      groundingProjectionPort,
    })).rejects.toMatchObject({ code: 'SUBJECT_NOT_ALLOWED' });

    expect(database.query).toHaveBeenCalledTimes(5);
    expect(createContextAuthorityPort).not.toHaveBeenCalled();
    expect(groundingProjectionPort.projectGrounding).not.toHaveBeenCalled();
  });
});
