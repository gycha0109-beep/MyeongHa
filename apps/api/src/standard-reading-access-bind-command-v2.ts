import { createHash } from 'node:crypto';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import { ApiCommandError } from './api-error.js';

export const STANDARD_READING_ACCESS_BIND_AUTHORITY_BINDING_V2 =
  'public.cmd_bind_standard_reading_access_v2' as const;
export const STANDARD_READING_ACCESS_REQUEST_CONTRACT_VERSION_V2 =
  'standard-reading-access-bind-v2' as const;

type Awaitable<T> = T | Promise<T>;

export interface StandardReadingAccessRequestV2 {
  readonly purchaseIntentId: string;
}

export type StandardReadingAccessRoleV2 = 'initial_reader' | 'additional_reader';

export interface StandardReadingAccessBindAuthorityRowV2 {
  readonly purchaseIntentId: string;
  readonly entitlementGrantId: string;
  readonly productId: string;
  readonly readerCharacterId: string;
  readonly readerContentBundleId: string;
  readonly readingSessionId: string;
  readonly readingId: string;
  readonly sourceBirthRevisionId: string;
  readonly sajuDomain: string;
  readonly domainCapabilityVersion: string;
  readonly accessRole: StandardReadingAccessRoleV2;
  readonly officialReadingCreated: boolean;
  readonly interpretationCreated: boolean;
  readonly replayed: boolean;
}

export type StandardReadingAccessBindAuthorityFailureCodeV2 =
  | 'SUBJECT_INELIGIBLE'
  | 'PURCHASE_UNAVAILABLE'
  | 'READER_PROVENANCE_UNAVAILABLE'
  | 'CAPABILITY_UNAVAILABLE'
  | 'ENTITLEMENT_UNAVAILABLE'
  | 'ENTITLEMENT_AMBIGUOUS'
  | 'SOURCE_PROFILE_NOT_FOUND'
  | 'SOURCE_PROFILE_NOT_READY'
  | 'DOMAIN_UNAVAILABLE'
  | 'READER_CAPABILITY_UNAVAILABLE'
  | 'OFFICIAL_READING_NOT_REUSABLE'
  | 'ADDITIONAL_REQUIRES_OFFICIAL'
  | 'INITIAL_OFFICIAL_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'BINDING_CONFLICT'
  | 'INVALID_INPUT'
  | 'SERVER_ID_CONFLICT';

export class StandardReadingAccessBindAuthorityPortErrorV2 extends Error {
  constructor(
    readonly code: StandardReadingAccessBindAuthorityFailureCodeV2,
    message: string,
  ) {
    super(message);
    this.name = 'StandardReadingAccessBindAuthorityPortErrorV2';
  }
}

export interface StandardReadingAccessBindIdPortV2 {
  nextReadingSessionId(): Awaitable<string>;
  nextReadingId(): Awaitable<string>;
}

export interface StandardReadingAccessBindAuthorityPortV2 {
  bindAccess(input: {
    readonly subjectId: string;
    readonly purchaseIntentId: string;
    readonly proposedReadingSessionId: string;
    readonly proposedReadingId: string;
    readonly requestHash: string;
    readonly requestContractVersion: typeof STANDARD_READING_ACCESS_REQUEST_CONTRACT_VERSION_V2;
    readonly requestSnapshotJsonb: Readonly<{
      readonly schemaVersion: typeof STANDARD_READING_ACCESS_REQUEST_CONTRACT_VERSION_V2;
      readonly purchaseIntentId: string;
    }>;
  }): Awaitable<readonly StandardReadingAccessBindAuthorityRowV2[]>;
}

export interface BindStandardReadingAccessInputV2 {
  readonly resolvedSubjectId?: string;
  readonly request: unknown;
  readonly idPort: StandardReadingAccessBindIdPortV2;
  readonly authorityPort: StandardReadingAccessBindAuthorityPortV2;
}

export interface BindStandardReadingAccessResponseV2 {
  readonly purchaseIntentId: string;
  readonly productId: string;
  readonly readerCharacterId: string;
  readonly readerContentBundleId: string;
  readonly readingSessionId: string;
  readonly readingId: string;
  readonly sourceBirthRevisionId: string;
  readonly sajuDomain: string;
  readonly domainCapabilityVersion: string;
  readonly accessRole: StandardReadingAccessRoleV2;
  readonly officialReadingCreated: boolean;
  readonly interpretationCreated: boolean;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function requireNonBlank(name: string, value: unknown, maxLength = 200): string {
  if (typeof value !== 'string') {
    throw new ApiCommandError('INVALID_REQUEST', `${name} must be a string.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new ApiCommandError('INVALID_REQUEST', `${name} is outside the supported bounds.`);
  }
  return normalized;
}

function parseRequest(value: unknown): StandardReadingAccessRequestV2 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiCommandError('INVALID_REQUEST', 'Standard Reading access request must be an object.');
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set(['purchaseIntentId']);
  const unexpected = Object.keys(record).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      `Unexpected Standard Reading access field: ${unexpected.sort()[0] ?? 'unknown'}.`,
    );
  }
  return Object.freeze({
    purchaseIntentId: requireNonBlank('purchaseIntentId', record.purchaseIntentId),
  });
}

function hashCanonical(value: unknown): string {
  return `sha256:v1:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function requireStoredString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Standard Reading access authority returned an invalid ${name}.`);
  }
  return value;
}

function requireBoolean(name: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Standard Reading access authority returned an invalid ${name}.`);
  }
  return value;
}

function requireAccessRole(value: unknown): StandardReadingAccessRoleV2 {
  if (value !== 'initial_reader' && value !== 'additional_reader') {
    throw new Error('Standard Reading access authority returned an invalid access role.');
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof StandardReadingAccessBindAuthorityPortErrorV2)) throw error;

