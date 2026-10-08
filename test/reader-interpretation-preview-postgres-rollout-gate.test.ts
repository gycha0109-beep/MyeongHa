import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { ContentReleaseRuntime } from '../packages/world-content/src/index.js';
import type {
  ReaderInterpretationPreviewContextAuthorityPortV1,
  runReaderInterpretationPreviewHttpV1,
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
import {
  OFFICIAL_READER_RUNTIME_IDS_V1,
  ReaderRuntimeRolloutWithheldErrorV1,
} from '../apps/api/src/reader-production-rollout-policy-v1.js';

const httpPreviewStub = vi.hoisted(() => vi.fn());

vi.mock('../apps/api/src/reader-interpretation-preview-http.js', () => ({
  runReaderInterpretationPreviewHttpV1: httpPreviewStub,
}));

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const THREAD_ID = '33333333-3333-4333-8333-333333333333';
const READING_ID = '44444444-4444-4444-8444-444444444444';

function approvedInternalPreviewEnv() {
  return {
    [PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.mode]: 'internal_preview',
    [PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.policyVersion]:
      'reader-internal-preview-v1',
    [PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.allowedSubjectHashes]:
      createHash('sha256').update(SUBJECT_ID, 'utf8').digest('hex'),
    [PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.hostedCanaryRunId]:
      READER_INTERPRETATION_HOSTED_CANARY_EVIDENCE_V1.runId,
    [PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.expectedSajuSha]:
      READER_INTERPRETATION_HOSTED_CANARY_EVIDENCE_V1.sajuSha,
    [PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.expectedMyeonghaSha]:
      READER_INTERPRETATION_HOSTED_CANARY_EVIDENCE_V1.myeonghaSha,
  };
}

function transactionFixture(): {
  pool: PostgresSubjectPoolV1;
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('begin_member_subject_context_v1')) {
      return {
        rows: [{ subjectId: SUBJECT_ID, subjectKind: 'member' }],
      };
    }
    return { rows: [] };
  });
  const release = vi.fn();
  const connection = { query, release } as unknown as PostgresSubjectConnectionV1;
  return { pool: { connect: vi.fn(async () => connection) }, query, release };
}

describe('Reader Interpretation PostgreSQL execution first tranche', () => {
  it('passes a server-only Se-yeon admission hook to the authorized Preview path', async () => {
    const database = transactionFixture();
    const resolveContext = vi.fn();
    const createContextAuthorityPort = vi.fn(
      (): ReaderInterpretationPreviewContextAuthorityPortV1 => ({ resolveContext }),
    );
    const groundingProjectionPort = { projectGrounding: vi.fn() };
    httpPreviewStub.mockImplementation(async (
      request: Parameters<typeof runReaderInterpretationPreviewHttpV1>[0],
    ) => {
      expect(request.resolvedSubjectId).toBe(SUBJECT_ID);
      expect(request.body).toEqual({
        threadId: THREAD_ID,
        officialReadingId: READING_ID,
      });
      // The HTTP runtime obtains this identity from the resolved Thread and
      // Official Reading, not from request.body or a browser selector.
      const admit = request.admitServerReader;
      expect(admit).toBeTypeOf('function');
      if (!admit) throw new Error('Missing first tranche admission');

      expect(() => admit('seyeon')).not.toThrow();
      for (const reader of OFFICIAL_READER_RUNTIME_IDS_V1) {
        if (reader === 'seyeon') continue;
        expect(() => admit(reader)).toThrow(ReaderRuntimeRolloutWithheldErrorV1);
      }
      expect(() => admit('unknown-reader')).toThrow(ReaderRuntimeRolloutWithheldErrorV1);

      return {
        schemaVersion: 'myeongha-reader-interpretation-preview-http-v1',
        lifecycle: 'preview',
        mode: 'protected_fallback',
        officialReadingId: READING_ID,
        readerCharacterId: 'seyeon',
        domain: 'general_natal',
        interpretationHash: 'synthetic-preview-only',
        fallbackReason: 'renderer_protected_fallback',
      };
    });

    const result = await executeReaderInterpretationPreviewPostgresV1({
      pool: database.pool,
      verifiedEvidence: { kind: 'member', verifiedAuthUserId: USER_ID },
      effectiveAt: '2026-09-22T00:00:00.000Z',
      body: { threadId: THREAD_ID, officialReadingId: READING_ID },
      activationEnv: approvedInternalPreviewEnv(),
      contentReleaseRuntime: {} as ContentReleaseRuntime,
      createContextAuthorityPort,
      groundingProjectionPort,
    });

    expect(result.lifecycle).toBe('preview');
    expect(result.readerCharacterId).toBe('seyeon');
    expect(httpPreviewStub).toHaveBeenCalledTimes(1);
    expect(database.query).toHaveBeenCalledWith('BEGIN');
    expect(database.query).toHaveBeenCalledWith('COMMIT');
    expect(database.release).toHaveBeenCalledTimes(1);
    // The mocked HTTP boundary does not execute the real guarded source read.
    expect(resolveContext).not.toHaveBeenCalled();
    expect(groundingProjectionPort.projectGrounding).not.toHaveBeenCalled();
  });
});
