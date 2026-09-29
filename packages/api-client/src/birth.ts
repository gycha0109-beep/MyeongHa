import {
  MyeongHaApiClientErrorV1,
  type MyeongHaApiClientV1,
} from './http.js';

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

export interface BirthProfileCreateReceiptV1 {
  readonly birthProfileId: string;
  readonly revisionId: string;
  readonly revisionNo: 1;
}

export interface CurrentBirthProfileV1 {
  readonly birthProfileId: string;
  readonly profileKind: 'self';
  readonly label: string | null;
  readonly archivedAt: null;
  readonly currentRevision: Readonly<{
    revisionId: string;
    revisionNo: number;
    input: Readonly<{
      calendarType: BirthCalendarTypeV1;
      birthDate: string;
      birthTime: string | null;
      timeKnown: boolean;
      isLeapMonth: boolean;
      sex: BirthSexV1;
    }>;
  }>;
  readonly revisions: readonly Readonly<{
    revisionId: string;
    revisionNo: number;
    isCurrent: boolean;
  }>[];
}

function malformed(code: string, message: string): never {
  throw new MyeongHaApiClientErrorV1('malformed_response', code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return malformed('API_BIRTH_RESPONSE_INVALID', `Birth response ${name} is invalid.`);
  }
  return value;
}

function requirePositiveInteger(name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    return malformed('API_BIRTH_RESPONSE_INVALID', `Birth response ${name} is invalid.`);
  }
  return value;
}

function requireBoolean(name: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    return malformed('API_BIRTH_RESPONSE_INVALID', `Birth response ${name} is invalid.`);
  }
  return value;
}

function requireNullableString(name: string, value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    return malformed('API_BIRTH_RESPONSE_INVALID', `Birth response ${name} is invalid.`);
  }
  return value;
}

function parseCalendarType(value: unknown): BirthCalendarTypeV1 {
  if (value === 'solar' || value === 'lunar') return value;
  return malformed('API_BIRTH_RESPONSE_INVALID', 'Birth response calendar type is invalid.');
}

function parseSex(value: unknown): BirthSexV1 {
  if (value === null || value === 'male' || value === 'female' || value === 'unspecified') {
    return value;
  }
  return malformed('API_BIRTH_RESPONSE_INVALID', 'Birth response sex is invalid.');
}

function parseBirthDate(value: unknown): string {
  const date = requireString('birth date', value);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    return malformed('API_BIRTH_RESPONSE_INVALID', 'Birth response birth date is invalid.');
  }
  return date;
}

function parseCreateReceipt(value: unknown): BirthProfileCreateReceiptV1 {
  if (!isRecord(value)) {
    return malformed('API_BIRTH_RESPONSE_INVALID', 'Birth create receipt is invalid.');
  }
  if (value.revisionNo !== 1) {
    return malformed('API_BIRTH_RESPONSE_INVALID', 'Birth create receipt must identify revision 1.');
  }
  return Object.freeze({
    birthProfileId: requireString('birth profile id', value.birthProfileId),
    revisionId: requireString('birth revision id', value.revisionId),
    revisionNo: 1,
  });
}

function parseCurrentBirthProfile(value: unknown): CurrentBirthProfileV1 | null {
  if (value === null) return null;
  if (!isRecord(value)) {
    return malformed('API_BIRTH_RESPONSE_INVALID', 'Current Birth Profile response is invalid.');
  }
  if (value.profileKind !== 'self' || value.archivedAt !== null) {
    return malformed(
      'API_BIRTH_RESPONSE_INVALID',
      'Current Birth Profile is not an active self profile.',
    );
  }
  if (!isRecord(value.currentRevision)) {
    return malformed('API_BIRTH_RESPONSE_INVALID', 'Current Birth revision is invalid.');
  }
  if (!isRecord(value.currentRevision.input)) {
    return malformed('API_BIRTH_RESPONSE_INVALID', 'Current Birth input is invalid.');
  }
  if (!Array.isArray(value.revisions) || value.revisions.length === 0) {
    return malformed('API_BIRTH_RESPONSE_INVALID', 'Current Birth revision list is invalid.');
  }

  const revisionId = requireString('current revision id', value.currentRevision.revisionId);
  const revisionNo = requirePositiveInteger('current revision number', value.currentRevision.revisionNo);
  const input = value.currentRevision.input;

  const timeKnown = requireBoolean('time-known flag', input.timeKnown);
  const birthTime = requireNullableString('birth time', input.birthTime);
  if ((timeKnown && birthTime === null) || (!timeKnown && birthTime !== null)) {
    return malformed('API_BIRTH_RESPONSE_INVALID', 'Current Birth time certainty is inconsistent.');
  }

  const revisions = Object.freeze(value.revisions.map((entry, index) => {
    if (!isRecord(entry)) {
      return malformed(
        'API_BIRTH_RESPONSE_INVALID',
        `Current Birth revision ${String(index)} is invalid.`,
      );
    }
    return Object.freeze({
      revisionId: requireString('revision id', entry.revisionId),
      revisionNo: requirePositiveInteger('revision number', entry.revisionNo),
      isCurrent: requireBoolean('current revision flag', entry.isCurrent),
    });
  }));

  const currentMatches = revisions.filter(
    (entry) => entry.isCurrent && entry.revisionId === revisionId && entry.revisionNo === revisionNo,
  );
  if (currentMatches.length !== 1) {
    return malformed(
      'API_BIRTH_RESPONSE_INVALID',
      'Current Birth revision identity does not match the revision list.',
    );
  }

  return Object.freeze({
    birthProfileId: requireString('birth profile id', value.birthProfileId),
    profileKind: 'self',
    label: requireNullableString('label', value.label),
    archivedAt: null,
    currentRevision: Object.freeze({
      revisionId,
      revisionNo,
      input: Object.freeze({
        calendarType: parseCalendarType(input.calendarType),
        birthDate: parseBirthDate(input.birthDate),
        birthTime,
        timeKnown,
        isLeapMonth: requireBoolean('leap-month flag', input.isLeapMonth),
        sex: parseSex(input.sex),
      }),
    }),
    revisions,
  });
}

function validateCreateRequest(request: BirthProfileCreateRequestV1): BirthProfileCreateRequestV1 {
  const input = request.input;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.birthDate)) {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'CLIENT_BIRTH_INPUT_INVALID',
      'Birth date must use YYYY-MM-DD.',
    );
  }
  if ((input.timeKnown && input.birthTime === null) || (!input.timeKnown && input.birthTime !== null)) {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'CLIENT_BIRTH_INPUT_INVALID',
      'Birth time and time-known flag are inconsistent.',
    );
  }
  if (input.calendarType === 'solar' && input.isLeapMonth === true) {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'CLIENT_BIRTH_INPUT_INVALID',
      'Solar Birth input cannot be a leap month.',
    );
  }
  return request;
}

export async function readCurrentBirthProfileV1(
  client: MyeongHaApiClientV1,
  bearer: string,
): Promise<CurrentBirthProfileV1 | null> {
  return parseCurrentBirthProfile(await client.requestData({
    method: 'GET',
    path: '/api/me/birth-profile',
    bearer,
  }));
}

export async function createBirthProfileV1(
  client: MyeongHaApiClientV1,
  bearer: string,
  request: BirthProfileCreateRequestV1,
): Promise<BirthProfileCreateReceiptV1> {
  return parseCreateReceipt(await client.requestData({
    method: 'POST',
    path: '/api/birth-profiles',
    bearer,
    body: validateCreateRequest(request),
  }));
}