  switch (error.code) {
    case 'SUBJECT_INELIGIBLE':
    case 'PURCHASE_UNAVAILABLE':
      throw new ApiCommandError('NOT_FOUND', 'Standard Reading purchase is unavailable.');
    case 'READER_PROVENANCE_UNAVAILABLE':
    case 'CAPABILITY_UNAVAILABLE':
    case 'ENTITLEMENT_UNAVAILABLE':
    case 'ENTITLEMENT_AMBIGUOUS':
    case 'SOURCE_PROFILE_NOT_READY':
    case 'DOMAIN_UNAVAILABLE':
    case 'READER_CAPABILITY_UNAVAILABLE':
    case 'OFFICIAL_READING_NOT_REUSABLE':
    case 'ADDITIONAL_REQUIRES_OFFICIAL':
      throw new ApiCommandError(
        'CAPABILITY_UNAVAILABLE',
        'Standard Reading purchase cannot open the requested Reader interpretation.',
      );
    case 'SOURCE_PROFILE_NOT_FOUND':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Source Birth Profile is unavailable for the current subject.',
      );
    case 'INITIAL_OFFICIAL_CONFLICT':
    case 'IDEMPOTENCY_CONFLICT':
    case 'BINDING_CONFLICT':
      throw new ApiCommandError(
        'IDEMPOTENCY_CONFLICT',
        'This Standard Reading purchase is already bound to different request provenance.',
      );
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', 'Standard Reading access request is invalid.');
    case 'SERVER_ID_CONFLICT':
      throw new Error('Standard Reading access authority rejected trusted server-owned identity.');
  }
}

function assembleResponse(
  request: StandardReadingAccessRequestV2,
  proposedSessionId: string,
  proposedReadingId: string,
  rows: readonly StandardReadingAccessBindAuthorityRowV2[],
): BindStandardReadingAccessResponseV2 {
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new Error('Standard Reading access authority must return exactly one successful row.');
  }

  const row = rows[0];
  const purchaseIntentId = requireStoredString('Purchase Intent id', row.purchaseIntentId);
  const entitlementGrantId = requireStoredString('Entitlement Grant id', row.entitlementGrantId);
  const productId = requireStoredString('Product id', row.productId);
  const readerCharacterId = requireStoredString('Reader Character id', row.readerCharacterId);
  const readerContentBundleId = requireStoredString(
    'Reader content bundle id',
    row.readerContentBundleId,
  );
  const readingSessionId = requireStoredString('Reading Session id', row.readingSessionId);
  const readingId = requireStoredString('Reading id', row.readingId);
  const sourceBirthRevisionId = requireStoredString(
    'source Birth revision id',
    row.sourceBirthRevisionId,
  );
  const sajuDomain = requireStoredString('Saju domain', row.sajuDomain);
  const domainCapabilityVersion = requireStoredString(
    'domain capability version',
    row.domainCapabilityVersion,
  );
  const accessRole = requireAccessRole(row.accessRole);
  const officialReadingCreated = requireBoolean(
    'official Reading creation marker',
    row.officialReadingCreated,
  );
  const interpretationCreated = requireBoolean(
    'Reader Interpretation creation marker',
    row.interpretationCreated,
  );
  const replayed = requireBoolean('replay marker', row.replayed);

  if (purchaseIntentId !== request.purchaseIntentId) {
    throw new Error('Standard Reading access authority returned a different Purchase Intent.');
  }

  if (officialReadingCreated) {
    if (replayed || accessRole !== 'initial_reader') {
      throw new Error('New official Reading authority returned contradictory provenance markers.');
    }
    if (readingSessionId !== proposedSessionId || readingId !== proposedReadingId) {
      throw new Error('New official Reading authority returned different trusted Reading identities.');
    }
  }

  if (accessRole === 'additional_reader' && officialReadingCreated) {
    throw new Error('Additional Reader access must not create a new official Reading.');
  }

  void entitlementGrantId;

  return Object.freeze({
    purchaseIntentId,
    productId,
    readerCharacterId,
    readerContentBundleId,
    readingSessionId,
    readingId,
    sourceBirthRevisionId,
    sajuDomain,
    domainCapabilityVersion,
    accessRole,
    officialReadingCreated,
    interpretationCreated,
  });
}

export async function bindStandardReadingAccessV2(
  input: BindStandardReadingAccessInputV2,
): Promise<BindStandardReadingAccessResponseV2> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const request = parseRequest(input.request);

  const proposedReadingSessionId = requireStoredString(
    'generated Reading Session id',
    await input.idPort.nextReadingSessionId(),
  );
  const proposedReadingId = requireStoredString(
    'generated Reading id',
    await input.idPort.nextReadingId(),
  );

  const requestSnapshotJsonb = Object.freeze({
    schemaVersion: STANDARD_READING_ACCESS_REQUEST_CONTRACT_VERSION_V2,
    purchaseIntentId: request.purchaseIntentId,
  });
  const requestHash = hashCanonical(requestSnapshotJsonb);

  try {
    const rows = await input.authorityPort.bindAccess({
      subjectId,
      purchaseIntentId: request.purchaseIntentId,
      proposedReadingSessionId,
      proposedReadingId,
      requestHash,
      requestContractVersion: STANDARD_READING_ACCESS_REQUEST_CONTRACT_VERSION_V2,
      requestSnapshotJsonb,
    });
    return assembleResponse(request, proposedReadingSessionId, proposedReadingId, rows);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
