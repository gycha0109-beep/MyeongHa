import {
  bootstrapFacePreviewRuntimeV1,
  type FacePreviewRuntimeBootstrapInputV1,
} from './runtime-bootstrap.js';
import {
  sanitizeFacePreviewImageFE030,
  type FacePreviewImageIntakeResultFE030,
} from './image-intake-fe030.js';
import type {
  FacePreviewConsumerAttemptV1,
  FacePreviewConsumerOpenResultV1,
  FacePreviewNeutralMetricV1,
  FacePreviewRegionAvailabilityV1,
} from './consumer-adapter.js';

export const FACE_PREVIEW_ONE_SHOT_VERSION_FE031 =
  'MHA-FACE-PREVIEW-ONE-SHOT-FE031-v1' as const;

export interface FacePreviewOneShotInputFE031 {
  readonly schemaVersion: 'myeongha-face-preview-one-shot-input-v1';
  readonly blob: Blob;
  readonly loadEngineModule: () => Promise<unknown>;
  readonly fetchImpl?: typeof fetch;
}

export interface FacePreviewOneShotDependenciesFE031 {
  readonly sanitize?: (
    input: Parameters<typeof sanitizeFacePreviewImageFE030>[0],
  ) => Promise<FacePreviewImageIntakeResultFE030>;
  readonly bootstrap?: (
    input: FacePreviewRuntimeBootstrapInputV1,
  ) => Promise<FacePreviewConsumerOpenResultV1>;
}

export type FacePreviewOneShotResultFE031 =
  | Readonly<{
      schemaVersion: 'myeongha-face-preview-one-shot-result-v1';
      contractVersion: typeof FACE_PREVIEW_ONE_SHOT_VERSION_FE031;
      status: 'ok';
      preview: Readonly<{
        metrics: readonly FacePreviewNeutralMetricV1[];
        regions: readonly FacePreviewRegionAvailabilityV1[];
      }>;
      lifecycle: Readonly<{
        metadataStrippedBeforeAnalysis: true;
        rawInputPersisted: false;
        canonicalImagePersisted: false;
        identityEmbeddingCreated: false;
        sessionClosed: true;
      }>;
    }>
  | Readonly<{
      schemaVersion: 'myeongha-face-preview-one-shot-result-v1';
      contractVersion: typeof FACE_PREVIEW_ONE_SHOT_VERSION_FE031;
      status: 'rejected';
      rejection: Readonly<{
        code: string;
        stage: 'intake' | 'open' | 'ingress' | 'analysis' | 'lifecycle';
      }>;
      lifecycle: Readonly<{
        rawInputPersisted: false;
        canonicalImagePersisted: false;
        identityEmbeddingCreated: false;
      }>;
    }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length &&
    keys.every((key) => allowed.includes(key));
}

function rejected(
  code: string,
  stage: 'intake' | 'open' | 'ingress' | 'analysis' | 'lifecycle',
): FacePreviewOneShotResultFE031 {
  return Object.freeze({
    schemaVersion: 'myeongha-face-preview-one-shot-result-v1' as const,
    contractVersion: FACE_PREVIEW_ONE_SHOT_VERSION_FE031,
    status: 'rejected' as const,
    rejection: Object.freeze({ code, stage }),
    lifecycle: Object.freeze({
      rawInputPersisted: false as const,
      canonicalImagePersisted: false as const,
      identityEmbeddingCreated: false as const,
    }),
  });
}

function fromAttempt(
  attempt: FacePreviewConsumerAttemptV1,
): FacePreviewOneShotResultFE031 {
  if (attempt.status === 'rejected') {
    return rejected(attempt.rejection.code, attempt.rejection.stage);
  }
  return Object.freeze({
    schemaVersion: 'myeongha-face-preview-one-shot-result-v1' as const,
    contractVersion: FACE_PREVIEW_ONE_SHOT_VERSION_FE031,
    status: 'ok' as const,
    preview: Object.freeze({
      metrics: attempt.preview.metrics,
      regions: attempt.preview.regions,
    }),
    lifecycle: Object.freeze({
      metadataStrippedBeforeAnalysis: true as const,
      rawInputPersisted: false as const,
      canonicalImagePersisted: false as const,
      identityEmbeddingCreated: false as const,
      sessionClosed: true as const,
    }),
  });
}

export async function runFacePreviewOneShotFE031(
  input: FacePreviewOneShotInputFE031,
  dependencies: FacePreviewOneShotDependenciesFE031 = {},
): Promise<FacePreviewOneShotResultFE031> {
  if (
    !isRecord(input) ||
    !exactKeys(
      input,
      input.fetchImpl === undefined
        ? ['schemaVersion', 'blob', 'loadEngineModule']
        : ['schemaVersion', 'blob', 'loadEngineModule', 'fetchImpl'],
    ) ||
    input.schemaVersion !== 'myeongha-face-preview-one-shot-input-v1' ||
    !(input.blob instanceof Blob) ||
    typeof input.loadEngineModule !== 'function' ||
    (input.fetchImpl !== undefined && typeof input.fetchImpl !== 'function')
  ) {
    return rejected('INVALID_INPUT', 'intake');
  }

  const sanitize = dependencies.sanitize ?? sanitizeFacePreviewImageFE030;
  const bootstrap = dependencies.bootstrap ?? bootstrapFacePreviewRuntimeV1;

  let intake: FacePreviewImageIntakeResultFE030;
  try {
    intake = await sanitize({
      schemaVersion: 'myeongha-face-preview-image-intake-input-v1',
      blob: input.blob,
    });
  } catch {
    return rejected('IMAGE_INTAKE_FAILED', 'intake');
  }
  if (intake.status === 'rejected') {
    return rejected(intake.rejection.code, 'intake');
  }

  let opened: FacePreviewConsumerOpenResultV1;
  try {
    const bootstrapInput: FacePreviewRuntimeBootstrapInputV1 =
      input.fetchImpl === undefined
        ? {
            schemaVersion:
              'myeongha-face-preview-runtime-bootstrap-input-v1',
            loadEngineModule: input.loadEngineModule,
          }
        : {
            schemaVersion:
              'myeongha-face-preview-runtime-bootstrap-input-v1',
            loadEngineModule: input.loadEngineModule,
            fetchImpl: input.fetchImpl,
          };
    opened = await bootstrap(bootstrapInput);
  } catch {
    return rejected('ENGINE_INITIALIZATION_FAILED', 'open');
  }
  if (opened.status === 'rejected') {
    return rejected(opened.rejection.code, opened.rejection.stage);
  }

  let attempt: FacePreviewConsumerAttemptV1;
  try {
    attempt = await opened.session.analyze(intake.image);
  } catch {
    attempt = Object.freeze({
      schemaVersion: 'myeongha-face-preview-consumer-attempt-v1' as const,
      contractVersion: opened.contractVersion,
      status: 'rejected' as const,
      rejection: Object.freeze({
        code: 'ENGINE_RUNTIME_FAILED' as const,
        stage: 'analysis' as const,
      }),
      boundary: opened.boundary,
    });
  }

  let closeSucceeded = false;
  try {
    const close = await opened.session.close();
    closeSucceeded = close.status === 'closed';
  } catch {
    closeSucceeded = false;
  }

  if (!closeSucceeded) {
    return rejected('SESSION_CLOSE_FAILED', 'lifecycle');
  }

  return fromAttempt(attempt);
}
