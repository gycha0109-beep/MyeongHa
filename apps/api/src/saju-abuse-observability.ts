import { createHmac } from 'node:crypto';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import type {
  ResolvedSubjectKindV1,
  VerifiedSubjectIdentityEvidenceV1,
} from './subject-identity-resolver.js';

export const SAJU_ABUSE_OBSERVATION_SCHEMA_VERSION_V1 =
  'myeongha-saju-abuse-observation-v1' as const;
export const SAJU_ABUSE_OUTCOME_SCHEMA_VERSION_V1 =
  'myeongha-saju-abuse-outcome-v1' as const;
export const SAJU_ABUSE_CLIENT_KEY_VERSION_V1 =
  'myeongha-saju-abuse-client-hmac-sha256-v1' as const;

export type SajuAbuseObservedRouteIdV1 =
  | 'api.me.saju.calculation'
  | 'api.me.saju.preview-reading';

export interface SajuAbuseObservationEventV1 {
  readonly schemaVersion: typeof SAJU_ABUSE_OBSERVATION_SCHEMA_VERSION_V1;
  readonly mode: 'observe_only';
  readonly routeId: SajuAbuseObservedRouteIdV1;
  readonly subjectKind: ResolvedSubjectKindV1;
  readonly clientKeyVersion: typeof SAJU_ABUSE_CLIENT_KEY_VERSION_V1;
  readonly clientKey: string;
  readonly requestId: string;
  readonly occurredAt: string;
}

export type SajuAbuseObservationWriterV1 = (
  event: SajuAbuseObservationEventV1,
) => void;

export interface SajuAbuseOutcomeObservationEventV1 {
  readonly schemaVersion: typeof SAJU_ABUSE_OUTCOME_SCHEMA_VERSION_V1;
  readonly mode: 'observe_only';
  readonly routeId: SajuAbuseObservedRouteIdV1;
  readonly requestId: string;
  readonly httpStatus: number;
  readonly completedAt: string;
}

export type SajuAbuseOutcomeObservationWriterV1 = (
  event: SajuAbuseOutcomeObservationEventV1,
) => void;

export interface CreateSajuAbuseObservedIdentityVerifierInputV1 {
  readonly delegate: IdentityEvidenceVerificationPortV1;
  readonly routeId: SajuAbuseObservedRouteIdV1;
  readonly requestId: string;
  readonly secret: string;
  readonly now?: () => number;
  readonly eventWriter?: SajuAbuseObservationWriterV1;
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function requireRequestId(value: string): string {
  if (!REQUEST_ID_PATTERN.test(value)) {
    throw new Error('Saju abuse observation request id is invalid.');
  }
  return value;
}

function requireSecret(value: string): string {
  if (value.length < 32) {
    throw new Error('Saju abuse observation secret is shorter than the production minimum.');
  }
  return value;
}

function evidenceIdentifier(evidence: VerifiedSubjectIdentityEvidenceV1): string {
  const value =
    evidence.kind === 'member'
      ? evidence.verifiedAuthUserId
      : evidence.verifiedGuestTokenHash;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Saju abuse observation identity evidence is invalid.');
  }
  return value;
}

export function fingerprintSajuAbuseClientV1(input: {
  readonly evidence: VerifiedSubjectIdentityEvidenceV1;
  readonly secret: string;
}): string {
  const secret = requireSecret(input.secret);
  const identifier = evidenceIdentifier(input.evidence);
  return createHmac('sha256', secret)
    .update(`${SAJU_ABUSE_CLIENT_KEY_VERSION_V1}\0`, 'utf8')
    .update(`${input.evidence.kind}\0`, 'utf8')
    .update(identifier, 'utf8')
    .digest('hex');
}

function defaultAdmissionWriter(event: SajuAbuseObservationEventV1): void {
  console.info(`MYEONGHA_SAJU_ABUSE_OBSERVATION ${JSON.stringify(event)}`);
}

function defaultOutcomeWriter(event: SajuAbuseOutcomeObservationEventV1): void {
  console.info(`MYEONGHA_SAJU_ABUSE_OBSERVATION ${JSON.stringify(event)}`);
}

function writeBestEffort<T>(
  writer: (event: T) => void,
  event: T,
): void {
  try {
    writer(event);
  } catch {
    // Baseline observability is never request authority.
  }
}

function readTimestampBestEffort(now: () => number): string | null {
  try {
    const value = now();
    if (!Number.isFinite(value)) return null;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}

export function observeSajuAbuseOutcomeV1(input: {
  readonly routeId: SajuAbuseObservedRouteIdV1;
  readonly requestId: string;
  readonly httpStatus: number;
  readonly now?: () => number;
  readonly eventWriter?: SajuAbuseOutcomeObservationWriterV1;
}): void {
  let requestId: string;
  try {
    requestId = requireRequestId(input.requestId);
  } catch {
    return;
  }
  if (
    !Number.isSafeInteger(input.httpStatus) ||
    input.httpStatus < 100 ||
    input.httpStatus > 599
  ) {
    return;
  }

  const completedAt = readTimestampBestEffort(input.now ?? Date.now);
  if (completedAt === null) return;
  const writer = input.eventWriter ?? defaultOutcomeWriter;

  writeBestEffort(
    writer,
    Object.freeze({
      schemaVersion: SAJU_ABUSE_OUTCOME_SCHEMA_VERSION_V1,
      mode: 'observe_only' as const,
      routeId: input.routeId,
      requestId,
      httpStatus: input.httpStatus,
      completedAt,
    }),
  );
}

export function createSajuAbuseObservedIdentityVerifierV1(
  input: CreateSajuAbuseObservedIdentityVerifierInputV1,
): IdentityEvidenceVerificationPortV1 {
  const requestId = requireRequestId(input.requestId);
  const secret = requireSecret(input.secret);
  const now = input.now ?? Date.now;
  const writer = input.eventWriter ?? defaultAdmissionWriter;

  return Object.freeze({
    async verifyRequestIdentity(request: Request) {
      const evidence = await input.delegate.verifyRequestIdentity(request);
      if (evidence === null) return null;

      const occurredAt = readTimestampBestEffort(now);
      if (occurredAt === null) return evidence;

      writeBestEffort(
        writer,
        Object.freeze({
          schemaVersion: SAJU_ABUSE_OBSERVATION_SCHEMA_VERSION_V1,
          mode: 'observe_only' as const,
          routeId: input.routeId,
          subjectKind: evidence.kind,
          clientKeyVersion: SAJU_ABUSE_CLIENT_KEY_VERSION_V1,
          clientKey: fingerprintSajuAbuseClientV1({
            evidence,
            secret,
          }),
          requestId,
          occurredAt,
        }),
      );

      return evidence;
    },
  });
}
