import { ApiCommandError } from './chat-receive.js';
import type {
  BirthCalendarTypeV1,
  BirthInputFingerprintPortV1,
  BirthInputV1,
  BirthSexV1,
} from './birth-profile-create-command.js';

export const TARGET_PERSON_CREATE_AUTHORITY_BINDING_V1 =
  'public.cmd_create_target_person_v1' as const;

type Awaitable<T> = T | Promise<T>;

export interface TargetPersonCreateRequestV1 {
  readonly displayLabel?: string | null;
  readonly relationshipLabel?: string | null;
  readonly input: BirthInputV1;
}

export interface TargetPersonCreateAuthorityRowV1 {
  readonly targetPersonId: string;
  readonly birthProfileId: string;
  readonly revisionId: string;
  readonly revisionNo: number;
}

export type TargetPersonCreateAuthorityFailureCodeV1 =
  | 'SUBJECT_NOT_FOUND'
  | 'SUBJECT_INELIGIBLE'
  | 'INVALID_INPUT'
  | 'SERVER_ID_CONFLICT';

export class TargetPersonCreateAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: TargetPersonCreateAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'TargetPersonCreateAuthorityPortErrorV1';
  }
}

/** Server-owned aggregate identities. None are accepted from the client body. */
export interface TargetPersonCreateIdPortV1 {
  nextTargetPersonId(): Awaitable<string>;
  nextBirthProfileId(): Awaitable<string>;
  nextBirthRevisionId(): Awaitable<string>;
}

/**
 * Persistence authority for POST /api/target-persons only.
 *
 * The verified DB command atomically creates owner-scoped Target Person metadata, one
 * distinct profile_kind='target' Birth Profile, and immutable Birth revision 1. It does
 * not define reverse lookup, invite/social-graph behavior, target cardinality, standalone
 * deletion, compatibility-engine transport, or post-create metadata mutation.
 *
 * P0-AUTH-01 remains open, so this slice exposes the port without choosing a production
 * PostgreSQL execution identity or adapter.
 */
export interface TargetPersonCreateAuthorityPortV1 {
  createTargetPerson(input: {
    readonly subjectId: string;
    readonly targetPersonId: string;
    readonly birthProfileId: string;
    readonly revisionId: string;
    readonly displayLabel: string | null;
    readonly relationshipLabel: string | null;
    readonly calendarType: BirthCalendarTypeV1;
    readonly birthDate: string;
    readonly birthTime: string | null;
    readonly timeKnown: boolean;
    readonly isLeapMonth: boolean | null;
    readonly sex: BirthSexV1;
    readonly inputHash: string;
  }): Awaitable<readonly TargetPersonCreateAuthorityRowV1[]>;
}

export interface CreateTargetPersonInputV1 {
  readonly resolvedSubjectId?: string;
  readonly request: unknown;
  readonly idPort: TargetPersonCreateIdPortV1;
  readonly fingerprintPort: BirthInputFingerprintPortV1;
  readonly authorityPort: TargetPersonCreateAuthorityPortV1;
}

export interface CreateTargetPersonResponseV1 {
  readonly targetPersonId: string;
  readonly birthProfileId: string;
  readonly revisionId: string;
  readonly revisionNo: 1;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  message: string,
): void {
  if (Object.keys(record).some((key) => !allowed.includes(key))) {
    throw new ApiCommandError('INVALID_REQUEST', message);
  }
}

function parseCalendarType(value: unknown): BirthCalendarTypeV1 {
  if (value === 'solar' || value === 'lunar') return value;
  throw new ApiCommandError('INVALID_REQUEST', 'calendarType must be solar or lunar.');
}

function parseSex(value: unknown): BirthSexV1 {
  if (value === null || value === 'male' || value === 'female' || value === 'unspecified') {
    return value;
  }
  throw new ApiCommandError('INVALID_REQUEST', 'sex is invalid.');
}

function parseBirthInput(value: unknown): BirthInputV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiCommandError('INVALID_REQUEST', 'Target Birth input must be an object.');
  }

  const input = value as Record<string, unknown>;
  rejectUnknownKeys(
    input,
    ['calendarType', 'birthDate', 'birthTime', 'timeKnown', 'isLeapMonth', 'sex'],
    'Target Birth input contains unsupported fields.',
  );

  const calendarType = parseCalendarType(input.calendarType);
  const birthDate = input.birthDate;
  const birthTime = input.birthTime;
  const timeKnown = input.timeKnown;
  const isLeapMonth = input.isLeapMonth ?? null;
  const sex = parseSex(input.sex ?? null);

  if (typeof birthDate !== 'string' || birthDate.trim().length === 0) {
    throw new ApiCommandError('INVALID_REQUEST', 'birthDate must be a non-empty string.');
  }
  if (typeof timeKnown !== 'boolean') {
    throw new ApiCommandError('INVALID_REQUEST', 'timeKnown must be a boolean.');
  }
  if (birthTime !== null && (typeof birthTime !== 'string' || birthTime.trim().length === 0)) {
    throw new ApiCommandError('INVALID_REQUEST', 'birthTime must be a non-empty string or null.');
  }
  if (isLeapMonth !== null && typeof isLeapMonth !== 'boolean') {
    throw new ApiCommandError('INVALID_REQUEST', 'isLeapMonth must be a boolean or null.');
  }
  if (timeKnown && birthTime === null) {
    throw new ApiCommandError('INVALID_REQUEST', 'birthTime is required when timeKnown is true.');
  }
  if (!timeKnown && birthTime !== null) {
    throw new ApiCommandError('INVALID_REQUEST', 'birthTime must be null when timeKnown is false.');
  }
  if (calendarType === 'solar' && isLeapMonth === true) {
    throw new ApiCommandError('INVALID_REQUEST', 'Solar Birth input cannot be marked as a leap month.');
  }

  return Object.freeze({
    calendarType,
    birthDate,
    birthTime,
    timeKnown,
    isLeapMonth,
    sex,
  });
}

