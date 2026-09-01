import { createHash } from 'node:crypto';
import {
  ContractViolationError,
  parseSajuDomain,
  type SajuDomain,
} from '../../../packages/contracts/src/index.js';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import { ApiCommandError } from './api-error.js';

export const READING_CREATE_AUTHORITY_BINDING_V1 =
  'public.cmd_create_reading_session_v1' as const;
export const READING_CREATE_REQUEST_CONTRACT_VERSION_V1 =
  'reading-request-v1' as const;

type Awaitable<T> = T | Promise<T>;

export interface DirectReadingCreateRequestV1 {
  readonly idempotencyKey: string;
  readonly domain: SajuDomain;
  readonly sourceBirthProfileId: string;
}

export interface ReadingCreateAuthorityRowV1 {
  readonly readingSessionId: string;
  readonly readingId: string;
  readonly attemptNo: number;
  readonly sourceBirthRevisionId: string;
  readonly targetBirthRevisionId: string | null;
  readonly domainCapabilityVersion: string;
  readonly replayed: boolean;
}

export type ReadingCreateAuthorityFailureCodeV1 =
  | 'SOURCE_PROFILE_NOT_FOUND'
  | 'SOURCE_PROFILE_NOT_READY'
  | 'PROFILE_CARDINALITY_INVALID'
  | 'DOMAIN_UNAVAILABLE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_INPUT'
  | 'SERVER_ID_CONFLICT';

export class ReadingCreateAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: ReadingCreateAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'ReadingCreateAuthorityPortErrorV1';
  }
}

/** Server-owned logical Reading Session and first Reading identities. */
export interface ReadingCreateIdPortV1 {
  nextReadingSessionId(): Awaitable<string>;
  nextReadingId(): Awaitable<string>;
}

/**
 * Persistence authority for the source-safe direct-user baseline of POST /api/readings.
 *
 * The verified DB command pins the current immutable self Birth revision, checks the
 * operational Saju domain, creates one Reading Session plus logical Reading attempt 1,
 * and leaves execution pending. It creates no transport execution attempt and performs
 * no Saju call. P0-AUTH-01 therefore remains outside this slice and no PostgreSQL adapter
 * is selected here.
 */
export interface ReadingCreateAuthorityPortV1 {
  createReadingSession(input: {
    readonly subjectId: string;
    readonly readingSessionId: string;
    readonly readingId: string;
    readonly requestIdempotencyKey: string;
    readonly requestHash: string;
    readonly requestContractVersion: typeof READING_CREATE_REQUEST_CONTRACT_VERSION_V1;
    readonly requestSnapshotJsonb: DirectReadingCreateRequestV1;
    readonly sajuDomain: SajuDomain;
    readonly sourceBirthProfileId: string;
    readonly targetBirthProfileId: null;
    readonly sourceTurnId: null;
    readonly requestedThreadCharacterId: null;
    readonly requestedCharacterId: null;
    readonly requestedCharacterContentBundleId: null;
  }): Awaitable<readonly ReadingCreateAuthorityRowV1[]>;
}

export interface CreateDirectReadingInputV1 {
  readonly resolvedSubjectId?: string;
  readonly request: unknown;
  readonly idPort: ReadingCreateIdPortV1;
  readonly authorityPort: ReadingCreateAuthorityPortV1;
}

export interface CreateDirectReadingResponseV1 {
  readonly readingSessionId: string;
  readonly readingId: string;
  readonly attemptNo: 1;
  readonly sourceBirthRevisionId: string;
  readonly domainCapabilityVersion: string;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function requireNonBlank(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError('INVALID_REQUEST', `${name} must be a non-empty string.`);
  }
  return value;
}

function parseDomain(value: unknown): SajuDomain {
  try {
    return parseSajuDomain(value);
  } catch (error) {
    if (error instanceof ContractViolationError) {
      throw new ApiCommandError('INVALID_REQUEST', 'domain is not a supported Saju domain.');
    }
    throw error;
  }
}

