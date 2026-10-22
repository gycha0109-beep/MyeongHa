/**
 * Product-only Receipt -> ONE owned Official Reading -> exact Reader status.
 * URL data is a navigation HINT, never a current Grant, Reader disclosure
 * credential, validated purchase, Saju source, or memory admission.
 */
export const COMMERCE_READER_RECORD_CONTINUITY_V1 = 'commerce-reader-record-continuity-v1';
export const COMMERCE_READER_PURCHASE_RECORD_ENTRY_V1 = 'verified-reader-purchase';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const READER = /^[a-z][a-z0-9_-]{0,63}$/u;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exactKeys(value, keys) {
  return isObject(value) && Object.keys(value).length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
function uuid(value) {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}
function reader(value) {
  return typeof value === 'string' && READER.test(value) ? value : null;
}

/**
 * The only permitted purchase-completion navigator; safe to expose after
 * the current internal verified Receipt->Grant->Reader bind has finished.
 * Does not put Receipt/Grant/amount/payment provider or private body in URL.
 */
export function buildVerifiedReaderRecordsEntryUrlV1(continuation, path = 'records.html') {
  if (!exactKeys(continuation, [
    'contractVersion', 'officialReadingId', 'readerCharacterId',
    'receiptBinding', 'purchaseRole', 'summary', 'readerFollowup',
    'recordDetail', 'checkoutEnabled', 'paidContentRevealed',
  ]) || continuation.contractVersion !== 'commerce-reader-product-continuity-v1'
      || !uuid(continuation.officialReadingId)
      || !reader(continuation.readerCharacterId)
      || !['issued','historical_replay'].includes(continuation.receiptBinding)
      || !['initial_reading','additional_reader_interpretation'].includes(continuation.purchaseRole)
      || continuation.summary !== 'requires_authorized_saju_source_and_reader_delivery'
      || continuation.readerFollowup !== 'requires_fresh_exact_grant_and_existing_thread'
      || continuation.recordDetail !== 'requires_current_subject_owned_read'
      || continuation.checkoutEnabled !== false
      || continuation.paidContentRevealed !== false
      || path !== 'records.html') {
    throw new TypeError('Verified Reader Records entry is unavailable.');
  }
  const query = new URLSearchParams({
    tab: 'saju',
    from: COMMERCE_READER_PURCHASE_RECORD_ENTRY_V1,
    readingId: uuid(continuation.officialReadingId),
    readerCharacterId: continuation.readerCharacterId,
  });
  return path + '?' + query.toString();
}

/**
 * Even a well-shaped navigation link is untrusted until Records reloads the
 * subject-owned official Reading AND the independent current Reader access.
 * Arbitrary or duplicated parameters are ignored, not elevated to authority.
 */
export function parseVerifiedReaderRecordsEntryV1(search) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  if (params.get('from') !== COMMERCE_READER_PURCHASE_RECORD_ENTRY_V1) {
    return Object.freeze({ state: 'none' });
  }
  const expected = ['tab','from','readingId','readerCharacterId'];
  if (params.get('tab') !== 'saju'
      || [...params.keys()].length !== expected.length
      || expected.some(k => params.getAll(k).length !== 1)) {
    return Object.freeze({ state: 'invalid' });
  }
  const readingId = uuid(params.get('readingId'));
  const readerCharacterId = reader(params.get('readerCharacterId'));
  if (!readingId || !readerCharacterId) return Object.freeze({ state: 'invalid' });
  return Object.freeze({ state: 'ready', readingId, readerCharacterId });
}

export function parseCurrentReaderRecordContinuityV1(envelope, expected) {
  const expectedReading = uuid(expected?.readingId);
  const expectedReader = reader(expected?.readerCharacterId);
  if (!expectedReading || !expectedReader
      || !exactKeys(envelope,['ok','data','meta']) || envelope.ok !== true
      || !isObject(envelope.data) || !isObject(envelope.meta)
      || envelope.meta.apiContractVersion !== 'v0.9') {
    throw new TypeError('Reader Records continuity response is unavailable.');
  }
  const data = envelope.data;
  if (!exactKeys(data,[
    'contractVersion','readingId','readerCharacterId','record',
    'readerFollowup','protectedAnswer','summary','saleActivated',
  ]) || data.contractVersion !== COMMERCE_READER_RECORD_CONTINUITY_V1
      || uuid(data.readingId) !== expectedReading
      || data.readerCharacterId !== expectedReader
      || !exactKeys(data.record,['state','completedAt'])
      || data.record.state !== 'owned_official_reading'
      || typeof data.record.completedAt !== 'string'
      || !Number.isFinite(Date.parse(data.record.completedAt))
      || data.protectedAnswer !== 'requires_separate_current_entitlement_and_saju_source'
      || data.summary !== 'not_confirmed_delivered'
      || data.saleActivated !== false) {
    throw new TypeError('Reader Records continuity status is inconsistent.');
  }
  const followup = data.readerFollowup;
  if (!isObject(followup) || followup.requiresFreshGateAtUse !== true) {
    throw new TypeError('Reader Records follow-up state is invalid.');
  }
  if (followup.state === 'existing_thread_candidate'
      && exactKeys(followup,['state','threadId','requiresFreshGateAtUse'])
      && uuid(followup.threadId)) {
    return Object.freeze({
      state: 'existing_thread_candidate',
      readingId: expectedReading,
      readerCharacterId: expectedReader,
      threadId: uuid(followup.threadId),
    });
  }
  if (followup.state === 'not_available'
      && exactKeys(followup,['state','requiresFreshGateAtUse'])) {
    return Object.freeze({
      state: 'not_available',
      readingId: expectedReading,
      readerCharacterId: expectedReader,
    });
  }
  throw new TypeError('Reader Records follow-up state is invalid.');
}
