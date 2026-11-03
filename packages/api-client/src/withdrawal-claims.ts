import {
  MyeongHaApiClientErrorV1,
  type MyeongHaApiClientV1,
} from './http.js';

export const DIGITAL_READING_WITHDRAWAL_ENDPOINT_V1 =
  '/api/me?__myeongha_withdrawal_claim=1' as const;

export const DIGITAL_READING_WITHDRAWAL_REASONS_V1 = Object.freeze([
  'change_of_mind', 'not_provided', 'delivery_failed',
  'not_as_described', 'defect', 'duplicate_charge',
  'unprovided_separable_part', 'other',
] as const);
export type DigitalReadingWithdrawalReasonV1 =
  (typeof DIGITAL_READING_WITHDRAWAL_REASONS_V1)[number];

export interface SubmitDigitalReadingWithdrawalRequestV1 {
  readonly reason: DigitalReadingWithdrawalReasonV1;
  /** Stable caller-generated RFC 4122 ID; reuse unchanged on uncertain retries. */
  readonly idempotencyKey: string;
  readonly purchaseIntentId?: string;
  readonly unitId?: string;
}

export type DigitalReadingWithdrawalClaimStatusV1 =
  | 'received'
  | 'refund_decision_recorded'
  | 'refund_processing'
  | 'refund_confirmed';

export interface SubmittedDigitalReadingWithdrawalClaimV1 {
  readonly claimId: string;
  readonly receivedAt: string;
  readonly status: 'received';
  readonly replayed: boolean;
  readonly refundApproved: false;
  readonly providerRefundCompleted: false;
}
export interface DigitalReadingWithdrawalClaimStatusResponseV1 {
  readonly claimId: string;
  readonly receivedAt: string;
  readonly status: DigitalReadingWithdrawalClaimStatusV1;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REASONS = new Set<string>(DIGITAL_READING_WITHDRAWAL_REASONS_V1);
const STATUSES = new Set<string>([
  'received', 'refund_decision_recorded', 'refund_processing', 'refund_confirmed',
]);

function invalid(message: string): never {
  throw new MyeongHaApiClientErrorV1(
    'malformed_response', 'CLIENT_WITHDRAWAL_CLAIM_INVALID', message,
  );
}
function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function time(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(value)
    && Number.isFinite(Date.parse(value));
}

export async function submitDigitalReadingWithdrawalClaimV1(
  client: MyeongHaApiClientV1,
  bearer: string,
  request: SubmitDigitalReadingWithdrawalRequestV1,
): Promise<SubmittedDigitalReadingWithdrawalClaimV1> {
  if (!object(request) || !REASONS.has(request.reason)
      || !uuid(request.idempotencyKey)
      || (request.purchaseIntentId === undefined) !== (request.unitId === undefined)
      || (request.purchaseIntentId !== undefined
          && (!uuid(request.purchaseIntentId) || !uuid(request.unitId)))
      || Object.keys(request).some(key => ![
        'reason', 'idempotencyKey', 'purchaseIntentId', 'unitId',
      ].includes(key))) {
    return invalid('Withdrawal request must be one exact purchase unit or a general claim.');
  }
  const data = await client.requestData({
    method: 'POST',
    path: DIGITAL_READING_WITHDRAWAL_ENDPOINT_V1,
    bearer,
    body: {
      reason: request.reason,
      idempotencyKey: request.idempotencyKey,
      ...(request.purchaseIntentId === undefined ? {} : {
        purchaseIntentId: request.purchaseIntentId,
        unitId: request.unitId,
      }),
    },
  });
  if (!object(data) || !uuid(data.claimId) || !time(data.receivedAt)
      || data.status !== 'received' || typeof data.replayed !== 'boolean'
      || data.refundApproved !== false || data.providerRefundCompleted !== false) {
    return invalid('Withdrawal submission was not confirmed by the server.');
  }
  return Object.freeze({
    claimId: data.claimId,
    receivedAt: data.receivedAt,
    status: 'received' as const,
    replayed: data.replayed,
    refundApproved: false as const,
    providerRefundCompleted: false as const,
  });
}

export async function readDigitalReadingWithdrawalClaimStatusV1(
  client: MyeongHaApiClientV1,
  bearer: string,
  claimId: string,
): Promise<DigitalReadingWithdrawalClaimStatusResponseV1> {
  if (!uuid(claimId)) return invalid('Withdrawal claim identity is invalid.');
  const data = await client.requestData({
    method: 'GET',
    path: DIGITAL_READING_WITHDRAWAL_ENDPOINT_V1 + '&claimId=' + claimId.toLowerCase(),
    bearer,
  });
  if (!object(data) || data.claimId !== claimId.toLowerCase()
      || !time(data.receivedAt) || typeof data.status !== 'string'
      || !STATUSES.has(data.status)) {
    return invalid('Withdrawal claim status is not authoritative.');
  }
  return Object.freeze({
    claimId: data.claimId,
    receivedAt: data.receivedAt,
    status: data.status as DigitalReadingWithdrawalClaimStatusV1,
  });
}
