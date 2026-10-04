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
  readonly archivedAt: string | null;
  readonly currentRevision: Readonly<{
    revisionId: string;
    revisionNo: number;
    input: BirthInputV1;
  }>;
  readonly revisions: readonly Readonly<{
    revisionId: string;
    revisionNo: number;
    isCurrent: boolean;
  }>[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function malformed(code: string, message: string): never {
  throw new MyeongHaApiClientErrorV1('malformed_response', code, message);
}

function requireString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return malformed('API_BIRTH_RESPONSE_INVALID', `Birth Profile ${name} is invalid.`);
  }
  return value;
}

function requirePositiveInteger(name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    return malformed('API_BIRTH_RESPONSE_INVALID', `Birth Profile ${name} is invalid.`);
  }
  return value;
}

function requireNullableString(name: string, value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    return malformed('API_BIRTH_RESPONSE_INVALID', `Birth Profile ${name} is invalid.`);
  }
  return value;
}

function requireNullableTimestamp(name: string, value: unknown): string | null {
  if (value === null) return null;
  const timestamp = requireString(name, value);
  if (!Number.isFinite(Date.parse(timestamp))) {
    return malformed('API_BIRTH_RESPONSE_INVALID', `Birth Profile ${name} is invalid.`);
  }
  return timestamp;
}

function parseCalendarType(value: unknown): BirthCalendarTypeV1 {
  if (value === 'solar' || value === 'lunar') return value;
  return malformed('API_BIRTH_RESPONSE_INVALID', 'Birth Profile calendarType is invalid.');
}

function parseSex(value: unknown): BirthSexV1 {
  if (
    value === null ||
    value === 'male' ||
    value === 'female' ||
    value === 'unspecified'
  ) {
    return value;
  }
  return malformed('API_BIRTH_RESPONSE_INVALID', 'Birth Profile sex is invalid.');
}

function parseBirthInput(value: unknown): BirthInputV1 {
  if (!isRecord(value)) {
    return malformed('API_BIRTH_RESPONSE_INVALID', 'Birth Profile input is invalid.');
  }
  if (typeof value.timeKnown !== 'boolean') {
    return malformed('API_BIRTH_RESPONSE_INVALID', 'Birth Profile timeKnown is invalid.');
  }
  const birthTime = requireNullableString('birthTime', value.birthTime);
  if (value.timeKnown && birthTime === null) {
    return malformed('API_BIRTH_RESPONSE_INVALID', 'Known birth time is missing.');
  }
  if (!value.timeKnown && birthTime !== null) {
    return malformed('API_BIRTH_RESPONSE_INVALID', 'Unknown birth time unexpectedly contains a value.');
  }
  const isLeapMonth = value.isLeapMonth;
  if (isLeapMonth !== null && typeof isLeapMonth !== 'boolean') {
    return malformed('API_BIRTH_RESPONSE_INVALID', 'Birth Profile isLeapMonth is invalid.');
  }

  return Object.freeze({
    calendarType: parseCalendarType(value.calendarType),
    birthDate: requireString('birthDate', value.birthDate),
    birthTime,
    timeKnown: value.timeKnown,
    isLeapMonth,
    sex: parseSex(value.sex),
  });
}

