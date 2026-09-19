import { createHash } from 'node:crypto';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import { ApiCommandError } from './api-error.js';

export const STANDARD_READING_UNIT_BIND_AUTHORITY_BINDING_V1 =
  'public.cmd_bind_standard_reading_unit_v1' as const;
export const STANDARD_READING_UNIT_REQUEST_CONTRACT_VERSION_V1 =
  'standard-reading-unit-request-v1' as const;

type Awaitable<T> = T | Promise<T>;

export interface StandardReadingUnitRequestV1 {
  readonly purchaseIntentId: string;
  readonly sourceBirthProfileId: string;
}

export interface StandardReadingUnitBindAuthorityRowV1 {
  readonly purchaseIntentId: string;
  readonly entitlementGrantId: string;
  readonly productId: string;
  readonly readerCharacterId: string;
  readonly readerContentBundleId: string;
  readonly readingSessionId: string;
  readonly readingId: string;
  readonly attemptNo: number;
  readonly sourceBirthRevisionId: string;
  readonly sajuDomain: string;
  readonly domainCapabilityVersion: string;
  readonly replayed: boolean;
}

export type StandardReadingUnitBindAuthorityFailureCodeV1 =
  | 'SUBJECT_INELIGIBLE'
  | 'PURCHASE_UNAVAILABLE'
  | 'READER_PROVENANCE_UNAVAILABLE'
  | 'CAPABILITY_UNAVAILABLE'
  | 'ENTITLEMENT_UNAVAILABLE'
  | 'ENTITLEMENT_AMBIGUOUS'
  | 'SOURCE_PROFILE_NOT_FOUND'
  | 'SOURCE_PROFILE_NOT_READY'
  | 'PROFILE_CARDINALITY_INVALID'
  | 'DOMAIN_UNAVAILABLE'
  | 'READER_CAPABILITY_UNAVAILABLE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'BINDING_CONFLICT'
  | 'INVALID_INPUT'
  | 'SERVER_ID_CONFLICT';

export class StandardReadingUnitBindAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: StandardReadingUnitBindAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'StandardReadingUnitBindAuthorityPortErrorV1';
  }
}

export interface StandardReadingUnitBindIdPortV1 {
  nextReadingSessionId(): Awaitable<string>;
  nextReadingId(): Awaitable<string>;
}

export interface StandardReadingUnitBindAuthorityPortV1 {
  bindUnit(input: {
    readonly subjectId: string;
    readonly purchaseIntentId: string;
    readonly readingSessionId: string;
    readonly readingId: string;
    readonly requestHash: string;
    readonly requestContractVersion: typeof STANDARD_READING_UNIT_REQUEST_CONTRACT_VERSION_V1;
    readonly requestSnapshotJsonb: Readonly<{
      readonly schemaVersion: typeof STANDARD_READING_UNIT_REQUEST_CONTRACT_VERSION_V1;
      readonly purchaseIntentId: string;
      readonly sourceBirthProfileId: string;
    }>;
    readonly sourceBirthProfileId: string;
  }): Awaitable<readonly StandardReadingUnitBindAuthorityRowV1[]>;
}

export interface BindStandardReadingUnitInputV1 {
  readonly resolvedSubjectId?: string;
  readonly request: unknown;
  readonly idPort: StandardReadingUnitBindIdPortV1;
  readonly authorityPort: StandardReadingUnitBindAuthorityPortV1;
}

export interface BindStandardReadingUnitResponseV1 {
  readonly purchaseIntentId: string;
  readonly productId: string;
  readonly readerCharacterId: string;
  readonly readerContentBundleId: string;
  readonly readingSessionId: string;
  readonly readingId: string;
  readonly sourceBirthRevisionId: string;
  readonly sajuDomain: string;
  readonly domainCapabilityVersion: string;
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

function parseRequest(value: unknown): StandardReadingUnitRequestV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiCommandError('INVALID_REQUEST', 'Standard Reading unit request must be an object.');
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set(['purchaseIntentId', 'sourceBirthProfileId']);
  const unexpected = Object.keys(record).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      `Unexpected Standard Reading unit field: ${unexpected.sort()[0] ?? 'unknown'}.`,
    );
  }
  return Object.freeze({
    purchaseIntentId: requireNonBlank('purchaseIntentId', record.purchaseIntentId),
    sourceBirthProfileId: requireNonBlank('sourceBirthProfileId', record.sourceBirthProfileId),
  });
}

