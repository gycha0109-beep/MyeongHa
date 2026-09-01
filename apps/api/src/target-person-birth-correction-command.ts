import { ApiCommandError } from './api-error.js';
import {
  appendBirthProfileRevision,
  BIRTH_PROFILE_REVISION_APPEND_AUTHORITY_BINDING_V1,
  type AppendBirthProfileRevisionResponseV1,
  type BirthProfileRevisionAppendAuthorityPortV1,
  type BirthProfileRevisionAppendIdPortV1,
  type BirthProfileRevisionAppendRequestV1,
} from './birth-profile-revision-append-command.js';
import type { BirthInputFingerprintPortV1 } from './birth-profile-create-command.js';
import {
  getTargetPerson,
  TARGET_PERSON_READ_AUTHORITY_BINDINGS_V1,
  type TargetPersonReadAuthorityPortV1,
} from './target-person-read.js';

export const TARGET_PERSON_BIRTH_CORRECTION_AUTHORITY_BINDINGS_V1 = Object.freeze({
  targetPersonRead: TARGET_PERSON_READ_AUTHORITY_BINDINGS_V1.readCurrent,
  birthRevisionAppend: BIRTH_PROFILE_REVISION_APPEND_AUTHORITY_BINDING_V1,
} as const);

export type TargetPersonBirthCorrectionRequestV1 = BirthProfileRevisionAppendRequestV1;

export interface CorrectTargetPersonBirthInputV1 {
  readonly resolvedSubjectId?: string;
  readonly targetPersonId: unknown;
  readonly request: unknown;
  readonly targetPersonAuthorityPort: TargetPersonReadAuthorityPortV1;
  readonly revisionIdPort: BirthProfileRevisionAppendIdPortV1;
  readonly fingerprintPort: BirthInputFingerprintPortV1;
  readonly birthRevisionAuthorityPort: BirthProfileRevisionAppendAuthorityPortV1;
}

export interface CorrectTargetPersonBirthResponseV1 {
  readonly targetPersonId: string;
  readonly birthProfileId: string;
  readonly revisionId: string;
  readonly revisionNo: number;
}

function requireNonBlank(
  name: string,
  value: unknown,
  code: 'AUTH_REQUIRED' | 'INVALID_REQUEST',
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError(code, `${name} is required.`);
  }
  return value;
}

function assertBirthCorrectionRequest(value: unknown): BirthProfileRevisionAppendRequestV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiCommandError('INVALID_REQUEST', 'Target Person Birth correction request must be an object.');
  }

  const request = value as Record<string, unknown>;
  const allowed = ['expectedRevisionId', 'input'] as const;
  if (Object.keys(request).some((key) => !allowed.includes(key as (typeof allowed)[number]))) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'Target Person PATCH accepts Birth correction fields only; metadata mutation is not authoritative.',
    );
  }
  if (!Object.prototype.hasOwnProperty.call(request, 'input')) {
    throw new ApiCommandError('INVALID_REQUEST', 'Target Person Birth correction request requires input.');
  }

  return Object.freeze({
    expectedRevisionId: requireNonBlank(
      'expectedRevisionId',
      request.expectedRevisionId,
      'INVALID_REQUEST',
    ),
    input: request.input as BirthProfileRevisionAppendRequestV1['input'],
  });
}

function requireTrustedTargetBinding(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Target Person authority returned an invalid ${name}.`);
  }
  return value;
}

function assembleResponse(
  targetPersonId: string,
  appended: AppendBirthProfileRevisionResponseV1,
): CorrectTargetPersonBirthResponseV1 {
  return Object.freeze({
    targetPersonId,
    birthProfileId: appended.birthProfileId,
    revisionId: appended.revisionId,
    revisionNo: appended.revisionNo,
  });
}

/**
 * Source-safe Birth-input correction boundary for PATCH /api/target-persons/:id.
 *
 * Target metadata mutation remains blocked by SRC-28. This boundary resolves the
 * owner-scoped Target Person to its linked target Birth Profile, then delegates the
 * immutable append + current pointer CAS to the existing Birth revision authority.
 * P0-AUTH-01 remains open, so no PostgreSQL adapter is introduced here.
 */
export async function correctTargetPersonBirth(
  input: CorrectTargetPersonBirthInputV1,
): Promise<CorrectTargetPersonBirthResponseV1> {
  const subjectId = requireNonBlank('resolved subject', input.resolvedSubjectId, 'AUTH_REQUIRED');
  const targetPersonId = requireNonBlank('targetPersonId', input.targetPersonId, 'INVALID_REQUEST');
  const request = assertBirthCorrectionRequest(input.request);

  const target = await getTargetPerson({
    resolvedSubjectId: subjectId,
    targetPersonId,
    authorityPort: input.targetPersonAuthorityPort,
  });
  const birthProfileId = requireTrustedTargetBinding('target Birth Profile identity', target.birthProfileId);

  const appended = await appendBirthProfileRevision({
    resolvedSubjectId: subjectId,
    birthProfileId,
    request,
    idPort: input.revisionIdPort,
    fingerprintPort: input.fingerprintPort,
    authorityPort: input.birthRevisionAuthorityPort,
  });

  return assembleResponse(targetPersonId, appended);
}
