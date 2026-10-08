import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentReleaseRuntime } from '../packages/world-content/src/index.js';
import type { SajuProductionCalculationHttpRequestInitV1 } from '../apps/api/src/saju-production-calculation-http-adapter.js';
import {
  executeProductionReaderInterpretationPreviewPostgresV1,
} from '../apps/api/src/reader-interpretation-preview-production-saju-postgres.js';
import type {
  ReaderInterpretationPreviewContextAuthorityPortV1,
  runReaderInterpretationPreviewHttpV1,
} from '../apps/api/src/reader-interpretation-preview-http.js';
import type {
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';
import {
  PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1,
  READER_INTERPRETATION_HOSTED_CANARY_EVIDENCE_V1,
} from '../apps/api/src/production-reader-interpretation-activation.js';
import {
  SAJU_CHARACTER_GROUNDING_ADMISSION_HEADER_V1,
  SAJU_CHARACTER_GROUNDING_ADMISSION_VERSION_V1,
} from '../apps/api/src/saju-character-grounding-http-adapter.js';

const httpStub = vi.hoisted(() => vi.fn());
vi.mock('../apps/api/src/reader-interpretation-preview-http.js', () => ({
  runReaderInterpretationPreviewHttpV1: httpStub,
}));

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const THREAD_ID = '33333333-3333-4333-8333-333333333333';
const READING_ID = '44444444-4444-4444-8444-444444444444';
const READING_SNAPSHOT = Object.freeze({
  responseVersion: 'myeonghwa-product-reading-response-v2',
  state: 'delivered',
  reading: Object.freeze({ readingId: READING_ID }),
});
const groundingInput = Object.freeze({
  readingId: READING_ID,
  readingContractVersion: 'myeonghwa-product-reading-response-v2',
  productResponseState: 'delivered',
  responseSnapshotJsonb: READING_SNAPSHOT,
  officialArtifactResponseHash: 'sha256:opaque-db-artifact',
  sajuEngineVersion: 'saju-engine-v1',
  sajuDomain: 'general' as const,
});

function approvedEnv(subjectId = SUBJECT_ID) {
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

function subjectPool() {
  const query = vi.fn(async (sql: string) => (
    sql.includes('begin_member_subject_context_v1')
      ? { rows: [{ subjectId: SUBJECT_ID, subjectKind: 'member' }] }
      : { rows: [] }
  ));
  const release = vi.fn();
  return {
    query,
    release,
    pool: {
      connect: vi.fn(async () => (
        { query, release } as unknown as PostgresSubjectConnectionV1
      )),
    } as PostgresSubjectPoolV1,
  };
}

function requestInput(database: ReturnType<typeof subjectPool>) {
  return {
    pool: database.pool,
    verifiedEvidence: {
      kind: 'member' as const,
      verifiedAuthUserId: USER_ID,
    },
    effectiveAt: '2026-09-22T00:00:00.000Z',
    body: { threadId: THREAD_ID, officialReadingId: READING_ID },
    contentReleaseRuntime: {} as ContentReleaseRuntime,
    createContextAuthorityPort: vi.fn(
      (): ReaderInterpretationPreviewContextAuthorityPortV1 => ({
        resolveContext: vi.fn(),
      }),
    ),
  };
}

beforeEach(() => {
  httpStub.mockReset();
});

describe('Production Saju composition for PostgreSQL Reader Preview (not public)', () => {
  it('does not initialize the Saju transport before OFF admission', async () => {
    const database = subjectPool();
    const fetchImpl = vi.fn();
    const request = requestInput(database);

    await expect(executeProductionReaderInterpretationPreviewPostgresV1({
      ...request,
      activationEnv: {},
      sajuRuntimeEnv: {},
      sajuHttpFetchImpl: fetchImpl,
    })).rejects.toMatchObject({ code: 'ACTIVATION_DISABLED' });

    expect(httpStub).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(request.createContextAuthorityPort).not.toHaveBeenCalled();
    expect(database.query).toHaveBeenCalledWith('ROLLBACK');
    expect(database.release).toHaveBeenCalledOnce();
  });

  it('rejects out-of-cohort subjects without creating an upstream Saju request', async () => {
    const database = subjectPool();
    const fetchImpl = vi.fn();
    await expect(executeProductionReaderInterpretationPreviewPostgresV1({
      ...requestInput(database),
      activationEnv: approvedEnv(USER_ID),
      sajuRuntimeEnv: {},
      sajuHttpFetchImpl: fetchImpl,
    })).rejects.toMatchObject({ code: 'SUBJECT_NOT_ALLOWED' });
    expect(httpStub).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(database.release).toHaveBeenCalledOnce();
  });

  it('supplies a real Saju HTTP adapter only to an admitted server Reader execution seam', async () => {
    const database = subjectPool();
    const candidate = {
      schemaVersion: SAJU_CHARACTER_GROUNDING_ADMISSION_VERSION_V1,
      groundingProjectionVersion: 'myeonghwa-character-grounding-projection-v1',
      axisRegistryVersion: 'myeonghwa-grounding-axis-v1',
      readingRef: READING_ID,
      productResponseVersion: groundingInput.readingContractVersion,
      engineVersion: groundingInput.sajuEngineVersion,
      readingDomain: groundingInput.sajuDomain,
      sourceResponseHash: 'a'.repeat(64),
      groundingHash: 'b'.repeat(64),
      units: [],
      disclosures: [],
      ambiguities: [],
    };
    const fetchImpl = vi.fn(async (_url: string, _init: SajuProductionCalculationHttpRequestInitV1) => ({
      status: 200,
      headers: new Headers({
        'content-type': 'application/json',
        [SAJU_CHARACTER_GROUNDING_ADMISSION_HEADER_V1]:
          SAJU_CHARACTER_GROUNDING_ADMISSION_VERSION_V1,
      }),
      body: null,
      text: async () => JSON.stringify(candidate),
    }));
    httpStub.mockImplementation(async (
      httpInput: Parameters<typeof runReaderInterpretationPreviewHttpV1>[0],
    ) => {
      expect(httpInput.resolvedSubjectId).toBe(SUBJECT_ID);
      expect(httpInput.body).toEqual({ threadId: THREAD_ID, officialReadingId: READING_ID });
      expect(httpInput.admitServerReader).toBeTypeOf('function');
      expect(() => httpInput.admitServerReader?.('seyeon')).not.toThrow();
      expect(() => httpInput.admitServerReader?.('baekheon')).toThrow();
      const projected = await httpInput.groundingProjectionPort.projectGrounding(groundingInput);
      expect(projected).toEqual(candidate);
      return {
        schemaVersion: 'myeongha-reader-interpretation-preview-http-v1',
        lifecycle: 'preview',
        mode: 'protected_fallback',
        officialReadingId: READING_ID,
        readerCharacterId: 'seyeon',
        domain: 'general',
        interpretationHash: 'synthetic-only',
        fallbackReason: 'renderer_protected_fallback',
      };
    });

    const result = await executeProductionReaderInterpretationPreviewPostgresV1({
      ...requestInput(database),
      activationEnv: approvedEnv(),
      sajuRuntimeEnv: {
        MYEONGHA_SAJU_SERVICE_ORIGIN: 'https://saju.example',
        MYEONGHA_SAJU_SERVICE_BEARER: 'server-test-only-bearer',
      },
      sajuHttpFetchImpl: fetchImpl,
    });

    expect(result.lifecycle).toBe('preview');
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://saju.example/api/character-grounding');
    const wire = fetchImpl.mock.calls[0]![1];
    expect(wire.headers.authorization).toBe('Bearer server-test-only-bearer');
    expect(JSON.parse(wire.body)).toEqual({
      response: READING_SNAPSHOT,
      engineVersion: 'saju-engine-v1',
      readingDomain: 'general',
    });
    expect(wire.body).not.toContain(SUBJECT_ID);
    expect(wire.body).not.toContain('seyeon');
    expect(database.query).toHaveBeenCalledWith('COMMIT');
    expect(database.release).toHaveBeenCalledOnce();
  });
});
