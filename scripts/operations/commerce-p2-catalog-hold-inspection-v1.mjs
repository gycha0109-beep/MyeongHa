// Watchtower-Track: commerce-payment
// Read-only P0-CM-03 catalog evidence; NEVER a sale or Offer activation gate.
export const COMMERCE_P2_CATALOG_HOLD_SQL_V1 = `
select
 (select count(*)::text from public.products p
   where p.product_key='standard.love_relationship') as "productRows",
 (select count(*)::text from public.products p
   where p.product_key='standard.love_relationship' and p.product_type='reading'
     and p.enabled=false and p.retired_at is null) as "inactiveProductRows",
 (select count(*)::text from public.standard_reading_product_specs s
   join public.products p on p.id=s.product_id
   join public.product_capability_sets cs
     on cs.id=s.capability_set_id and cs.product_id=p.id
   where p.product_key='standard.love_relationship' and cs.definition_version='v1'
     and cs.retired_at is null
     and s.topic_key='love_relationship' and s.saju_domain='relationship'
     and s.reading_period='natal' and s.reading_variant='general'
     and s.reader_selection_mode='required'
     and s.purchase_unit_mode='topic_reader_reading'
     and s.retired_at is null) as "specRows",
 (select count(*)::text from public.product_capability_items ci
   join public.product_capability_sets cs on cs.id=ci.capability_set_id
   join public.products p on p.id=cs.product_id
   where p.product_key='standard.love_relationship'
     and cs.definition_version='v1' and cs.retired_at is null
     and ci.entitlement_key='reading.standard.love_relationship.unit.v1'
     and ci.scope_mode='global' and ci.validity_mode='unbounded') as "capabilityRows",
 (select count(*)::text from public.product_offers o join public.products p on p.id=o.product_id
   where p.product_key='standard.love_relationship') as "offerRows",
 (select count(*)::text from public.product_offers o join public.products p on p.id=o.product_id
   where p.product_key='standard.love_relationship' and o.enabled=true and o.retired_at is null)
   as "activeOfferRows",
 (select count(*)::text from public.product_offer_charge_terms ct
   join public.product_offers o on o.id=ct.product_offer_id
   join public.products p on p.id=o.product_id
   where p.product_key='standard.love_relationship') as "chargeTermsRows",
 (select count(*)::text from public.products p
   where p.product_key='saju.general_natal.deep.v1'
     and p.enabled=false and p.retired_at is not null) as "retiredLegacyRows",
 (select count(*)::text from public.product_offers o join public.products p on p.id=o.product_id
   where p.product_key='saju.general_natal.deep.v1'
     and o.enabled=true and o.retired_at is null) as "legacyActiveOfferRows"
`.trim();

const EXPECTED = Object.freeze({
 productRows:'1',inactiveProductRows:'1',specRows:'1',capabilityRows:'1',
 offerRows:'0',activeOfferRows:'0',chargeTermsRows:'0',
 retiredLegacyRows:'1',legacyActiveOfferRows:'0',
});
const KEYS = Object.keys(EXPECTED);

/**
 * P2 operational inspection only: P0-CM-03 has a decided KRW 8,900 list price,
 * but no executable Offer/Charge Terms, Saju production authority or approval
 * to sell. This function cannot authorize a Product, checkout or Grant.
 * Requires an RLS-complete operations connection, never an HTTP mount.
 */
export async function inspectCommerceP2CatalogHoldV1(client) {
 let began=false;
 try {
  await client.query('begin isolation level repeatable read read only');
  began=true;
  await client.query("set local statement_timeout='10000ms'");
  const authority=await client.query(`select current_setting('transaction_read_only')='on' as "readOnly",
    (rolsuper or rolbypassrls) as "completeVisibility"
    from pg_catalog.pg_roles where rolname=current_user`);
  if(authority.rows.length!==1||authority.rows[0].readOnly!==true||
     authority.rows[0].completeVisibility!==true)throw Error('P2_CATALOG_AUDIT_AUTHORITY_REQUIRED');
  const result=await client.query(COMMERCE_P2_CATALOG_HOLD_SQL_V1);
  if(result.rows.length!==1||!result.rows[0]||
     KEYS.some(key=>typeof result.rows[0][key]!=='string'||
       !/^(?:0|[1-9][0-9]*)$/u.test(result.rows[0][key])))
    throw Error('INVALID_P2_CATALOG_AUDIT_RESULT');
  const counts=Object.freeze(Object.fromEntries(KEYS.map(k=>[k,result.rows[0][k]])));
  return Object.freeze({
   schemaVersion:'commerce-p2-catalog-hold-inspection-v1',
   decisionAuthority:'P0-CM-03',
   status:KEYS.every(k=>counts[k]===EXPECTED[k])?'observed_hold':'findings',
   counts,
   saleActivationAuthorized:false,
   chargeTermsAuthorized:false,
   productionFulfillmentAuthorized:false,
   writesPerformed:false,
  });
 } finally {
  if(began)await client.query('rollback');
 }
}