function parseNullableMetadataLabel(name: string, value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new ApiCommandError('INVALID_REQUEST', `${name} must be a string or null.`);
  }

  // Source defines nullable stored metadata but does not define trim/empty normalization.
  // Preserve the supplied string exactly instead of inventing a create-time label policy.
  return value;
}

function parseRequest(value: unknown): TargetPersonCreateRequestV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiCommandError('INVALID_REQUEST', 'Target Person create request must be an object.');
  }

  const request = value as Record<string, unknown>;
  rejectUnknownKeys(
    request,
    ['displayLabel', 'relationshipLabel', 'input'],
    'Target Person create request contains unsupported fields.',
  );
  if (!Object.prototype.hasOwnProperty.call(request, 'input')) {
    throw new ApiCommandError('INVALID_REQUEST', 'Target Person create request requires input.');
  }

  return Object.freeze({
    displayLabel: parseNullableMetadataLabel('displayLabel', request.displayLabel),
    relationshipLabel: parseNullableMetadataLabel('relationshipLabel', request.relationshipLabel),
    input: parseBirthInput(request.input),
  });
}

function requireServerString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Target Person ${name} is invalid.`);
  }
  return value;
}

function requireFingerprint(value: unknown): string {
  const fingerprint = requireServerString('input fingerprint', value);
  if (!fingerprint.includes(':')) {
    throw new Error('Target Person Birth input fingerprint is not version-prefixed.');
  }
  return fingerprint;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof TargetPersonCreateAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'SUBJECT_NOT_FOUND':
    case 'SUBJECT_INELIGIBLE':
      throw new ApiCommandError('NOT_FOUND', 'Target Person is unavailable for the current subject.');
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', 'Target Person input is invalid.');
    case 'SERVER_ID_CONFLICT':
      throw new Error('Target Person authority rejected trusted server-owned identity.');
  }
}

function assembleResponse(
  row: TargetPersonCreateAuthorityRowV1,
  targetPersonId: string,
  birthProfileId: string,
  revisionId: string,
): CreateTargetPersonResponseV1 {
  if (row.targetPersonId !== targetPersonId) {
    throw new Error('Target Person authority returned a different target identity.');
  }
  if (row.birthProfileId !== birthProfileId) {
    throw new Error('Target Person authority returned a different Birth Profile identity.');
  }
  if (row.revisionId !== revisionId) {
    throw new Error('Target Person authority returned a different Birth revision identity.');
  }
  if (row.revisionNo !== 1) {
    throw new Error('Target Person authority did not create Birth revision 1.');
  }

  return Object.freeze({
    targetPersonId,
    birthProfileId,
    revisionId,
    revisionNo: 1,
  });
}

export async function createTargetPerson(
  input: CreateTargetPersonInputV1,
): Promise<CreateTargetPersonResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const request = parseRequest(input.request);

  const targetPersonId = requireServerString(
    'generated target id',
    await input.idPort.nextTargetPersonId(),
  );
  const birthProfileId = requireServerString(
    'generated Birth Profile id',
    await input.idPort.nextBirthProfileId(),
  );
  const revisionId = requireServerString(
    'generated Birth revision id',
    await input.idPort.nextBirthRevisionId(),
  );
  const inputHash = requireFingerprint(
    await input.fingerprintPort.fingerprintBirthInput(request.input),
  );

  try {
    const rows = await input.authorityPort.createTargetPerson({
      subjectId,
      targetPersonId,
      birthProfileId,
      revisionId,
      displayLabel: request.displayLabel ?? null,
      relationshipLabel: request.relationshipLabel ?? null,
      calendarType: request.input.calendarType,
      birthDate: request.input.birthDate,
      birthTime: request.input.birthTime,
      timeKnown: request.input.timeKnown,
      isLeapMonth: request.input.isLeapMonth,
      sex: request.input.sex,
      inputHash,
    });

    if (rows.length !== 1) {
      throw new Error('Target Person authority must return exactly one successful row.');
    }
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Target Person authority returned an impossible empty successful row.');
    }
    return assembleResponse(row, targetPersonId, birthProfileId, revisionId);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
