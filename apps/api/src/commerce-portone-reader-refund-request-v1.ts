import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { executePostgresCommerceInternalTransactionV1 } from './postgres-commerce-internal-execution.js';
import {
  applyVerifiedPortOneV2ReaderFullCancellationV1,
} from './commerce-portone-verified-reader-full-cancellation.js';
import type {
  PortOneV2FullCancellationVerifierV1,
  VerifiedPortOneV2FullCancellationV1,
} from './portone-v2-payment-verification-adapter.js';
import {recoverExactPortOneFullCancellationIdV1,type PortOneRefundReadbackFetchV1}
  from './commerce-portone-reader-refund-recovery-v1.js';

/**
 * A private, durable, owner-adjudicated refund command. No HTTP route mounts
 * this function. The database must already contain one privileged legal
 * decision, not a browser request or a classification from the review model.
 *
 * A timeout is ambiguous: NEVER re-send POST automatically. Reconciliation
 * uses authenticated provider GET or the verified cancellation webhook.
 */
export const READER_FULL_REFUND_PRIVATE_V1 = Object.freeze({
  schemaVersion: 'commerce-reader-full-refund-private-v1',
  publicRouteMounted: false,
  productionAutomaticallyEnabled: false,
  supportedEnvironment: 'production',
  requestTimeoutMs: 5_000,
  maxProviderBodyBytes: 65_536,
} as const);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PROVIDER_ID = /^[^\u0000-\u001f\u007f]{1,512}$/u;
const AUTH_ID = (value: string): string => {
  if (typeof value !== 'string' || !UUID.test(value)) throw Error('INVALID_REFUND_AUTHORIZATION_ID');
  return value.toLowerCase();
};

const RESERVE = `
select decision as "decision", payment_id as "paymentId",
 transaction_id as "transactionId",
 original_amount_minor as "originalAmountMinor",
 original_currency as "originalCurrency",
 refund_reason as "refundReason",
 known_cancellation_id as "knownCancellationId"
from public.internal_reserve_reader_full_refund_dispatch_v1($1::uuid)
`;
const RECORD = `select public.internal_record_reader_full_refund_response_v1(
  $1::uuid,$2::text,$3::text
) as "recorded"`;
const CONFIRM = `select public.internal_confirm_reader_full_refund_dispatch_v1(
  $1::uuid,$2::text
) as "confirmed"`;

type Reserved = Readonly<{
  decision: 'dispatch' | 'reconcile_only' | 'completed';
  paymentId: string;
  transactionId: string;
  originalAmountMinor: number | string;
  originalCurrency: string;
  refundReason: string;
  knownCancellationId: string | null;
}>;

export type ReaderPrivateRefundOutcomeV1 = Readonly<{
  kind: 'already_confirmed' | 'reconciliation_required' | 'submitted_pending_provider' | 'confirmed_revoked' | 'confirmed_no_grant';
  providerRefundConfirmed: boolean;
  readerGrantRevoked: boolean | 'unknown';
}>;

export interface ReaderPrivateRefundPostV1 {
  readonly status: number;
  readonly headers: Readonly<{get(name: string): string | null}>;
  readonly text: () => Promise<string>;
  readonly body?: Readonly<{cancel(reason?: unknown): Promise<void>}> | null;
}
export type ReaderPrivateRefundFetchV1 = (
  url: string,
  init: Readonly<{
    method: 'POST'; redirect: 'manual'; signal: AbortSignal;
    headers: Readonly<Record<string, string>>; body: string;
  }>,
) => Promise<ReaderPrivateRefundPostV1>;

const PENDING = Object.freeze({
  kind: 'reconciliation_required',
  providerRefundConfirmed: false,
  readerGrantRevoked: false,
} as const);
const SUBMITTED = Object.freeze({
  kind: 'submitted_pending_provider',
  providerRefundConfirmed: false,
  readerGrantRevoked: false,
} as const);
const CONFIRMED = Object.freeze({
  kind: 'confirmed_revoked',
  providerRefundConfirmed: true,
  readerGrantRevoked: true,
} as const);
const NO_GRANT = Object.freeze({
  kind: 'confirmed_no_grant',
  providerRefundConfirmed: true,
  readerGrantRevoked: false,
} as const);
const ALREADY = Object.freeze({
  kind: 'already_confirmed',
  providerRefundConfirmed: true,
  readerGrantRevoked: 'unknown',
} as const);

