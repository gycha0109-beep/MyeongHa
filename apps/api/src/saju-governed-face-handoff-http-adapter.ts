import {
  admitCharacterFaceGovernedInterpretationHandoffV1,
  type CharacterFaceGovernedInterpretationHandoffV1,
  type CharacterFaceGovernedInterpretationSourceBindingV1,
} from '../../../packages/domain/src/index.js';
import type {
  SajuProductionCalculationHttpFetchV1,
  SajuProductionCalculationHttpResponseV1,
} from './saju-production-calculation-http-adapter.js';
import {
  SAJU_READING_JSON_RESPONSE_MAXIMUM_BYTES_V1,
  UpstreamJsonResponseTooLargeV1,
  readBoundedUpstreamJsonTextV1,
} from './upstream-json-response-resource.js';

export const SAJU_GOVERNED_FACE_HANDOFF_HTTP_PATH_V1 =
  '/api/face/governed-character-handoff' as const;
export const SAJU_GOVERNED_FACE_HANDOFF_ADMISSION_HEADER_V1 =
  'x-myeonghwa-face-governed-handoff-admitted' as const;
export const SAJU_GOVERNED_FACE_HANDOFF_RUNTIME_SCHEMA_VERSION_V1 =
  'face-governed-handoff-runtime-v1' as const;
export const SAJU_GOVERNED_FACE_SOURCE_CONTRACT_VERSION_V1 =
  'saju-face-governed-interpretation-source-v1' as const;
export const SAJU_GOVERNED_FACE_HANDOFF_DEFAULT_TIMEOUT_MS_V1 =
  15_000 as const;
export const SAJU_GOVERNED_FACE_HANDOFF_MAX_TIMEOUT_MS_V1 =
  60_000 as const;

export type SajuGovernedFaceHandoffNotEligibleReasonV1 =
  | 'source_blocked'
  | 'neutral_topic'
  | 'publication_not_authorized'
  | 'metadata_incomplete';

export interface SajuGovernedFaceHandoffRequestV1 {
  readonly topicKey: string;
  readonly observationArtifactRef: string;
  readonly requestId: string;
}

export interface SajuGovernedFaceTrustedSourceBindingV1
  extends CharacterFaceGovernedInterpretationSourceBindingV1 {
  readonly authorizationReceiptRef: string;
}

export type SajuGovernedFaceHandoffTransportDecisionV1 =
  | Readonly<{
      state: 'eligible';
      requestId: string;
      topicKey: string;
      authoritySnapshotId: string;
      executionPlanHash: string;
      sourceBinding: SajuGovernedFaceTrustedSourceBindingV1;
      handoff: CharacterFaceGovernedInterpretationHandoffV1;
    }>
  | Readonly<{
      state: 'not_eligible';
      requestId: string;
      topicKey: string;
      reason: SajuGovernedFaceHandoffNotEligibleReasonV1;
      authoritySnapshotId?: string;
      executionPlanHash?: string;
    }>;

export type SajuGovernedFaceHandoffHttpAdapterFailureCodeV1 =
  | 'INVALID_CONFIGURATION'
  | 'INVALID_REQUEST'
  | 'TIMEOUT'
  | 'NETWORK_FAILURE'
  | 'HTTP_4XX'
  | 'HTTP_5XX'
  | 'HTTP_UNEXPECTED_STATUS'
  | 'INVALID_CONTENT_TYPE'
  | 'INVALID_JSON'
  | 'RESPONSE_TOO_LARGE'
  | 'RESPONSE_ATTESTATION_REJECTED'
  | 'RESPONSE_SCHEMA_REJECTED'
  | 'SOURCE_FAILED'
  | 'SOURCE_BINDING_MISMATCH'
  | 'HANDOFF_ADMISSION_REJECTED';

export class SajuGovernedFaceHandoffHttpAdapterErrorV1
  extends Error {
  constructor(
    readonly code:
      SajuGovernedFaceHandoffHttpAdapterFailureCodeV1,
    message: string,
    readonly httpStatus: number | null = null,
    readonly sourceStage: string | null = null,
    readonly sourceErrorCode: string | null = null,
  ) {
    super(message);
    this.name =
      'SajuGovernedFaceHandoffHttpAdapterErrorV1';
  }
}

export interface SajuGovernedFaceHandoffHttpAdapterConfigV1 {
  readonly baseUrl: string;
  readonly bearerToken: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: SajuProductionCalculationHttpFetchV1;
}

export interface SajuGovernedFaceHandoffHttpAdapterV1 {
  requestHandoff(
    request: SajuGovernedFaceHandoffRequestV1,
  ): Promise<SajuGovernedFaceHandoffTransportDecisionV1>;
}

