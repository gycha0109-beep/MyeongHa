import { nativeMobileRuntimeV1 } from '@/core/runtime/native-mobile-runtime';
import { resolveMobileApiOriginV1 } from '@/core/config/mobile-runtime-config';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const READER = /^[a-z][a-z0-9_-]{0,63}$/u;

export type MobileReaderRecordContinuityStateV1 =
  | Readonly<{ kind: 'held' | 'not_confirmed' | 'auth_required' }>
  | Readonly<{
      kind: 'not_available';
      purchaseState: 'current_verified_purchase' | 'verified_full_cancellation' | 'not_confirmed';
    }>
  | Readonly<{
      kind: 'existing_thread_candidate';
      threadId: string;
      purchaseState: 'current_verified_purchase';
    }>;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return record(value) && Object.keys(value).length === keys.length
    && keys.every(key => Object.prototype.hasOwnProperty.call(value,key));
}

/**
 * Only a screen-local, authenticated CURRENT entitlement/one-thread check.
 * Historical Receipt, Reader display in Records and local session cache do
 * not authorize further paid Saju, Memory context or Chat messages.
 * No raw Reading, ciphertext, purchase or token is persisted or logged.
 *
 * Server endpoint is OFF until existing Product/Saju/Privacy approval.
 */
export async function readMobileReaderRecordContinuityV1(input: Readonly<{
  readingId: string;
  readerCharacterId: string;
  signal: AbortSignal;
}>): Promise<MobileReaderRecordContinuityStateV1> {
  if (!UUID.test(input.readingId) || !READER.test(input.readerCharacterId)) {
    throw new Error('Invalid Reader continuity selector.');
  }
  const origin = resolveMobileApiOriginV1(nativeMobileRuntimeV1.config.apiOrigin);
  const endpoint = origin + '/api/readings/' + encodeURIComponent(input.readingId)
    + '/reader-continuity?readerCharacterId=' + encodeURIComponent(input.readerCharacterId);
  return nativeMobileRuntimeV1.memberSession.withMemberBearer(async bearer => {
    const response = await fetch(endpoint, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + bearer,
        'Cache-Control': 'no-store',
      },
      signal: input.signal,
    });
    if (response.status === 401) return Object.freeze({ kind: 'auth_required' as const });
    if (response.status === 503) return Object.freeze({ kind: 'held' as const });
    if (response.status === 403 || response.status === 404) {
      return Object.freeze({ kind: 'not_confirmed' as const });
    }
    if (!response.ok) throw new Error('Reader current entitlement read failed.');

    const payload: unknown = await response.json();
    if (!exact(payload,['ok','data','meta']) || payload.ok !== true
        || !exact(payload.meta,['apiContractVersion','requestId','serverTime'])
        || payload.meta.apiContractVersion !== 'v0.9'
        || !exact(payload.data,[
          'contractVersion','readingId','readerCharacterId','record',
          'readerFollowup','purchaseState','protectedAnswer','summary','saleActivated',
        ])
        || payload.data.contractVersion !== 'commerce-reader-record-continuity-v1'
        || ![
          'current_verified_purchase',
          'verified_full_cancellation',
          'not_confirmed',
        ].includes(payload.data.purchaseState as string)
        || payload.data.readingId !== input.readingId
        || payload.data.readerCharacterId !== input.readerCharacterId
        || !exact(payload.data.record,['state','completedAt'])
        || payload.data.record.state !== 'owned_official_reading'
        || typeof payload.data.record.completedAt !== 'string'
        || !Number.isFinite(Date.parse(payload.data.record.completedAt))
        || payload.data.protectedAnswer !==
          'requires_separate_current_entitlement_and_saju_source'
        || payload.data.summary !== 'not_confirmed_delivered'
        || payload.data.saleActivated !== false) {
      throw new Error('Reader current entitlement response invalid.');
    }
    const followup = payload.data.readerFollowup;
    if (exact(followup,['state','requiresFreshGateAtUse'])
        && followup.state === 'not_available'
        && followup.requiresFreshGateAtUse === true) {
      return Object.freeze({
        kind: 'not_available' as const,
        purchaseState: payload.data.purchaseState as (
          'current_verified_purchase' | 'verified_full_cancellation' | 'not_confirmed'
        ),
      });
    }
    if (exact(followup,['state','threadId','requiresFreshGateAtUse'])
        && followup.state === 'existing_thread_candidate'
        && followup.requiresFreshGateAtUse === true
        && payload.data.purchaseState === 'current_verified_purchase'
        && typeof followup.threadId === 'string' && UUID.test(followup.threadId)) {
      return Object.freeze({
        kind: 'existing_thread_candidate' as const,
        threadId: followup.threadId.toLowerCase(),
        purchaseState: 'current_verified_purchase' as const,
      });
    }
    throw new Error('Reader current entitlement status invalid.');
  });
}
