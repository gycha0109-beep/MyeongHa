import { createHash, createHmac } from 'node:crypto';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectExecutionScopeV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type {
  VerifiedSubjectIdentityEvidenceV1,
} from './subject-identity-resolver.js';

/**
 * S7 private delivery accounting. The proof records only that the server
 * prepared a protected response and, later, that the authenticated client
 * explicitly acknowledged it. Neither means a person actually read it.
 *
 * An HMAC of server-pinned identity makes the acknowledgment token stable
 * across retries of ONE request ID. The database persists only SHA-256 of
 * the resulting bearer token; never the bearer token, source text, answer,
 * encryption key or prompt. Keep this secret independent of Saju and DEKs.
 *
 * The SQL functions are not granted to the API runtime and the public
 * adapter remains OFF until separate source, privacy and S7 approval.
 */

export const OFFICIAL_READER_PRIVATE_DELIVERY_VERSION_V1 =
  'official-reader-s7-private-delivery-v1' as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TOKEN = /^[A-Za-z0-9_-]{43}$/u;

const PREPARE_SQL = `
select
  delivery_attempt_id::text as "deliveryAttemptId",
  response_prepared_at::text as "responsePreparedAt",
  already_prepared as "replayed"
from public.internal_prepare_official_reader_paid_delivery_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text
)
`;
const ACK_SQL = `
select
  client_acknowledged_at::text as "clientAcknowledgedAt",
  replayed
from public.internal_ack_official_reader_paid_delivery_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text
)
`;

export interface OfficialReaderPrivateDeliveryReservationV1 {
  readonly deliveryRequestId: string;
  readonly secret: Uint8Array;
}

export interface OfficialReaderPrivateDeliveryPreparedV1 {
  readonly contractVersion: typeof OFFICIAL_READER_PRIVATE_DELIVERY_VERSION_V1;
  readonly deliveryRequestId: string;
  readonly deliveryAttemptId: string;
  readonly responsePreparedAt: string;
  readonly acknowledgementToken: string;
  readonly replayed: boolean;
}

export interface OfficialReaderPrivateDeliveryAcknowledgedV1 {
  readonly contractVersion: typeof OFFICIAL_READER_PRIVATE_DELIVERY_VERSION_V1;
  readonly deliveryAttemptId: string;
  readonly clientAcknowledgedAt: string;
  readonly replayed: boolean;
}

export class OfficialReaderPrivateDeliveryErrorV1 extends Error {
  readonly code = 'OFFICIAL_READER_DELIVERY_UNAVAILABLE' as const;
  constructor() {
    super('Official Reader delivery record is unavailable.');
    this.name = 'OfficialReaderPrivateDeliveryErrorV1';
  }
}
function unavailable(): never {
  throw new OfficialReaderPrivateDeliveryErrorV1();
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) return unavailable();
  return value.toLowerCase();
}
function assertDate(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    return unavailable();
  }
  return value;
}
function digestToken(token: string): string {
  return 'sha256:v1:' + createHash('sha256').update(token,'ascii').digest('hex');
}

/** Opaque token is stable for EXACT Subject x Chat marker x body x request. */
function deriveToken(input: Readonly<{
  subjectId: string;
  threadId: string;
  safeMessageId: string;
  bodyId: string;
  deliveryRequestId: string;
  secret: Uint8Array;
}>): string {
  if (!(input.secret instanceof Uint8Array)
      || input.secret.byteLength !== 32) return unavailable();
  const privateKey = Buffer.from(input.secret);
  try {
    return createHmac('sha256',privateKey)
      .update(JSON.stringify([
        OFFICIAL_READER_PRIVATE_DELIVERY_VERSION_V1,
        uuid(input.subjectId),
        uuid(input.threadId),
        uuid(input.safeMessageId),
        uuid(input.bodyId),
        uuid(input.deliveryRequestId),
      ]),'utf8').digest('base64url');
  } finally {
    privateKey.fill(0);
  }
}

/**
 * Called INSIDE the already S6-authorized, current-Entitlement-locked
 * transaction and BEFORE sending anything to HTTP. SQL repeats that S6
 * authorization for defense in depth. Same request ID -> immutable event,
 * token, and prepared-at time even after response loss or network retry.
 */
