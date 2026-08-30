import { ApiCommandError } from './chat-receive.js';
import type {
  BirthCalendarTypeV1,
  BirthInputFingerprintPortV1,
  BirthInputV1,
  BirthSexV1,
} from './birth-profile-create-command.js';

export const BIRTH_PROFILE_REVISION_APPEND_AUTHORITY_BINDING_V1 =
  'public.cmd_append_birth_profile_revision_v1' as const;

type Awaitable<T> = T | Promise<T>;

export interface BirthProfileRevisionAppendRequestV1 {
  readonly expectedRevisionId: string;
  readonly input: BirthInputV1;
}

export interface BirthProfileRevisionAppendAuthorityRowV1 {
  readonly birthProfileId: string;
  readonly revisionId: string;
  readonly revisionNo: number;
  readonly replayed: boolean;
}

export type BirthProfileRevisionAppendAuthorityFailureCodeV1 =
  | 'PROFILE_NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'REPLAY_CONFLICT'
  | 'INVALID_INPUT'
  | 'SERVER_ID_CONFLICT';

export class BirthProfileRevisionAppendAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: BirthProfileRevisionAppendAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'BirthProfileRevisionAppendAuthorityPortErrorV1';
  }
}

/** Server-owned identity for the new immutable revision. */
export interface BirthProfileRevisionAppendIdPortV1 {
  nextBirthRevisionId(): Awaitable<string>;
}

/**
 * Persistence authority for PATCH /api/birth-profiles/:id.
 *
 * The verified DB command locks the logical profile, compares the exact current
 * revision pointer, appends one immutable revision, and advances current_revision_id
 * atomically. P0-AUTH-01 remains open, so this slice exposes no PostgreSQL adapter.
 */
export interface BirthProfileRevisionAppendAuthorityPortV1 {
  appendBirthProfileRevision(input: {
    readonly subjectId: string;
    readonly birthProfileId: string;
    readonly expectedCurrentRevisionId: string;
    readonly revisionId: string;
    readonly calendarType: BirthCalendarTypeV1;
    readonly birthDate: string;
    readonly birthTime: string | null;
    readonly timeKnown: boolean;
    readonly isLeapMonth: boolean | null;
    readonly sex: BirthSexV1;
    readonly inputHash: string;
  }): Awaitable<readonly BirthProfileRevisionAppendAuthorityRowV1[]>;
}

export interface AppendBirthProfileRevisionInputV1 {
  readonly resolvedSubjectId?: string;
  readonly birthProfileId: string;
  readonly request: unknown;
  readonly idPort: BirthProfileRevisionAppendIdPortV1;
  readonly fingerprintPort: BirthInputFingerprintPortV1;
  readonly authorityPort: BirthProfileRevisionAppendAuthorityPortV1;
}

export interface AppendBirthProfileRevisionResponseV1 {
  readonly birthProfileId: string;
  readonly revisionId: string;
  readonly revisionNo: number;
}

function requireNonBlank(name: string, value: unknown, code: 'AUTH_REQUIRED' | 'INVALID_REQUEST'): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError(code, `${name} is required.`);
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

function parseRequest(value: unknown): BirthProfileRevisionAppendRequestV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiCommandError('INVALID_REQUEST', 'Birth Profile patch request must be an object.');
  }

  const request = value as Record<string, unknown>;
  rejectUnknownKeys(
    request,
    ['expectedRevisionId', 'input'],
    'Birth Profile patch request contains unsupported fields.',
  );
  if (!Object.prototype.hasOwnProperty.call(request, 'input')) {
    throw new ApiCommandError('INVALID_REQUEST', 'Birth Profile patch request requires input.');
  }

  return Object.freeze({
    expectedRevisionId: requireNonBlank('expectedRevisionId', request.expectedRevisionId, 'INVALID_REQUEST'),
    input: parseBirthInput(request.input),
  });
}

function requireServerString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Birth revision ${name} is invalid.`);
  }
  return value;
}

function requireFingerprint(value: unknown): string {
  const fingerprint = requireServerString('input fingerprint', value);
  if (!fingerprint.includes(':')) {
    throw new Error('Birth revision input fingerprint is not version-prefixed.');
  }
  return fingerprint;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof BirthProfileRevisionAppendAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'PROFILE_NOT_FOUND':
      throw new ApiCommandError('NOT_FOUND', 'Birth Profile is unavailable for the current subject.');
    case 'REVISION_CONFLICT':
      throw new ApiCommandError('REVISION_CONFLICT', 'Birth Profile current revision has changed.');
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', 'Birth Profile input is invalid.');
    case 'REPLAY_CONFLICT':
      throw new Error('Birth revision authority detected a trusted server replay identity conflict.');
    case 'SERVER_ID_CONFLICT':
      throw new Error('Birth revision authority rejected trusted server-owned identity.');
  }
}

function assembleResponse(
  row: BirthProfileRevisionAppendAuthorityRowV1,
  birthProfileId: string,
  revisionId: string,
): AppendBirthProfileRevisionResponseV1 {
  if (row.birthProfileId !== birthProfileId) {
    throw new Error('Birth revision authority returned a different profile identity.');
  }
  if (row.revisionId !== revisionId) {
    throw new Error('Birth revision authority returned a different revision identity.');
  }
  if (!Number.isSafeInteger(row.revisionNo) || row.revisionNo < 2) {
    throw new Error('Birth revision authority returned an invalid appended revision number.');
  }
  if (typeof row.replayed !== 'boolean') {
    throw new Error('Birth revision authority returned an invalid replay marker.');
  }

  return Object.freeze({
    birthProfileId,
    revisionId,
    revisionNo: row.revisionNo,
  });
}

export async function appendBirthProfileRevision(
  input: AppendBirthProfileRevisionInputV1,
): Promise<AppendBirthProfileRevisionResponseV1> {
  const subjectId = requireNonBlank('resolved subject', input.resolvedSubjectId, 'AUTH_REQUIRED');
  const birthProfileId = requireNonBlank('birthProfileId', input.birthProfileId, 'INVALID_REQUEST');
  const request = parseRequest(input.request);
  const inputHash = requireFingerprint(
    await input.fingerprintPort.fingerprintBirthInput(request.input),
  );
  const revisionId = requireServerString(
    'generated revision id',
    await input.idPort.nextBirthRevisionId(),
  );

  try {
    const rows = await input.authorityPort.appendBirthProfileRevision({
      subjectId,
      birthProfileId,
      expectedCurrentRevisionId: request.expectedRevisionId,
      revisionId,
      calendarType: request.input.calendarType,
      birthDate: request.input.birthDate,
      birthTime: request.input.birthTime,
      timeKnown: request.input.timeKnown,
      isLeapMonth: request.input.isLeapMonth,
      sex: request.input.sex,
      inputHash,
    });
    if (rows.length !== 1) {
      throw new Error('Birth revision authority must return exactly one successful row.');
    }
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Birth revision authority returned an impossible empty successful row.');
    }
    return assembleResponse(row, birthProfileId, revisionId);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