interface DeadlineLease {
  readonly response:
    SajuProductionCalculationHttpResponseV1;
  readonly deadline: Promise<never>;
  readonly signal: AbortSignal;
  readonly didTimeout: () => boolean;
  readonly release: () => void;
}

const ELIGIBLE_KEYS = Object.freeze([
  'schemaVersion',
  'state',
  'requestId',
  'topicKey',
  'authoritySnapshotId',
  'executionPlanHash',
  'sourceBinding',
  'handoff',
] as const);

const NOT_ELIGIBLE_KEYS = Object.freeze([
  'schemaVersion',
  'state',
  'requestId',
  'topicKey',
  'reason',
  'authoritySnapshotId',
  'executionPlanHash',
] as const);

const FAILED_KEYS = Object.freeze([
  'schemaVersion',
  'state',
  'requestId',
  'topicKey',
  'stage',
  'errorCode',
] as const);

const SOURCE_BINDING_KEYS = Object.freeze([
  'sourceContractVersion',
  'sourceAuthorityRef',
  'sourceResultHash',
  'topicKey',
  'authorizationReceiptRef',
] as const);

const NOT_ELIGIBLE_REASONS =
  new Set<SajuGovernedFaceHandoffNotEligibleReasonV1>([
    'source_blocked',
    'neutral_topic',
    'publication_not_authorized',
    'metadata_incomplete',
  ]);

function fail(
  code: SajuGovernedFaceHandoffHttpAdapterFailureCodeV1,
  message: string,
  httpStatus: number | null = null,
): never {
  throw new SajuGovernedFaceHandoffHttpAdapterErrorV1(
    code,
    message,
    httpStatus,
  );
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function record(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    return fail(
      'RESPONSE_SCHEMA_REJECTED',
      label + ' must be an object.',
      200,
    );
  }
  return value;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const set = new Set(allowed);
  const extra =
    Object.keys(value).find(
      (key) => !set.has(key),
    );
  if (extra !== undefined) {
    fail(
      'RESPONSE_SCHEMA_REJECTED',
      label + ' contains unexpected field: ' + extra + '.',
      200,
    );
  }
}

function stringValue(
  value: unknown,
  label: string,
  maximum = 2048,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > maximum
  ) {
    return fail(
      'RESPONSE_SCHEMA_REJECTED',
      label + ' must be bounded non-empty text.',
      200,
    );
  }
  return value;
}

function requestString(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.trim().length > 2048
  ) {
    throw new SajuGovernedFaceHandoffHttpAdapterErrorV1(
      'INVALID_REQUEST',
      label + ' must be bounded non-empty text.',
    );
  }
  return value.trim();
}

export function buildSajuGovernedFaceHandoffRequestV1(
  input: SajuGovernedFaceHandoffRequestV1,
): SajuGovernedFaceHandoffRequestV1 {
  return Object.freeze({
    topicKey:
      requestString(
        input.topicKey,
        'topicKey',
      ),
    observationArtifactRef:
      requestString(
        input.observationArtifactRef,
        'observationArtifactRef',
      ),
    requestId:
      requestString(
        input.requestId,
        'requestId',
      ),
  });
}

function resolveEndpoint(
  baseUrl: string,
): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return fail(
      'INVALID_CONFIGURATION',
      'Saju governed Face baseUrl must be an absolute URL.',
    );
  }

  if (
    parsed.protocol !== 'https:' &&
    parsed.protocol !== 'http:'
  ) {
    return fail(
      'INVALID_CONFIGURATION',
      'Saju governed Face baseUrl must use http or https.',
    );
  }

  if (
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0 ||
    (parsed.pathname !== '/' &&
      parsed.pathname !== '')
  ) {
    return fail(
      'INVALID_CONFIGURATION',
      'Saju governed Face baseUrl must be an origin without credentials, path, query, or fragment.',
    );
  }

  return new URL(
    SAJU_GOVERNED_FACE_HANDOFF_HTTP_PATH_V1,
    parsed,
  ).toString();
}

function bearer(
  value: string,
): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return fail(
      'INVALID_CONFIGURATION',
      'Saju governed Face service bearer must be non-empty.',
    );
  }
  return normalized;
}

function timeout(
  value: number | undefined,
): number {
  const timeoutMs =
    value ??
    SAJU_GOVERNED_FACE_HANDOFF_DEFAULT_TIMEOUT_MS_V1;
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs >
      SAJU_GOVERNED_FACE_HANDOFF_MAX_TIMEOUT_MS_V1
  ) {
    return fail(
      'INVALID_CONFIGURATION',
      'Saju governed Face timeout is outside the supported bounds.',
    );
  }
  return timeoutMs;
}

