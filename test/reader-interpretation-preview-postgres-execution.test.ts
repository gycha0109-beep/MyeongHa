import { describe, expect, it, vi } from 'vitest';
import type { ContentReleaseRuntime } from '../packages/world-content/src/index.js';
import {
  ReaderInterpretationPreviewHttpErrorV1,
  type ReaderInterpretationPreviewContextAuthorityPortV1,
} from '../apps/api/src/reader-interpretation-preview-http.js';
import {
  executeReaderInterpretationPreviewPostgresV1,
} from '../apps/api/src/reader-interpretation-preview-postgres-execution.js';
import type {
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';

function subjectPool(): {
  readonly pool: PostgresSubjectPoolV1;
  readonly query: ReturnType<typeof vi.fn>;
  readonly release: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('begin_member_subject_context_v1')) {
      return {
        rows: [{
          subjectId: '11111111-1111-4111-8111-111111111111',
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
      contentReleaseRuntime: {} as ContentReleaseRuntime,
      createContextAuthorityPort,
      groundingProjectionPort: { projectGrounding: vi.fn() },
    })).rejects.toMatchObject({
      name: 'ReaderInterpretationPreviewHttpErrorV1',
      code: 'INVALID_REQUEST',
    } satisfies Partial<ReaderInterpretationPreviewHttpErrorV1>);

    expect(database.query).toHaveBeenCalledWith('BEGIN');
    expect(database.query).toHaveBeenCalledWith('SET LOCAL ROLE myeongha_api_executor');
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('begin_member_subject_context_v1'),
      ['22222222-2222-4222-8222-222222222222'],
    );
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('assert_myeongha_subject_context_v1'),
      ['11111111-1111-4111-8111-111111111111'],
    );
    expect(database.query).toHaveBeenCalledWith('ROLLBACK');
    expect(database.release).toHaveBeenCalledTimes(1);
    expect(createContextAuthorityPort).toHaveBeenCalledTimes(1);
    expect(contextAuthorityPort.resolveContext).not.toHaveBeenCalled();
  });
});