function normalized(row: unknown): Reserved {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw Error('REFUND_RESERVATION_UNAVAILABLE');
  const r = row as Record<string, unknown>;
  const amount = typeof r.originalAmountMinor === 'string'
    ? Number(r.originalAmountMinor) : r.originalAmountMinor;
  if (!['dispatch','reconcile_only','completed'].includes(String(r.decision))
      || typeof r.paymentId !== 'string' || !PROVIDER_ID.test(r.paymentId)
      || typeof r.transactionId !== 'string' || !PROVIDER_ID.test(r.transactionId)
      || !Number.isSafeInteger(amount) || (amount as number) <= 0
      || typeof r.originalCurrency !== 'string' || !/^[A-Z]{3}$/u.test(r.originalCurrency)
      || typeof r.refundReason !== 'string' || r.refundReason.length < 1
      || r.refundReason.length > 256 || r.refundReason.trim() !== r.refundReason
      || (r.knownCancellationId !== null
        && (typeof r.knownCancellationId !== 'string'
        || !PROVIDER_ID.test(r.knownCancellationId)))) throw Error('REFUND_RESERVATION_INVALID');
  return Object.freeze({
    decision: r.decision as Reserved['decision'],
    paymentId: r.paymentId,
    transactionId: r.transactionId,
    originalAmountMinor: amount as number,
    originalCurrency: r.originalCurrency,
    refundReason: r.refundReason,
    knownCancellationId: r.knownCancellationId as string | null,
  });
}
async function reserve(pool: PostgresSubjectPoolV1, id: string): Promise<Reserved> {
  return executePostgresCommerceInternalTransactionV1({
    pool,
    execute: async ({client}) => {
      const result = await client.query(RESERVE,[id]);
      if (result.rows.length !== 1) throw Error('REFUND_RESERVATION_AMBIGUOUS');
      return normalized(result.rows[0]);
    },
  });
}
async function dbEffect(pool: PostgresSubjectPoolV1, sql: string, args: readonly string[], expected: string) {
  await executePostgresCommerceInternalTransactionV1({
    pool,
    execute: async ({client}) => {
      const result = await client.query<Record<string, unknown>>(sql,[...args]);
      if (result.rows.length !== 1 || result.rows[0]?.[expected] !== true)
        throw Error('REFUND_DURABLE_STATE_UNAVAILABLE');
    },
  });
}

function responseCancellation(value: unknown): Readonly<{id: string; status: 'REQUESTED' | 'SUCCEEDED' | 'FAILED'}> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('INVALID_REFUND_PROVIDER_RESULT');
  const r = value as Record<string,unknown>;
  const c = r.cancellation;
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw Error('INVALID_REFUND_PROVIDER_RESULT');
  const record = c as Record<string,unknown>;
  if (typeof record.id !== 'string' || !PROVIDER_ID.test(record.id)
      || (record.status !== 'REQUESTED' && record.status !== 'SUCCEEDED'
        && record.status !== 'FAILED'))
    throw Error('INVALID_REFUND_PROVIDER_RESULT');
  return {id:record.id,status:record.status};
}

async function postFullRefund(input: {
  paymentId: string; reason: string; amount: number; authorizationId: string;
  apiSecret: string; timeoutMs: number; fetchImpl: ReaderPrivateRefundFetchV1;
}): Promise<{id:string;status:'REQUESTED'|'SUCCEEDED'|'FAILED'}> {
  if (typeof input.apiSecret !== 'string' || input.apiSecret.length < 16
      || input.apiSecret.trim() !== input.apiSecret) throw Error('REFUND_PROVIDER_NOT_CONFIGURED');
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(Error('REFUND_PROVIDER_TIMEOUT'));
      },input.timeoutMs);
    });
    const response = await Promise.race([
      input.fetchImpl(
        'https://api.portone.io/payments/'+encodeURIComponent(input.paymentId)+'/cancel',
        {
          method:'POST',redirect:'manual',signal:controller.signal,
          headers:Object.freeze({
            authorization:'PortOne '+input.apiSecret,
            accept:'application/json',
            'content-type':'application/json',
            // RFC 8941 string. Stable across the exact one authorization.
            'idempotency-key':'"'+input.authorizationId+'"',
          }),
          body:JSON.stringify({
            reason:input.reason,
            // No amount: PortOne's API interprets this as a FULL cancellation.
            // Require exact pre-request cancellable balance to avoid partials.
            currentCancellableAmount:input.amount,
          }),
        },
      ),
      deadline,
    ]);
    if (response.status !== 200)
      throw Error('REFUND_PROVIDER_NON_SUCCESS');
    const ct=response.headers.get('content-type');
    if (!ct || !/^application\/json(?:\s*;|$)/iu.test(ct))
      throw Error('REFUND_PROVIDER_INVALID_CONTENT_TYPE');
    const length=response.headers.get('content-length');
    if (length !== null && (!/^\d+$/u.test(length) || Number(length)>65_536))
      throw Error('REFUND_PROVIDER_TOO_LARGE');
    const raw=await Promise.race([response.text(),deadline]);
    if (Buffer.byteLength(raw,'utf8')>65_536) throw Error('REFUND_PROVIDER_TOO_LARGE');
    return responseCancellation(JSON.parse(raw) as unknown);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

