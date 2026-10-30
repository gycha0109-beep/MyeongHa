// Watchtower-Track: commerce-payment
// Offline, read-only targeted identity inspection for one provider event/Grant.
// A tag such as 'refund' or 'payment.cancelled' has NO full-refund finality.
// This module never constructs or invokes an Entitlement Effect mutation.

export const COMMERCE_EXACT_READER_CANCELLATION_EVIDENCE_SQL_V1 = `
select
  event.id::text as "providerEventId",
  g.id::text as "grantId",
  g.status as "grantStatus",
  g.revision::text as "grantRevision",
  access.official_reading_id::text as "officialReadingId",
  access.reader_character_id as "readerCharacterId",
  event.event_type as "eventType",
  event.status as "eventStatus",
  event.provider_ordering_key as "eventOrderingKey",
  exists(
    select 1 from public.entitlement_events effect
    where effect.grant_id=g.id
      and effect.subject_id=g.subject_id
      and effect.source_type='provider_event'
      and effect.source_provider_event_id=event.id
      and effect.event_type='revoked'
      and effect.target_status='revoked'
  ) as "exactRevokeEffectExists",
  (select count(*)::text
   from public.standard_reading_reader_access_grants other_access
   join public.entitlement_grants other_grant
     on other_grant.id=other_access.entitlement_grant_id
    and other_grant.subject_id=other_access.subject_id
   where other_access.official_reading_id=access.official_reading_id
     and other_access.subject_id=access.subject_id
     and other_access.entitlement_grant_id<>access.entitlement_grant_id
     and other_grant.status='active'
  ) as "otherActiveReaderPurchaseGrants"
from public.commerce_provider_events event
join public.commerce_receipts receipt
  on receipt.id=event.resolved_receipt_id
  and receipt.subject_id=event.resolved_subject_id
  and receipt.provider=event.provider
  and receipt.environment='production'
  and receipt.verification_status in ('verified','revoked')
  and (
    event.external_transaction_id=receipt.external_transaction_id
    or (event.external_original_transaction_id is not null
        and event.external_original_transaction_id=receipt.external_transaction_id)
    or (receipt.external_original_transaction_id is not null
        and event.external_transaction_id=receipt.external_original_transaction_id)
    or (receipt.external_original_transaction_id is not null
        and event.external_original_transaction_id is not null
        and event.external_original_transaction_id=receipt.external_original_transaction_id)
  )
join public.entitlement_grants g
  on g.id=$2::uuid
  and g.source_receipt_id=receipt.id
  and g.subject_id=receipt.subject_id
  and g.grant_source_type='purchase'
join public.standard_reading_reader_access_grants access
  on access.entitlement_grant_id=g.id
  and access.subject_id=g.subject_id
  and access.purchase_intent_id=receipt.purchase_intent_id
where event.id=$1::uuid
  and event.provider='portone_v2'
  and event.environment='production'
  and event.status in ('verified','processed')
  and event.event_type in ('refund','payment.cancelled')
  and event.resolution_source_type='receipt'
limit 2
`.trim();

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const NO_LINK=Object.freeze({
  schemaVersion:'commerce-exact-reader-cancellation-evidence-v1',
  kind:'no_exact_link', fullRefundEstablished:false,
  cancellationFinalityEstablished:false, revocationAuthorized:false,
  providerCancellationAuthorized:false, writesPerformed:false,
});
function count(value){
 return typeof value==='string' && /^(0|[1-9][0-9]*)$/u.test(value);
}

/**
 * This function takes a known provider-event id AND exact independent Grant id
 * from the approved operations evidence channel. It rejects an ambiguous match.
 * No Customer/Reader/Reading ID is echoed in output. No API route is mounted.
 */
export async function inspectExactReaderCancellationEvidenceV1(
  client,{providerEventId,entitlementGrantId},
){
 if(typeof providerEventId!=='string'||!UUID.test(providerEventId)||
    typeof entitlementGrantId!=='string'||!UUID.test(entitlementGrantId))
  throw Error('INVALID_PRIVATE_READER_CANCELLATION_REQUEST');
 let started=false;
 try {
  await client.query('begin isolation level repeatable read read only');
  started=true;
  await client.query("set local statement_timeout='10000ms'");
  const authority=await client.query(`select
   current_setting('transaction_read_only')='on' as "readOnly",
   (rolsuper or rolbypassrls) as "completeVisibility"
   from pg_catalog.pg_roles where rolname=current_user`);
  if(authority.rows.length!==1||authority.rows[0].readOnly!==true||
     authority.rows[0].completeVisibility!==true)
   throw Error('EXACT_READER_CANCELLATION_AUTHORITY_REQUIRED');
  const result=await client.query(COMMERCE_EXACT_READER_CANCELLATION_EVIDENCE_SQL_V1,
   [providerEventId,entitlementGrantId]);
  if(result.rows.length===0)return NO_LINK;
  if(result.rows.length!==1)throw Error('AMBIGUOUS_EXACT_READER_CANCELLATION_EVIDENCE');
  const row=result.rows[0];
  if(row.providerEventId!==providerEventId||
     row.grantId!==entitlementGrantId||
     !['active','revoked','expired'].includes(row.grantStatus)||
     !count(row.grantRevision)||!count(row.otherActiveReaderPurchaseGrants)||
     typeof row.officialReadingId!=='string'||!UUID.test(row.officialReadingId)||
     typeof row.readerCharacterId!=='string'||!row.readerCharacterId.trim()||
     !['refund','payment.cancelled'].includes(row.eventType)||
     !['verified','processed'].includes(row.eventStatus)||
     (row.eventOrderingKey!==null && typeof row.eventOrderingKey!=='string')||
     typeof row.exactRevokeEffectExists!=='boolean')
    throw Error('INVALID_EXACT_READER_CANCELLATION_EVIDENCE');
  return Object.freeze({
    schemaVersion:'commerce-exact-reader-cancellation-evidence-v1',
    kind:row.grantStatus==='revoked'&&row.exactRevokeEffectExists
      ?'exact_revoke_effect_observed':'linked_review_only',
    currentGrantStatus:row.grantStatus,
    sameEventRevocationObserved:row.exactRevokeEffectExists,
    otherActiveReaderPurchaseGrants:row.otherActiveReaderPurchaseGrants,
    orderingKeyPresent:typeof row.eventOrderingKey==='string'
       &&row.eventOrderingKey.length>0,
    fullRefundEstablished:false,cancellationFinalityEstablished:false,
    revocationAuthorized:false,providerCancellationAuthorized:false,
    writesPerformed:false,
  });
 } finally {
  if(started)await client.query('rollback');
 }
}