function parseCurrentBirthProfile(value: unknown): CurrentBirthProfileV1 {
  if (!isRecord(value) || value.profileKind !== 'self') {
    return malformed('API_BIRTH_RESPONSE_INVALID', 'Current Birth Profile is invalid.');
  }
  if (!isRecord(value.currentRevision)) {
    return malformed('API_BIRTH_RESPONSE_INVALID', 'Current Birth Profile revision is invalid.');
  }
  if (!Array.isArray(value.revisions)) {
    return malformed('API_BIRTH_RESPONSE_INVALID', 'Birth Profile revisions are invalid.');
  }

  const currentRevision = Object.freeze({
    revisionId: requireString('current revision id', value.currentRevision.revisionId),
    revisionNo: requirePositiveInteger('current revision number', value.currentRevision.revisionNo),
    input: parseBirthInput(value.currentRevision.input),
  });

  const revisions = Object.freeze(
    value.revisions.map((revision, index) => {
      if (!isRecord(revision) || typeof revision.isCurrent !== 'boolean') {
        return malformed(
          'API_BIRTH_RESPONSE_INVALID',
          `Birth Profile revision ${String(index)} is invalid.`,
        );
      }
      return Object.freeze({
        revisionId: requireString('revision id', revision.revisionId),
        revisionNo: requirePositiveInteger('revision number', revision.revisionNo),
        isCurrent: revision.isCurrent,
      });
    }),
  );

  if (
    revisions.filter((revision) => revision.isCurrent).length !== 1 ||
    !revisions.some(
      (revision) =>
        revision.isCurrent &&
        revision.revisionId === currentRevision.revisionId &&
        revision.revisionNo === currentRevision.revisionNo,
    )
  ) {
    return malformed(
      'API_BIRTH_RESPONSE_INVALID',
      'Birth Profile current revision identity is inconsistent.',
    );
  }

  return Object.freeze({
    birthProfileId: requireString('id', value.birthProfileId),
    profileKind: 'self',
    label: requireNullableString('label', value.label),
    archivedAt: requireNullableTimestamp('archivedAt', value.archivedAt),
    currentRevision,
    revisions,
  });
}

function normalizeCreateRequest(input: BirthProfileCreateRequestV1): BirthProfileCreateRequestV1 {
  const calendarType = input.input.calendarType;
  if (calendarType !== 'solar' && calendarType !== 'lunar') {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'CLIENT_BIRTH_INPUT_INVALID',
      'Birth Profile calendarType is invalid.',
    );
  }
  if (typeof input.input.birthDate !== 'string' || input.input.birthDate.trim().length === 0) {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'CLIENT_BIRTH_INPUT_INVALID',
      'Birth Profile birthDate is invalid.',
    );
  }
  if (input.input.timeKnown && input.input.birthTime === null) {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'CLIENT_BIRTH_INPUT_INVALID',
      'Known birth time requires birthTime.',
    );
  }
  if (!input.input.timeKnown && input.input.birthTime !== null) {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'CLIENT_BIRTH_INPUT_INVALID',
      'Unknown birth time must not include birthTime.',
    );
  }
  if (calendarType === 'solar' && input.input.isLeapMonth === true) {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'CLIENT_BIRTH_INPUT_INVALID',
      'Solar Birth input cannot be a leap month.',
    );
  }

  return Object.freeze({
    label: input.label,
    input: Object.freeze({
      calendarType,
      birthDate: input.input.birthDate,
      birthTime: input.input.birthTime,
      timeKnown: input.input.timeKnown,
      isLeapMonth: input.input.isLeapMonth,
      sex: input.input.sex,
    }),
  });
}

export async function readCurrentBirthProfileV1(
  client: MyeongHaApiClientV1,
  bearer: string,
): Promise<CurrentBirthProfileV1 | null> {
  const data = await client.requestData({
    method: 'GET',
    path: '/api/me/birth-profile',
    bearer,
  });
  if (!isRecord(data) || !Object.prototype.hasOwnProperty.call(data, 'birthProfile')) {
    return malformed('API_BIRTH_RESPONSE_INVALID', 'Current Birth Profile response is invalid.');
  }
  return data.birthProfile === null ? null : parseCurrentBirthProfile(data.birthProfile);
}

export async function createBirthProfileV1(
  client: MyeongHaApiClientV1,
  bearer: string,
  request: BirthProfileCreateRequestV1,
): Promise<BirthProfileCreateReceiptV1> {
  const data = await client.requestData({
    method: 'POST',
    path: '/api/birth-profiles',
    bearer,
    body: normalizeCreateRequest(request),
  });
  if (!isRecord(data)) {
    return malformed('API_BIRTH_CREATE_RESPONSE_INVALID', 'Birth Profile create response is invalid.');
  }
  const revisionNo = requirePositiveInteger('created revision number', data.revisionNo);
  if (revisionNo !== 1) {
    return malformed(
      'API_BIRTH_CREATE_RESPONSE_INVALID',
      'Birth Profile create response did not return revision 1.',
    );
  }
  return Object.freeze({
    birthProfileId: requireString('created id', data.birthProfileId),
    revisionId: requireString('created revision id', data.revisionId),
    revisionNo: 1,
  });
}