const defaultFetch:
SajuProductionCalculationHttpFetchV1 =
  async (url, init) =>
    fetch(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      redirect: init.redirect,
      signal: init.signal,
    });

function timeoutFailure():
SajuGovernedFaceHandoffHttpAdapterErrorV1 {
  return new SajuGovernedFaceHandoffHttpAdapterErrorV1(
    'TIMEOUT',
    'Saju governed Face request timed out.',
  );
}

async function fetchWithTimeout(
  input: Readonly<{
    fetchImpl:
      SajuProductionCalculationHttpFetchV1;
    url: string;
    request:
      SajuGovernedFaceHandoffRequestV1;
    bearerToken: string;
    timeoutMs: number;
  }>,
): Promise<DeadlineLease> {
  const controller =
    new AbortController();
  let timer:
    ReturnType<typeof setTimeout> |
    undefined;
  let timedOut = false;
  let released = false;

  const deadline =
    new Promise<never>(
      (_, reject) => {
        timer = setTimeout(
          () => {
            timedOut = true;
            const error =
              timeoutFailure();
            reject(error);
            controller.abort();
          },
          input.timeoutMs,
        );
      },
    );

  const release = (): void => {
    if (released) return;
    released = true;
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  };

  try {
    const response =
      await Promise.race([
        input.fetchImpl(
          input.url,
          {
            method: 'POST',
            headers:
              Object.freeze({
                accept:
                  'application/json',
                authorization:
                  'Bearer ' +
                  input.bearerToken,
                'content-type':
                  'application/json',
              }),
            body:
              JSON.stringify(
                input.request,
              ),
            redirect:
              'manual',
            signal:
              controller.signal,
          },
        ),
        deadline,
      ]);

    return Object.freeze({
      response,
      deadline,
      signal:
        controller.signal,
      didTimeout:
        () => timedOut,
      release,
    });
  } catch (error) {
    release();
    if (
      timedOut ||
      (
        error instanceof
          SajuGovernedFaceHandoffHttpAdapterErrorV1 &&
        error.code === 'TIMEOUT'
      )
    ) {
      throw timeoutFailure();
    }
    throw new SajuGovernedFaceHandoffHttpAdapterErrorV1(
      'NETWORK_FAILURE',
      'Saju governed Face transport failed before an HTTP response was accepted.',
    );
  }
}

function cancelBody(
  response:
    SajuProductionCalculationHttpResponseV1,
): void {
  try {
    if (
      response.body !== undefined &&
      response.body !== null
    ) {
      void response.body.cancel()
        .catch(() => undefined);
    }
  } catch {
    return;
  }
}

function assertStatus(
  response:
    SajuProductionCalculationHttpResponseV1,
): void {
  if (response.status === 200) {
    return;
  }
  cancelBody(response);

  if (
    response.status >= 400 &&
    response.status <= 499
  ) {
    fail(
      'HTTP_4XX',
      'Saju governed Face service rejected the request.',
      response.status,
    );
  }
  if (
    response.status >= 500 &&
    response.status <= 599
  ) {
    fail(
      'HTTP_5XX',
      'Saju governed Face service failed the request.',
      response.status,
    );
  }
  fail(
    'HTTP_UNEXPECTED_STATUS',
    'Saju governed Face service returned an unsupported HTTP status.',
    response.status,
  );
}

function assertHeaders(
  response:
    SajuProductionCalculationHttpResponseV1,
): void {
  const contentType =
    response.headers.get(
      'content-type',
    );
  if (
    contentType === null ||
    !/^application\/json(?:\s*;|$)/iu
      .test(contentType.trim())
  ) {
    cancelBody(response);
    fail(
      'INVALID_CONTENT_TYPE',
      'Saju governed Face response is not JSON.',
      response.status,
    );
  }

  const attestation =
    response.headers.get(
      SAJU_GOVERNED_FACE_HANDOFF_ADMISSION_HEADER_V1,
    );
  if (
    attestation !==
      SAJU_GOVERNED_FACE_HANDOFF_RUNTIME_SCHEMA_VERSION_V1
  ) {
    cancelBody(response);
    fail(
      'RESPONSE_ATTESTATION_REJECTED',
      'Saju governed Face source admission attestation is missing or unsupported.',
      response.status,
    );
  }
}

