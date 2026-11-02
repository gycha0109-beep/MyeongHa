// Watchtower-Track: commerce-payment
// P2 operational diagnostics, NOT a new Product activation decision.
export const COMMERCE_P2_OFFER_TERMS_SQL_V1 = `
select o.id::text as "offerId",o.platform as "platform",
 o.provider as "provider",o.enabled as "offerEnabled",
 (o.retired_at is null) as "offerCurrent",
 ct.id::text as "termsId",ct.terms_version as "termsVersion",
 ct.amount_minor::text as "amountMinor",ct.currency as "currency",
 (case when ct.id is null then null else ct.retired_at is null end) as "termsCurrent"
from public.products p
join public.product_offers o on o.product_id=p.id
left join public.product_offer_charge_terms ct on ct.product_offer_id=o.id
where p.product_key='standard.love_relationship'
order by o.id,ct.id
limit 27
`.trim();

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const VERSION=/^[a-zA-Z0-9._-]{1,80}$/u;
const MAX_ROWS=25;
const LIST_PRICE_KRW_MINOR=8900; // P0-CM-03 list price only, never charge authority.

function checked(row){
  if(!row||typeof row!=='object'||!UUID.test(row.offerId)
      ||!['web','ios','android'].includes(row.platform)
      ||typeof row.provider!=='string'||row.provider.length<1
      ||row.provider.length>100
      ||typeof row.offerEnabled!=='boolean'||typeof row.offerCurrent!=='boolean'
      ||(row.termsId===null?(
        row.termsVersion!==null||row.amountMinor!==null
        ||row.currency!==null||row.termsCurrent!==null
      ):(
        !UUID.test(row.termsId)||typeof row.termsVersion!=='string'
        ||!VERSION.test(row.termsVersion)
        ||typeof row.amountMinor!=='string'
        ||!/^[1-9][0-9]*$/u.test(row.amountMinor)
        ||!Number.isSafeInteger(Number(row.amountMinor))
        ||typeof row.currency!=='string'||!/^[A-Z]{3}$/u.test(row.currency)
        ||typeof row.termsCurrent!=='boolean'
      )))throw Error('P2_OFFER_TERMS_EVIDENCE_UNTRUSTED');
  return Object.freeze({
    offerId:row.offerId.toLowerCase(),
    platform:row.platform,
    offerEnabled:row.offerEnabled,offerCurrent:row.offerCurrent,
    termsId:row.termsId===null?null:row.termsId.toLowerCase(),
    termsVersion:row.termsVersion,
    amountMinor:row.amountMinor===null?null:Number(row.amountMinor),
    currency:row.currency,
    termsCurrent:row.termsCurrent,
  });
}

/**
 * Internal, repeatable-read, full-visibility diagnostic for precisely the
 * decided but inactive love_relationship Product. No platform/provider
 * secret or external_product_id leaves the private DB. The list price is
 * informational; matching KRW 8,900 NEVER creates executable Charge Terms.
 */
export async function inspectCommerceP2OfferChargeTermsEvidenceV1(client){
  if(!client||typeof client.query!=='function')
    throw Error('P2_OFFER_TERMS_CLIENT_REQUIRED');
  let active=false;
  try{
    await client.query('begin isolation level repeatable read read only');
    active=true;
    await client.query("set local statement_timeout='10000ms'");
    const role=await client.query(`select current_setting('transaction_read_only')='on' as "readOnly",
      (rolsuper or rolbypassrls) as "completeVisibility"
      from pg_catalog.pg_roles where rolname=current_user`);
    if(role.rows?.length!==1||role.rows[0]?.readOnly!==true
       ||role.rows[0]?.completeVisibility!==true)
      throw Error('P2_OFFER_TERMS_FULL_VISIBILITY_REQUIRED');

    const result=await client.query(COMMERCE_P2_OFFER_TERMS_SQL_V1);
    if(!Array.isArray(result.rows)||result.rows.length>MAX_ROWS)
      throw Error('P2_OFFER_TERMS_BOUNDED_INSPECTION_REQUIRED');
    const records=result.rows.map(checked);
    const offers=new Map();
    for(const row of records){
      const offer=offers.get(row.offerId)??{
        offerId:row.offerId,platform:row.platform,enabled:row.offerEnabled,
        current:row.offerCurrent,termCount:0,currentTermCount:0,
        currentTermPriceMatchesList:false,
      };
      if(row.termsId!==null){
        offer.termCount++;
        if(row.termsCurrent===true){
          offer.currentTermCount++;
          offer.currentTermPriceMatchesList=(
            row.currency==='KRW'&&row.amountMinor===LIST_PRICE_KRW_MINOR
          );
        }
      }
      offers.set(row.offerId,offer);
    }
    const details=Object.freeze([...offers.values()].map(o=>Object.freeze(o)));
    const blockers=[
      'P0_CM_03_INDIVIDUAL_SALE_ACTIVATION_NOT_APPROVED',
      'SAJU_PRODUCTION_READING_AUTHORITY_NOT_CONFIRMED',
      ...(records.length>0?['UNEXPECTED_P2_OFFER_OR_CHARGE_TERMS']:[]),
      ...(details.some(x=>x.enabled&&x.current)?['OFFER_ENABLED_WITHOUT_SALE_AUTHORITY']:[]),
      ...(details.some(x=>x.currentTermCount>0)?['EXECUTABLE_CHARGE_TERMS_WITHOUT_APPROVAL']:[]),
      ...(details.some(x=>x.currentTermCount>1)?['AMBIGUOUS_CURRENT_CHARGE_TERMS']:[]),
      ...(details.some(x=>x.currentTermCount===1&&!x.currentTermPriceMatchesList)
         ?['CURRENT_CHARGE_TERMS_DIFFER_FROM_DECIDED_LIST_PRICE']:[]),
    ];
    await client.query('rollback');
    active=false;
    return Object.freeze({
      schemaVersion:'commerce-p2-offer-charge-terms-evidence-v1',
      productKey:'standard.love_relationship',decisionAuthority:'P0-CM-03',
      decidedListPriceMinor:LIST_PRICE_KRW_MINOR,
      currency:'KRW',
      status:records.length===0?'expected_inactive_catalog':'investigation_required',
      offers:details,
      blockers:Object.freeze(blockers),
      saleActivationAuthorized:false,
      executableChargeAuthorized:false,
      productionFulfillmentAuthorized:false,
      writesPerformed:false,
    });
  } finally {
    if(active)await client.query('rollback');
  }
}
