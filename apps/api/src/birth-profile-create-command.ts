import { ApiCommandError } from './chat-receive.js';

export const BIRTH_PROFILE_CREATE_AUTHORITY_BINDING_V1 =
  'public.cmd_create_birth_profile_v1' as const;

type Awaitable<T> = T | Promise<T>;

export type BirthCalendarTypeV1 = 'solar' | 'lunar';
export type BirthSexV1 = 'male' | 'female' | 'unspecified' | null;

export interface BirthInputV1 {
  readonly calendarType: BirthCalendarTypeV1;
  readonly birthDate: string;
  readonly birthTime: string | null;
  readonly timeKnown: boolean;
  readonly isLeapMonth: boolean | null;
  readonly sex: BirthSexV1;
}

export interface BirthProfileCreateRequestV1 {
  readonly label: string | null;
  readonly input: BirthInputV1;
}

export interface BirthProfileCreateAuthorityRowV1 {
  readonly birthProfileId: string;
  readonly revisionId: string;
  readonly revisionNo: number;
}

export type BirthProfileCreateAuthorityFailureCodeV1 =
  | 'SUBJECT_NOT_FOUND'
  | 'SUBJECT_INELIGIBLE'
  | 'ACTIVE_SELF_EXISTS'
  | 'INVALID_INPUT'
  | 'SERVER_ID_CONFLICT';

export class BirthProfileCreateAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: BirthProfileCreateAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'BirthProfileCreateAuthorityPortErrorV1';
  }
}

/** Server-owned aggregate identities. Neither id is accepted from the client body. */
export interface BirthProfileCreateIdPortV1 {
  nextBirthProfileId(): Awaitable<string>;
  nextBirthRevisionId(): Awaitable<string>;
}

/**
 * Produces the version-prefixed integrity/idempotency provenance stored on the immutable
 * Birth revision. Birth input is low-entropy personal data, so the production binding
 * should use a keyed/versioned fingerprint rather than a plain unsalted digest.
 *
 * P0-AUTH-01 remains open, therefore this API slice defines the port only and does not
 * choose a deployment key store or PostgreSQL execution identity.
 */
export interface BirthInputFingerprintPortV1 {
  fingerprintBirthInput(input: BirthInputV1): Awaitable<string>;
}

/**
 * Persistence authority for POST /api/birth-profiles only.
 *
 * The verified DB command creates one logical self profile plus immutable revision 1
 * atomically and enforces the one-active-self constraint under subject locking. This
 * port deliberately does not expose a PostgreSQL adapter while P0-AUTH-01 is unresolved.
 */
export interface BirthProfileCreateAuthorityPortV1 {
  createSelfBirthProfile(input: {
    readonly subjectId: string;
    readonly birthProfileId: string;
    readonly revisionId: string;
    readonly label: string | null;
    readonly calendarType: BirthCalendarTypeV1;
    readonly birthDate: string;
    readonly birthTime: string | null;
    readonly timeKnown: boolean;
    readonly isLeapMonth: boolean | null;
    readonly sex: BirthSexV1;
    readonly inputHash: string;
  }): Awaitable<readonly BirthProfileCreateAuthorityRowV1[]>;
}

export interface CreateBirthProfileInputV1 {
  readonly resolvedSubjectId?: string;
  readonly request: unknown;
  readonly idPort: BirthProfileCreateIdPortV1;
  readonly fingerprintPort: BirthInputFingerprintPortV1;
  readonly authorityPort: BirthProfileCreateAuthorityPortV1;
}

export interface CreateBirthProfileResponseV1 {
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

function rejectUnknownKeys(record: Record<string, unknown>, allowed: readonly string[], message: string): void {
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
    throw new ApiCommandError('INVALID_REQUEST', 'Birth input must be an object.');
  }

  const input = value as Record<string, unknown>;
  rejectUnknownKeys(
    input,
    ['calendarType', 'birthDate', 'birthTime', 'timeKnown', 'isLeapMonth', 'sex'],
    'Birth input contains unsupported fields.',
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

function parseRequest(value: unknown): BirthProfileCreateRequestV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiCommandError('INVALID_REQUEST', 'Birth Profile create request must be an object.');
  }

  const request = value as Record<string, unknown>;
  rejectUnknownKeys(request, ['label', 'input'], 'Birth Profile create request contains unsupported fields.');
  if (!Object.prototype.hasOwnProperty.call(request, 'input')) {
    throw new ApiCommandError('INVALID_REQUEST', 'Birth Profile create request requires input.');
  }

  const label = request.label ?? null;
  if (label !== null && typeof label !== 'string') {
    throw new ApiCommandError('INVALID_REQUEST', 'label must be a string or null.');
  }

  return Object.freeze({
    label,
    input: parseBirthInput(request.input),
  });
}

function requireServerString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Birth Profile ${name} is invalid.`);
  }
  return value;
}

function requireFingerprint(value: unknown): string {
  const fingerprint = requireServerString('input fingerprint', value);
  if (!fingerprint.includes(':')) {
    throw new Error('Birth Profile input fingerprint is not version-prefixed.');
  }
  return fingerprint;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof BirthProfileCreateAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'SUBJECT_NOT_FOUND':
    case 'SUBJECT_INELIGIBLE':
      throw new ApiCommandError('NOT_FOUND', 'Birth Profile is unavailable for the current subject.');
    case 'ACTIVE_SELF_EXISTS':
      throw new ApiCommandError('INVALID_REQUEST', 'An active self Birth Profile already exists.');
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', 'Birth Profile input is invalid.');
    case 'SERVER_ID_CONFLICT':
      throw new Error('Birth Profile authority rejected trusted server-owned identity.');
  }
}

function assembleResponse(
  row: BirthProfileCreateAuthorityRowV1,
  birthProfileId: string,
  revisionId: string,
): CreateBirthProfileResponseV1 {
  if (row.birthProfileId !== birthProfileId) {
    throw new Error('Birth Profile authority returned a different aggregate identity.');
  }
  if (row.revisionId !== revisionId) {
    throw new Error('Birth Profile authority returned a different first revision identity.');
  }
  if (row.revisionNo !== 1) {
    throw new Error('Birth Profile authority did not create revision 1.');
  }

  return Object.freeze({
    birthProfileId,
    revisionId,
    revisionNo: 1,
  });
}

export async function createBirthProfile(
  input: CreateBirthProfileInputV1,
): Promise<CreateBirthProfileResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const request = parseRequest(input.request);

  const birthProfileId = requireServerString(
    'generated aggregate id',
    await input.idPort.nextBirthProfileId(),
  );
  const revisionId = requireServerString(
    'generated revision id',
    await input.idPort.nextBirthRevisionId(),
  );
  const inputHash = requireFingerprint(
    await input.fingerprintPort.fingerprintBirthInput(request.input),
  );

  try {
    const rows = await input.authorityPort.createSelfBirthProfile({
      subjectId,
      birthProfileId,
      revisionId,
      label: request.label,
      calendarType: request.input.calendarType,
      birthDate: request.input.birthDate,
      birthTime: request.input.birthTime,
      timeKnown: request.input.timeKnown,
      isLeapMonth: request.input.isLeapMonth,
      sex: request.input.sex,
      inputHash,
    });
    if (rows.length !== 1) {
      throw new Error('Birth Profile authority must return exactly one successful row.');
    }
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Birth Profile authority returned an impossible empty successful row.');
    }
    return assembleResponse(row, birthProfileId, revisionId);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