async function parseResponse(
  lease: DeadlineLease,
): Promise<unknown> {
  let text: string;
  try {
    text =
      await Promise.race([
        readBoundedUpstreamJsonTextV1(
          lease.response,
          {
            maximumBodyBytes:
              SAJU_READING_JSON_RESPONSE_MAXIMUM_BYTES_V1,
            signal:
              lease.signal,
          },
        ),
        lease.deadline,
      ]);
  } catch (error) {
    if (
      error instanceof
      UpstreamJsonResponseTooLargeV1
    ) {
      throw new SajuGovernedFaceHandoffHttpAdapterErrorV1(
        'RESPONSE_TOO_LARGE',
        'Saju governed Face response exceeded the governed resource ceiling.',
        lease.response.status,
      );
    }
    if (lease.didTimeout()) {
      throw timeoutFailure();
    }
    throw new SajuGovernedFaceHandoffHttpAdapterErrorV1(
      'NETWORK_FAILURE',
      'Saju governed Face response body could not be read.',
      lease.response.status,
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SajuGovernedFaceHandoffHttpAdapterErrorV1(
      'INVALID_JSON',
      'Saju governed Face service returned malformed JSON.',
      lease.response.status,
    );
  }
}

function assertRequestEcho(
  envelope:
    Record<string, unknown>,
  request:
    SajuGovernedFaceHandoffRequestV1,
): void {
  if (
    stringValue(
      envelope.requestId,
      'response.requestId',
    ) !== request.requestId ||
    stringValue(
      envelope.topicKey,
      'response.topicKey',
    ) !== request.topicKey
  ) {
    fail(
      'SOURCE_BINDING_MISMATCH',
      'Saju governed Face response does not bind the requested identity.',
      200,
    );
  }
}

function parseSourceBinding(
  value: unknown,
): SajuGovernedFaceTrustedSourceBindingV1 {
  const source =
    record(
      value,
      'response.sourceBinding',
    );
  exactKeys(
    source,
    SOURCE_BINDING_KEYS,
    'response.sourceBinding',
  );

  const sourceContractVersion =
    stringValue(
      source.sourceContractVersion,
      'response.sourceBinding.sourceContractVersion',
    );
  if (
    sourceContractVersion !==
      SAJU_GOVERNED_FACE_SOURCE_CONTRACT_VERSION_V1
  ) {
    fail(
      'SOURCE_BINDING_MISMATCH',
      'Saju governed Face source contract version is not the pinned contract.',
      200,
    );
  }

  return Object.freeze({
    sourceContractVersion,
    sourceAuthorityRef:
      stringValue(
        source.sourceAuthorityRef,
        'response.sourceBinding.sourceAuthorityRef',
      ),
    sourceResultHash:
      stringValue(
        source.sourceResultHash,
        'response.sourceBinding.sourceResultHash',
      ),
    topicKey:
      stringValue(
        source.topicKey,
        'response.sourceBinding.topicKey',
      ),
    authorizationReceiptRef:
      stringValue(
        source.authorizationReceiptRef,
        'response.sourceBinding.authorizationReceiptRef',
      ),
  });
}

function admitEnvelope(
  payload: unknown,
  request:
    SajuGovernedFaceHandoffRequestV1,
): SajuGovernedFaceHandoffTransportDecisionV1 {
  const envelope =
    record(
      payload,
      'Saju governed Face response',
    );

  if (
    envelope.schemaVersion !==
      SAJU_GOVERNED_FACE_HANDOFF_RUNTIME_SCHEMA_VERSION_V1
  ) {
    fail(
      'RESPONSE_SCHEMA_REJECTED',
      'Saju governed Face response schemaVersion is unsupported.',
      200,
    );
  }

  const state =
    stringValue(
      envelope.state,
      'response.state',
      64,
    );
  assertRequestEcho(
    envelope,
    request,
  );

  if (
    state === 'failed'
  ) {
    exactKeys(
      envelope,
      FAILED_KEYS,
      'Saju governed Face failed response',
    );
    const sourceStage =
      stringValue(
        envelope.stage,
        'response.stage',
        64,
      );
    const sourceErrorCode =
      stringValue(
        envelope.errorCode,
        'response.errorCode',
        256,
      );
    throw new SajuGovernedFaceHandoffHttpAdapterErrorV1(
      'SOURCE_FAILED',
      'Saju governed Face source runtime failed.',
      200,
      sourceStage,
      sourceErrorCode,
    );
  }

  if (
    state ===
    'not_eligible'
  ) {
    exactKeys(
      envelope,
      NOT_ELIGIBLE_KEYS,
      'Saju governed Face not_eligible response',
    );
    const reason =
      stringValue(
        envelope.reason,
        'response.reason',
        128,
      ) as SajuGovernedFaceHandoffNotEligibleReasonV1;
    if (
      !NOT_ELIGIBLE_REASONS
        .has(reason)
    ) {
      fail(
        'RESPONSE_SCHEMA_REJECTED',
        'Saju governed Face not_eligible reason is unsupported.',
        200,
      );
    }

    const authoritySnapshotId =
      envelope.authoritySnapshotId ===
        undefined
        ? undefined
        : stringValue(
            envelope.authoritySnapshotId,
            'response.authoritySnapshotId',
          );
    const executionPlanHash =
      envelope.executionPlanHash ===
        undefined
        ? undefined
        : stringValue(
            envelope.executionPlanHash,
            'response.executionPlanHash',
          );

    return Object.freeze({
      state:
        'not_eligible' as const,
      requestId:
        request.requestId,
      topicKey:
        request.topicKey,
      reason,
      ...(authoritySnapshotId === undefined
        ? {}
        : { authoritySnapshotId }),
      ...(executionPlanHash === undefined
        ? {}
        : { executionPlanHash }),
    });
  }

  if (state !== 'eligible') {
    return fail(
      'RESPONSE_SCHEMA_REJECTED',
      'Saju governed Face response state is unsupported.',
      200,
    );
  }

  exactKeys(
    envelope,
    ELIGIBLE_KEYS,
    'Saju governed Face eligible response',
  );

  const authoritySnapshotId =
    stringValue(
      envelope.authoritySnapshotId,
      'response.authoritySnapshotId',
    );
  const executionPlanHash =
    stringValue(
      envelope.executionPlanHash,
      'response.executionPlanHash',
    );
  const sourceBinding =
    parseSourceBinding(
      envelope.sourceBinding,
    );

  if (
    sourceBinding.topicKey !==
      request.topicKey
  ) {
    fail(
      'SOURCE_BINDING_MISMATCH',
      'Saju governed Face sourceBinding topicKey does not match the request.',
      200,
    );
  }

  let handoff:
    CharacterFaceGovernedInterpretationHandoffV1;
  try {
    handoff =
      admitCharacterFaceGovernedInterpretationHandoffV1({
        candidate:
          envelope.handoff,
        expectedSource:
          Object.freeze({
            sourceContractVersion:
              sourceBinding.sourceContractVersion,
            sourceAuthorityRef:
              sourceBinding.sourceAuthorityRef,
            sourceResultHash:
              sourceBinding.sourceResultHash,
            topicKey:
              sourceBinding.topicKey,
          }),
      });
  } catch {
    throw new SajuGovernedFaceHandoffHttpAdapterErrorV1(
      'HANDOFF_ADMISSION_REJECTED',
      'Saju governed Face handoff failed MyeongHa defense-in-depth admission.',
      200,
    );
  }

  if (
    handoff.authorizationReceiptRef !==
      sourceBinding.authorizationReceiptRef
  ) {
    fail(
      'SOURCE_BINDING_MISMATCH',
      'Saju governed Face authorization receipt does not match trusted sourceBinding.',
      200,
    );
  }

  return Object.freeze({
    state:
      'eligible' as const,
    requestId:
      request.requestId,
    topicKey:
      request.topicKey,
    authoritySnapshotId,
    executionPlanHash,
    sourceBinding,
    handoff,
  });
}

export function createSajuGovernedFaceHandoffHttpAdapterV1(
  config:
    SajuGovernedFaceHandoffHttpAdapterConfigV1,
): SajuGovernedFaceHandoffHttpAdapterV1 {
  const url =
    resolveEndpoint(
      config.baseUrl,
    );
  const bearerToken =
    bearer(
      config.bearerToken,
    );
  const timeoutMs =
    timeout(
      config.timeoutMs,
    );
  const fetchImpl =
    config.fetchImpl ??
    defaultFetch;

  return Object.freeze({
    async requestHandoff(
      input:
        SajuGovernedFaceHandoffRequestV1,
    ): Promise<SajuGovernedFaceHandoffTransportDecisionV1> {
      const request =
        buildSajuGovernedFaceHandoffRequestV1(
          input,
        );
      const lease =
        await fetchWithTimeout({
          fetchImpl,
          url,
          request,
          bearerToken,
          timeoutMs,
        });

      try {
        assertStatus(
          lease.response,
        );
        assertHeaders(
          lease.response,
        );
        const payload =
          await parseResponse(
            lease,
          );
        return admitEnvelope(
          payload,
          request,
        );
      } finally {
        lease.release();
      }
    },
  });
}
