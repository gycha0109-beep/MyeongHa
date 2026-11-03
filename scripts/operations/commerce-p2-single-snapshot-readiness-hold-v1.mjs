// Watchtower-Track: commerce-payment
import { COMMERCE_P2_CATALOG_HOLD_SQL_V1 } from './commerce-p2-catalog-hold-inspection-v1.mjs';
import { COMMERCE_P2_OFFER_TERMS_SQL_V1 } from './commerce-p2-offer-charge-terms-evidence-v1.mjs';

/**
 * P0-CM-03: one coherent Product/Reader/Offer/Charge Terms DB snapshot.
 * This is an internal, read-only *hold* attestation, not sale authorization.
 */
const COUNTS=Object.freeze({
  productRows:'1',inactiveProductRows:'1',specRows:'1',capabilityRows:'1',
  offerRows:'0',activeOfferRows:'0',chargeTermsRows:'0',
  retiredLegacyRows:'1',legacyActiveOfferRows:'0',
});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const INT=/^(?:0|[1-9][0-9]*)$/u;

function safeCount(v){
  if(typeof v!=='string'||!INT.test(v)||!Number.isSafeInteger(Number(v)))
    throw Error('P2_SNAPSHOT_UNTRUSTED_CATALOG');
  return Number(v);
}

function verifiedOfferRows(rows){
  if(!Array.isArray(rows)||rows.length>25)
    throw Error('P2_SNAPSHOT_OFFER_BOUND_EXCEEDED');
  const offers=new Map();
  const ids=new Set();
  let terms=0;
  for(const row of rows){
    if(!row||!UUID.test(row.offerId)
      ||!['web','ios','android'].includes(row.platform)
      ||typeof row.offerEnabled!=='boolean'
      ||typeof row.offerCurrent!=='boolean'
      ||(row.termsId===null
        ? row.termsVersion!==null||row.amountMinor!==null
          ||row.currency!==null||row.termsCurrent!==null
        : !UUID.test(row.termsId)||typeof row.termsVersion!=='string'
          ||!/^[A-Za-z0-9._-]{1,80}$/u.test(row.termsVersion)
          ||typeof row.amountMinor!=='string'
          ||!/^[1-9][0-9]*$/u.test(row.amountMinor)
          ||!Number.isSafeInteger(Number(row.amountMinor))
          ||typeof row.currency!=='string'||!/^[A-Z]{3}$/u.test(row.currency)
          ||typeof row.termsCurrent!=='boolean'))
      throw Error('P2_SNAPSHOT_UNTRUSTED_OFFER');
    const id=row.offerId.toLowerCase();
    const previous=offers.get(id);
    if(previous&&(
      previous.platform!==row.platform
      ||previous.enabled!==row.offerEnabled
      ||previous.current!==row.offerCurrent
    ))throw Error('P2_SNAPSHOT_OFFER_CONFLICT');
    if(!previous){
      offers.set(id,{platform:row.platform,enabled:row.offerEnabled,
        current:row.offerCurrent});
    }
    if(row.termsId!==null){
      const termsId=row.termsId.toLowerCase();
      if(ids.has(termsId))throw Error('P2_SNAPSHOT_DUPLICATE_TERMS');
      ids.add(termsId);
      terms++;
    }
  }
  return {offers:offers.size,
    active:[...offers.values()].filter(o=>o.enabled&&o.current).length,
    terms};
}

export async function inspectCommerceP2SingleSnapshotHoldV1(client){
  if(!client||typeof client.query!=='function')
    throw Error('P2_SNAPSHOT_PRIVATE_CLIENT_REQUIRED');
  let began=false;
  try{
    await client.query('begin isolation level repeatable read read only');
    began=true;
    await client.query("set local statement_timeout='10000ms'");
    const authority=await client.query(`select current_setting('transaction_read_only')='on' as "readOnly",
      (rolsuper or rolbypassrls) as "completeVisibility"
      from pg_catalog.pg_roles where rolname=current_user`);
    if(authority.rows?.length!==1||authority.rows[0]?.readOnly!==true
      ||authority.rows[0]?.completeVisibility!==true)
      throw Error('P2_SNAPSHOT_FULL_DB_AUTHORITY_REQUIRED');

    const catalog=await client.query(COMMERCE_P2_CATALOG_HOLD_SQL_V1);
    if(catalog.rows?.length!==1||!catalog.rows[0])
      throw Error('P2_SNAPSHOT_UNTRUSTED_CATALOG');
    const count=Object.freeze(Object.fromEntries(
      Object.keys(COUNTS).map(k=>[k,safeCount(catalog.rows[0][k])])));
    const offerResult=await client.query(COMMERCE_P2_OFFER_TERMS_SQL_V1);
    const offerCounts=verifiedOfferRows(offerResult.rows);
    if(count.offerRows!==offerCounts.offers
      ||count.activeOfferRows!==offerCounts.active
      ||count.chargeTermsRows!==offerCounts.terms)
      throw Error('P2_SNAPSHOT_INCONSISTENT_OFFER_COUNTS');

    const drift=Object.keys(COUNTS).filter(k=>count[k]!==Number(COUNTS[k]));
    const blockers=Object.freeze([
      'P0_CM_03_INDIVIDUAL_PRODUCT_SALE_NOT_APPROVED',
      'SAJU_PRODUCTION_READING_AUTHORITY_NOT_CONFIRMED',
      'SALEABLE_OFFER_AND_CHARGE_TERMS_NOT_AUTHORIZED',
      ...(drift.length?['P2_CATALOG_OR_OFFER_DRIFT']:[]),
    ]);
    return Object.freeze({
      schemaVersion:'commerce-p2-single-snapshot-readiness-hold-v1',
      productKey:'standard.love_relationship',
      decisionAuthority:'P0-CM-03',
      listPrice: Object.freeze({currency:'KRW',amountMinor:8900,
        executableChargeAuthority:false}),
      status:drift.length?'investigation_required':'hold_observed',
      driftKeys:Object.freeze(drift),
      counts:count,
      blockers,
      saleActivationAuthorized:false,
      checkoutAuthorized:false,
      productionReaderFulfillmentAuthorized:false,
      writesPerformed:false,
    });
  }finally{
    if(began)await client.query('rollback');
  }
}
