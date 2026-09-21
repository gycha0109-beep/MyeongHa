import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { ContentReleaseRuntime } from '../packages/world-content/src/index.js';

import {
  PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1,
  PRODUCTION_READER_INTERPRETATION_OFF_POLICY_VERSION_V1,
  READER_INTERPRETATION_HOSTED_CANARY_EVIDENCE_V1,
  ProductionReaderInterpretationActivationConfigErrorV1,
  hashReaderInterpretationActivationSubjectV1,
  parseProductionReaderInterpretationActivationConfigV1,
  runProductionReaderInterpretationPreviewHttpV1,
  summarizeProductionReaderInterpretationActivationConfigV1,
} from '../apps/api/src/production-reader-interpretation-activation.js';
import type {
  ReaderInterpretationPreviewContextAuthorityPortV1,
} from '../apps/api/src/reader-interpretation-preview-http.js';
import type {
  CharacterStandardReadingAccessAuthorityPortV1,
  CharacterStandardReadingArtifactAuthorityPortV1,
} from '../apps/api/src/character-standard-reading-knowledge.js';
import type {
  ChatThreadRuntimeBindingReadAuthorityPortV1,
} from '../apps/api/src/chat-thread-runtime-binding-read.js';
import type {
  CharacterRelationshipReadAuthorityPortV1,
} from '../apps/api/src/character-relationship-read.js';
import type {
  MemoryItemsReadAuthorityPortV1,
} from '../apps/api/src/memory-items-read.js';
import type {
  MemoryGrantsReadAuthorityPortV1,
} from '../apps/api/src/memory-grants-read.js';
import type {
  ReaderContextNonMemoryReadAuthorityPortV1,
} from '../apps/api/src/reader-context-non-memory-read.js';

const SUBJECT_ID = 'subject-internal-reader-preview-1';
const SUBJECT_HASH = createHash('sha256').update(SUBJECT_ID, 'utf8').digest('hex');

function enabledEnv(
  subjectHashes = SUBJECT_HASH,
): Record<string, string | undefined> {
  return {
    [PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.mode]:
      'internal_preview',
    [PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.policyVersion]:
      'reader-internal-preview-v1',
    [PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.allowedSubjectHashes]:
      subjectHashes,
    [PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.hostedCanaryRunId]:
      READER_INTERPRETATION_HOSTED_CANARY_EVIDENCE_V1.runId,
    [PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.expectedSajuSha]:
      READER_INTERPRETATION_HOSTED_CANARY_EVIDENCE_V1.sajuSha,
    [PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.expectedMyeonghaSha]:
      READER_INTERPRETATION_HOSTED_CANARY_EVIDENCE_V1.myeonghaSha,
  };
}

function blockedRuntimePorts() {
  return {
    contextAuthorityPort: {
      resolveContext: vi.fn(),
    } as ReaderInterpretationPreviewContextAuthorityPortV1,
    contentReleaseRuntime: {} as ContentReleaseRuntime,
    threadBindingAuthorityPort: {
      readRuntimeBinding: vi.fn(),
    } as unknown as ChatThreadRuntimeBindingReadAuthorityPortV1,
    accessAuthorityPort: {
      readAccessibleReadings: vi.fn(),
    } as unknown as CharacterStandardReadingAccessAuthorityPortV1,
    artifactAuthorityPort: {
      readArtifactSource: vi.fn(),
    } as unknown as CharacterStandardReadingArtifactAuthorityPortV1,
    relationshipAuthorityPort: {
      readCurrentRelationship: vi.fn(),
    } as unknown as CharacterRelationshipReadAuthorityPortV1,
    memoryItemsAuthorityPort: {
      readCurrentItems: vi.fn(),
    } as unknown as MemoryItemsReadAuthorityPortV1,
    memoryGrantsAuthorityPort: {
      readActiveGrants: vi.fn(),
    } as unknown as MemoryGrantsReadAuthorityPortV1,
    nonMemoryContextAuthorityPort: {
      readGrantedLifeFacts: vi.fn(),
      readRelationshipEvents: vi.fn(),
      readRecentMessages: vi.fn(),
    } as unknown as ReaderContextNonMemoryReadAuthorityPortV1,
    groundingProjectionPort: {
      projectGrounding: vi.fn(),
    },
  };
}