function hashCanonical(value: unknown): string {
  return `sha256:v1:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function requireStoredString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Standard Reading unit authority returned an invalid ${name}.`);
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof StandardReadingUnitBindAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'SUBJECT_INELIGIBLE':
    case 'PURCHASE_UNAVAILABLE':
      throw new ApiCommandError('NOT_FOUND', 'Standard Reading purchase unit is unavailable.');
    case 'READER_PROVENANCE_UNAVAILABLE':
    case 'CAPABILITY_UNAVAILABLE':
    case 'ENTITLEMENT_UNAVAILABLE':
    case 'ENTITLEMENT_AMBIGUOUS':
    case 'SOURCE_PROFILE_NOT_READY':
    case 'PROFILE_CARDINALITY_INVALID':
    case 'DOMAIN_UNAVAILABLE':
    case 'READER_CAPABILITY_UNAVAILABLE':
      throw new ApiCommandError(
        'CAPABILITY_UNAVAILABLE',
        'Standard Reading purchase unit cannot create a Reading.',
      );
    case 'SOURCE_PROFILE_NOT_FOUND':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Source Birth Profile is unavailable for the current subject.',
      );
    case 'IDEMPOTENCY_CONFLICT':
    case 'BINDING_CONFLICT':
      throw new ApiCommandError(
        'IDEMPOTENCY_CONFLICT',
        'This Standard Reading purchase unit is already bound to a different request.',
      );
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', 'Standard Reading unit request is invalid.');
    case 'SERVER_ID_CONFLICT':
      throw new Error('Standard Reading unit authority rejected trusted server-owned identity.');
  }
}

function assembleResponse(
  request: StandardReadingUnitRequestV1,
  proposedSessionId: string,
  proposedReadingId: string,
  rows: readonly StandardReadingUnitBindAuthorityRowV1[],
): BindStandardReadingUnitResponseV1 {
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new Error('Standard Reading unit authority must return exactly one successful row.');
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

  if (purchaseIntentId !== request.purchaseIntentId) {
    throw new Error('Standard Reading unit authority returned a different Purchase Intent.');
  }
  if (row.attemptNo !== 1) {
    throw new Error('Standard Reading unit authority returned a non-initial Reading attempt.');
  }
  if (typeof row.replayed !== 'boolean') {
    throw new Error('Standard Reading unit authority returned an invalid replay marker.');
  }
  if (!row.replayed) {
    if (readingSessionId !== proposedSessionId || readingId !== proposedReadingId) {
      throw new Error('Standard Reading unit authority returned different new Reading identities.');
    }
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
  });
}

export async function bindStandardReadingUnitV1(
  input: BindStandardReadingUnitInputV1,
): Promise<BindStandardReadingUnitResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const request = parseRequest(input.request);
  const readingSessionId = requireStoredString(
    'generated Reading Session id',
    await input.idPort.nextReadingSessionId(),
  );
  const readingId = requireStoredString(
    'generated Reading id',
    await input.idPort.nextReadingId(),
  );
  const requestSnapshotJsonb = Object.freeze({
    schemaVersion: STANDARD_READING_UNIT_REQUEST_CONTRACT_VERSION_V1,
    purchaseIntentId: request.purchaseIntentId,
    sourceBirthProfileId: request.sourceBirthProfileId,
  });
  const requestHash = hashCanonical(requestSnapshotJsonb);

  try {
    const rows = await input.authorityPort.bindUnit({
      subjectId,
      purchaseIntentId: request.purchaseIntentId,
      readingSessionId,
      readingId,
      requestHash,
      requestContractVersion: STANDARD_READING_UNIT_REQUEST_CONTRACT_VERSION_V1,
      requestSnapshotJsonb,
      sourceBirthProfileId: request.sourceBirthProfileId,
    });
    return assembleResponse(request, readingSessionId, readingId, rows);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
