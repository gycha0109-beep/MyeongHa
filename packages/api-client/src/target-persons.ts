import {
  MyeongHaApiClientErrorV1,
  type MyeongHaApiClientV1,
} from './http.js';
import type {
  BirthCalendarTypeV1,
  BirthSexV1,
} from './birth.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export interface TargetPersonV1 {
  readonly targetPersonId: string;
  readonly displayLabel: string | null;
  readonly relationshipLabel: string | null;
  readonly birthProfileId: string;
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
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function malformed(message: string): never {
  throw new MyeongHaApiClientErrorV1(
    'malformed_response',
    'API_TARGET_PERSON_RESPONSE_INVALID',
    message,
  );
}

export function parseTargetPersonIdV1(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'CLIENT_TARGET_PERSON_ID_INVALID',
      'Target Person id must be a UUID.',
    );
  }
  return value;
}

function requireNullableString(name: string, value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    return malformed(`Target Person ${name} is invalid.`);
  }
  return value;
}

function requirePositiveInteger(name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    return malformed(`Target Person ${name} is invalid.`);
  }
  return value;
}

function parseCalendarType(value: unknown): BirthCalendarTypeV1 {
  if (value === 'solar' || value === 'lunar') return value;
  return malformed('Target Person calendarType is invalid.');
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
  return malformed('Target Person sex is invalid.');
}

function parseTargetPerson(value: unknown): TargetPersonV1 {
  if (!isRecord(value) || !isRecord(value.currentRevision)) {
    return malformed('Target Person response is invalid.');
  }
  const revision = value.currentRevision;
  if (!isRecord(revision.input)) {
    return malformed('Target Person current revision input is invalid.');
  }
  const input = revision.input;
  if (typeof input.timeKnown !== 'boolean') {
    return malformed('Target Person timeKnown is invalid.');
  }
  const birthTime = requireNullableString('birthTime', input.birthTime);
  if (input.timeKnown && birthTime === null) {
    return malformed('Target Person known birth time is missing.');
  }
  if (!input.timeKnown && birthTime !== null) {
    return malformed('Target Person unknown birth time unexpectedly contains a value.');
  }
  if (typeof input.isLeapMonth !== 'boolean') {
    return malformed('Target Person isLeapMonth is invalid.');
  }
  const calendarType = parseCalendarType(input.calendarType);
  if (calendarType === 'solar' && input.isLeapMonth) {
    return malformed('Solar Target Person birth input cannot be a leap month.');
  }
  if (typeof input.birthDate !== 'string' || !DATE_PATTERN.test(input.birthDate)) {
    return malformed('Target Person birthDate is invalid.');
  }

  return Object.freeze({
    targetPersonId: parseTargetPersonIdV1(value.targetPersonId),
    displayLabel: requireNullableString('displayLabel', value.displayLabel),
    relationshipLabel: requireNullableString(
      'relationshipLabel',
      value.relationshipLabel,
    ),
    birthProfileId: parseTargetPersonIdV1(value.birthProfileId),
    currentRevision: Object.freeze({
      revisionId: parseTargetPersonIdV1(revision.revisionId),
      revisionNo: requirePositiveInteger('revisionNo', revision.revisionNo),
      input: Object.freeze({
        calendarType,
        birthDate: input.birthDate,
        birthTime,
        timeKnown: input.timeKnown,
        isLeapMonth: input.isLeapMonth,
        sex: parseSex(input.sex),
      }),
    }),
  });
}

function assertDistinctTargets(items: readonly TargetPersonV1[]): void {
  const targetIds = new Set<string>();
  const birthProfileIds = new Set<string>();
  for (const item of items) {
    if (targetIds.has(item.targetPersonId)) {
      return malformed('Target Person list contains a duplicate target id.');
    }
    if (birthProfileIds.has(item.birthProfileId)) {
      return malformed('Target Person list contains a duplicate Birth Profile id.');
    }
    targetIds.add(item.targetPersonId);
    birthProfileIds.add(item.birthProfileId);
  }
}

export async function listTargetPersonsV1(
  client: MyeongHaApiClientV1,
  bearer: string,
): Promise<readonly TargetPersonV1[]> {
  const data = await client.requestData({
    method: 'GET',
    path: '/api/target-persons',
    bearer,
  });
  if (!Array.isArray(data)) {
    return malformed('Target Person list response must be an array.');
  }
  const items = Object.freeze(data.map(parseTargetPerson));
  assertDistinctTargets(items);
  return items;
}

export async function readTargetPersonV1(
  client: MyeongHaApiClientV1,
  bearer: string,
  targetPersonIdInput: unknown,
): Promise<TargetPersonV1> {
  const targetPersonId = parseTargetPersonIdV1(targetPersonIdInput);
  const data = await client.requestData({
    method: 'GET',
    path: `/api/target-persons/${targetPersonId}`,
    bearer,
  });
  const item = parseTargetPerson(data);
  if (item.targetPersonId !== targetPersonId) {
    return malformed('Target Person detail returned a different target id.');
  }
  return item;
}