export async function prepareOfficialReaderPrivateDeliveryV1(input: Readonly<{
  scope: PostgresSubjectExecutionScopeV1;
  subjectId: string;
  threadId: string;
  safeMessageId: string;
  bodyId: string;
  reservation: OfficialReaderPrivateDeliveryReservationV1;
}>): Promise<OfficialReaderPrivateDeliveryPreparedV1> {
  try {
    const subjectId=uuid(input.subjectId);
    const threadId=uuid(input.threadId);
    const safeMessageId=uuid(input.safeMessageId);
    const bodyId=uuid(input.bodyId);
    const deliveryRequestId=uuid(input.reservation.deliveryRequestId);
    if (input.scope.resolvedSubject.subjectId !== subjectId
        || input.scope.resolvedSubject.subjectKind !== 'member') {
      return unavailable();
    }
    const acknowledgementToken=deriveToken({
      subjectId,threadId,safeMessageId,bodyId,deliveryRequestId,
      secret:input.reservation.secret,
    });
    if (!TOKEN.test(acknowledgementToken)) return unavailable();
    const result=await input.scope.client.query<{
      deliveryAttemptId: unknown;
      responsePreparedAt: unknown;
      replayed: unknown;
    }>(PREPARE_SQL,[
      subjectId,bodyId,threadId,safeMessageId,
      deliveryRequestId,digestToken(acknowledgementToken),
    ]);
    const row=result.rows[0];
    if (result.rows.length!==1 || !row
        || typeof row.replayed!=='boolean') return unavailable();
    return Object.freeze({
      contractVersion:OFFICIAL_READER_PRIVATE_DELIVERY_VERSION_V1,
      deliveryRequestId,
      deliveryAttemptId:uuid(row.deliveryAttemptId),
      responsePreparedAt:assertDate(row.responsePreparedAt),
      acknowledgementToken,
      replayed:row.replayed,
    });
  } catch {
    return unavailable();
  }
}

/**
 * Client-render acknowledgment. The client must POST its original token
 * AFTER receiving the dedicated protected HTTP body. A duplicate only
 * replays the original acknowledgment timestamp; S5 content stays immutable.
 * No private Reader plaintext, encryption key, or Entitlement is returned.
 */
export async function acknowledgeOfficialReaderPrivateDeliveryV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  threadId: string;
  safeMessageId: string;
  deliveryRequestId: string;
  deliveryAttemptId: string;
  acknowledgementToken: string;
}>): Promise<OfficialReaderPrivateDeliveryAcknowledgedV1> {
  try {
    const threadId=uuid(input.threadId);
    const safeMessageId=uuid(input.safeMessageId);
    const deliveryRequestId=uuid(input.deliveryRequestId);
    const deliveryAttemptId=uuid(input.deliveryAttemptId);
    if (typeof input.acknowledgementToken !== 'string'
        || !TOKEN.test(input.acknowledgementToken)) return unavailable();
    const tokenHash=digestToken(input.acknowledgementToken);
    return await executePostgresSubjectTransactionV1({
      pool:input.pool,
      verifiedEvidence:input.verifiedEvidence,
      execute:async(scope)=>{
        if (scope.resolvedSubject.subjectKind!=='member') return unavailable();
        const subjectId=uuid(scope.resolvedSubject.subjectId);
        const result=await scope.client.query<{
          clientAcknowledgedAt:unknown;
          replayed:unknown;
        }>(ACK_SQL,[
          subjectId,threadId,safeMessageId,deliveryAttemptId,
          deliveryRequestId,tokenHash,
        ]);
        const row=result.rows[0];
        if(result.rows.length!==1 || !row
            || typeof row.replayed!=='boolean') return unavailable();
        return Object.freeze({
          contractVersion:OFFICIAL_READER_PRIVATE_DELIVERY_VERSION_V1,
          deliveryAttemptId,
          clientAcknowledgedAt:assertDate(row.clientAcknowledgedAt),
          replayed:row.replayed,
        });
      },
    });
  } catch {
    return unavailable();
  }
}