function parseRequest(value: unknown): DirectReadingCreateRequestV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiCommandError('INVALID_REQUEST', 'Reading request must be an object.');
  }

  const request = value as Record<string, unknown>;
  const allowed = new Set([
    'idempotencyKey',
    'domain',
    'sourceBirthProfileId',
    'targetBirthProfileId',
    'characterId',
    'sourceTurnId',
  ]);
  if (Object.keys(request).some((key) => !allowed.has(key))) {
    throw new ApiCommandError('INVALID_REQUEST', 'Reading request contains unsupported fields.');
  }

  const idempotencyKey = requireNonBlank('idempotencyKey', request.idempotencyKey);
  const domain = parseDomain(request.domain);
  const sourceBirthProfileId = requireNonBlank(
    'sourceBirthProfileId',
    request.sourceBirthProfileId,
  );

  for (const key of ['targetBirthProfileId', 'characterId', 'sourceTurnId'] as const) {
    if (Object.prototype.hasOwnProperty.call(request, key)) {
      requireNonBlank(key, request[key]);
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(request, 'targetBirthProfileId') ||
    domain === 'compatibility'
  ) {
    throw new ApiCommandError(
      'CAPABILITY_UNAVAILABLE',
      'Compatibility Reading creation is unavailable until the current Saju public contract accepts the required target Birth snapshot.',
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(request, 'characterId') ||
    Object.prototype.hasOwnProperty.call(request, 'sourceTurnId')
  ) {
    throw new ApiCommandError(
      'CAPABILITY_UNAVAILABLE',
      'Character- or turn-coupled Reading creation is outside the direct Reading baseline.',
    );
  }

  return Object.freeze({ idempotencyKey, domain, sourceBirthProfileId });
}

function hashCanonical(value: unknown): string {
  return `sha256:v1:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function requireServerString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Reading create authority returned an invalid ${name}.`);
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof ReadingCreateAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'SOURCE_PROFILE_NOT_FOUND':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Source Birth Profile is unavailable for the current subject.',
      );
    case 'SOURCE_PROFILE_NOT_READY':
    case 'PROFILE_CARDINALITY_INVALID':
      throw new ApiCommandError(
        'CAPABILITY_UNAVAILABLE',
        'Source Birth Profile cannot start this Reading.',
      );
    case 'DOMAIN_UNAVAILABLE':
      throw new ApiCommandError(
        'CAPABILITY_UNAVAILABLE',
        'Requested Saju domain is not operationally available.',
      );
    case 'IDEMPOTENCY_CONFLICT':
      throw new ApiCommandError(
        'IDEMPOTENCY_CONFLICT',
        'idempotencyKey already represents a different Reading request.',
      );
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', 'Reading request is invalid.');
    case 'SERVER_ID_CONFLICT':
      throw new Error('Reading create authority rejected trusted server-owned identity.');
  }
}

function assembleResponse(
  row: ReadingCreateAuthorityRowV1,
  proposedSessionId: string,
  proposedReadingId: string,
): CreateDirectReadingResponseV1 {
  const readingSessionId = requireServerString('reading session id', row.readingSessionId);
  const readingId = requireServerString('reading id', row.readingId);
  const sourceBirthRevisionId = requireServerString(
    'source Birth revision id',
    row.sourceBirthRevisionId,
  );
  const domainCapabilityVersion = requireServerString(
    'domain capability version',
    row.domainCapabilityVersion,
  );

  if (row.attemptNo !== 1) {
    throw new Error('Reading create authority returned a non-initial logical attempt.');
  }
  if (row.targetBirthRevisionId !== null) {
    throw new Error('Direct Reading create authority unexpectedly pinned a target Birth revision.');
  }
  if (typeof row.replayed !== 'boolean') {
    throw new Error('Reading create authority returned an invalid replay marker.');
  }
  if (!row.replayed) {
    if (readingSessionId !== proposedSessionId || readingId !== proposedReadingId) {
      throw new Error('Reading create authority returned different new logical identities.');
    }
  }

  return Object.freeze({
    readingSessionId,
    readingId,
    attemptNo: 1,
    sourceBirthRevisionId,
    domainCapabilityVersion,
  });
}

export async function createDirectReading(
  input: CreateDirectReadingInputV1,
): Promise<CreateDirectReadingResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const request = parseRequest(input.request);
  const readingSessionId = requireServerString(
    'generated reading session id',
    await input.idPort.nextReadingSessionId(),
  );
  const readingId = requireServerString(
    'generated reading id',
    await input.idPort.nextReadingId(),
  );
  const requestHash = hashCanonical(request);

  try {
    const rows = await input.authorityPort.createReadingSession({
      subjectId,
      readingSessionId,
      readingId,
      requestIdempotencyKey: request.idempotencyKey,
      requestHash,
      requestContractVersion: READING_CREATE_REQUEST_CONTRACT_VERSION_V1,
      requestSnapshotJsonb: request,
      sajuDomain: request.domain,
      sourceBirthProfileId: request.sourceBirthProfileId,
      targetBirthProfileId: null,
      sourceTurnId: null,
      requestedThreadCharacterId: null,
      requestedCharacterId: null,
      requestedCharacterContentBundleId: null,
    });

    if (rows.length !== 1 || rows[0] === undefined) {
      throw new Error('Reading create authority must return exactly one successful row.');
    }
    return assembleResponse(rows[0], readingSessionId, readingId);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