describe('Production Reader Interpretation activation gate v1', () => {
  it('defaults to fail-closed off when activation env is absent', () => {
    expect(parseProductionReaderInterpretationActivationConfigV1({})).toEqual({
      mode: 'off',
      policyVersion: PRODUCTION_READER_INTERPRETATION_OFF_POLICY_VERSION_V1,
      allowedSubjectHashes: [],
      hostedCanaryEvidence: null,
    });
  });

  it('keeps explicit off authoritative even when stale enable fields remain', () => {
    const env = enabledEnv();
    env[PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.mode] = 'off';
    env[PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.allowedSubjectHashes] =
      'not-a-hash';

    const config = parseProductionReaderInterpretationActivationConfigV1(env);
    expect(config.mode).toBe('off');
    expect(config.allowedSubjectHashes).toEqual([]);
    expect(config.hostedCanaryEvidence).toBeNull();
  });

  it('admits only a bounded internal preview cohort pinned to the reviewed Hosted Canary evidence', () => {
    const config = parseProductionReaderInterpretationActivationConfigV1(
      enabledEnv(),
    );

    expect(config).toEqual({
      mode: 'internal_preview',
      policyVersion: 'reader-internal-preview-v1',
      allowedSubjectHashes: [SUBJECT_HASH],
      hostedCanaryEvidence: READER_INTERPRETATION_HOSTED_CANARY_EVIDENCE_V1,
    });
    expect(hashReaderInterpretationActivationSubjectV1(SUBJECT_ID)).toBe(
      SUBJECT_HASH,
    );
  });

  it('rejects stale or forged Hosted Canary evidence pins', () => {
    const env = enabledEnv();
    env[
      PRODUCTION_READER_INTERPRETATION_ACTIVATION_ENV_V1.hostedCanaryRunId
    ] = '1';

    expect(() =>
      parseProductionReaderInterpretationActivationConfigV1(env),
    ).toThrowError(ProductionReaderInterpretationActivationConfigErrorV1);
  });

  it.each([
    'subject-raw-id',
    'A'.repeat(64),
    'a'.repeat(63),
    [SUBJECT_HASH, SUBJECT_HASH].join(','),
    [SUBJECT_HASH, 'b'.repeat(64), 'c'.repeat(64), 'd'.repeat(64)].join(','),
  ])('rejects unbounded or non-hashed internal cohort value %s', (value) => {
    expect(() =>
      parseProductionReaderInterpretationActivationConfigV1(enabledEnv(value)),
    ).toThrowError(ProductionReaderInterpretationActivationConfigErrorV1);
  });

  it('summarizes evidence and cohort size without exposing subject hashes', () => {
    const config = parseProductionReaderInterpretationActivationConfigV1(
      enabledEnv(),
    );
    const summary =
      summarizeProductionReaderInterpretationActivationConfigV1(config);

    expect(summary).toEqual({
      configured: true,
      mode: 'internal_preview',
      policyVersion: 'reader-internal-preview-v1',
      allowedSubjectCount: 1,
      hostedCanaryRunId: READER_INTERPRETATION_HOSTED_CANARY_EVIDENCE_V1.runId,
      expectedSajuSha: READER_INTERPRETATION_HOSTED_CANARY_EVIDENCE_V1.sajuSha,
      expectedMyeonghaSha:
        READER_INTERPRETATION_HOSTED_CANARY_EVIDENCE_V1.myeonghaSha,
      publicRouteEnabled: false,
    });
    expect(JSON.stringify(summary)).not.toContain(SUBJECT_HASH);
  });

  it('blocks disabled Production Reader Interpretation before context or grounding authority is touched', async () => {
    const ports = blockedRuntimePorts();

    await expect(
      runProductionReaderInterpretationPreviewHttpV1({
        resolvedSubjectId: SUBJECT_ID,
        effectiveAt: '2026-09-22T00:00:00.000Z',
        body: { threadId: 'thread-1', officialReadingId: 'reading-1' },
        activationEnv: {},
        ...ports,
      }),
    ).rejects.toMatchObject({ code: 'ACTIVATION_DISABLED' });

    expect(ports.contextAuthorityPort.resolveContext).not.toHaveBeenCalled();
    expect(ports.groundingProjectionPort.projectGrounding).not.toHaveBeenCalled();
  });

  it('blocks subjects outside the hashed internal cohort before context or grounding authority is touched', async () => {
    const ports = blockedRuntimePorts();

    await expect(
      runProductionReaderInterpretationPreviewHttpV1({
        resolvedSubjectId: 'subject-not-allowed',
        effectiveAt: '2026-09-22T00:00:00.000Z',
        body: { threadId: 'thread-1', officialReadingId: 'reading-1' },
        activationEnv: enabledEnv(),
        ...ports,
      }),
    ).rejects.toMatchObject({ code: 'SUBJECT_NOT_ALLOWED' });

    expect(ports.contextAuthorityPort.resolveContext).not.toHaveBeenCalled();
    expect(ports.groundingProjectionPort.projectGrounding).not.toHaveBeenCalled();
  });

  it('passes an admitted internal subject into the existing hardened Preview HTTP seam without widening client authority', async () => {
    const ports = blockedRuntimePorts();

    await expect(
      runProductionReaderInterpretationPreviewHttpV1({
        resolvedSubjectId: SUBJECT_ID,
        effectiveAt: '2026-09-22T00:00:00.000Z',
        body: {
          threadId: 'thread-1',
          officialReadingId: 'reading-1',
          readerCharacterId: 'forged',
        },
        activationEnv: enabledEnv(),
        ...ports,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });

    expect(ports.contextAuthorityPort.resolveContext).not.toHaveBeenCalled();
    expect(ports.groundingProjectionPort.projectGrounding).not.toHaveBeenCalled();
  });
});