/** Only the privileged operations runtime can invoke this after the DB owner
 * inserted one exact, reviewed, legal full-refund decision. */
export async function executePrivatelyAuthorizedReaderFullRefundV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  authorizationId: string;
  apiSecret: string;
  verifier: PortOneV2FullCancellationVerifierV1;
  fetchImpl?: ReaderPrivateRefundFetchV1;
  lookupFetchImpl?: PortOneRefundReadbackFetchV1;
  timeoutMs?: number;
}>): Promise<ReaderPrivateRefundOutcomeV1> {
  const id=AUTH_ID(input.authorizationId);
  if (typeof input.apiSecret !== 'string' || input.apiSecret.length < 16
      || input.apiSecret.trim() !== input.apiSecret)
    throw Error('REFUND_PROVIDER_NOT_CONFIGURED');
  if (!input.verifier || typeof input.verifier.verifyFullCancellation !== 'function')
    throw Error('REFUND_PROVIDER_VERIFIER_REQUIRED');
  const timeoutMs=input.timeoutMs ?? 5000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000)
    throw Error('REFUND_TIMEOUT_INVALID');
  const scope=await reserve(input.pool,id);
  if (scope.decision==='completed') return ALREADY;
  let cancellationId=scope.knownCancellationId;

  if (scope.decision==='dispatch') {
    // A durable reservation was COMMITTED before any network I/O. If this
    // call fails or the worker dies, later calls are reconciliation-only.
    try {
      const response=await postFullRefund({
        paymentId:scope.paymentId,reason:scope.refundReason,
        amount:Number(scope.originalAmountMinor),authorizationId:id,
        apiSecret:input.apiSecret,timeoutMs,
        fetchImpl:input.fetchImpl ?? (async (url,init)=>fetch(url,init)),
      });
      if (response.status==='FAILED') return PENDING;
      cancellationId=response.id;
      await dbEffect(input.pool,RECORD,[id,cancellationId,response.status],'recorded');
    } catch {
      return PENDING;
    }
  }
  if(cancellationId===null && scope.decision==='reconcile_only'){
    // A POST may have been accepted even when its response was lost.
    // A fresh authenticated GET may recover exactly ONE full cancellation;
    // NEVER transmit another POST automatically.
    cancellationId=await recoverExactPortOneFullCancellationIdV1({
      paymentId:scope.paymentId,transactionId:scope.transactionId,
      originalAmountMinor:Number(scope.originalAmountMinor),
      originalCurrency:scope.originalCurrency,apiSecret:input.apiSecret,
      timeoutMs,
      ...(input.lookupFetchImpl===undefined?{}:{fetchImpl:input.lookupFetchImpl}),
    });
    if(cancellationId!==null){
      await dbEffect(input.pool,RECORD,[id,cancellationId,'SUCCEEDED'],'recorded');
    }
  }
  if (cancellationId===null) return PENDING;
  // POST success, including SUCCEEDED, is never accepted as final evidence.
  // Use a fresh authenticated GET and then the existing atomic Receipt/Grant
  // cancellation writer; unknown/partial/ambiguous states remain unresolved.
  let verified: VerifiedPortOneV2FullCancellationV1;
  try {
    verified=await input.verifier.verifyFullCancellation({
      paymentId:scope.paymentId,transactionId:scope.transactionId,
      cancellationId,environment:'production',
    });
  } catch {
    return scope.decision==='dispatch' ? SUBMITTED : PENDING;
  }
  if (verified.paymentId!==scope.paymentId
      || verified.transactionId!==scope.transactionId
      || verified.cancellationId!==cancellationId
      || verified.environment!=='production'
      || verified.verifiedCurrency!==scope.originalCurrency
      || verified.verifiedAmountMinor!==Number(scope.originalAmountMinor))
    throw Error('REFUND_VERIFIED_SCOPE_MISMATCH');

  const applied=await applyVerifiedPortOneV2ReaderFullCancellationV1({
    pool:input.pool,evidence:verified,
  });
  if (applied.kind==='unrelated_commerce') throw Error('REFUND_READER_SCOPE_NOT_FOUND');
  await dbEffect(input.pool,CONFIRM,[id,cancellationId],'confirmed');
  return applied.kind === 'cancelled_before_grant' ? NO_GRANT : CONFIRMED;
}
