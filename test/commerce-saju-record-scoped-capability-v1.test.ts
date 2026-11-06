import {COMMERCE_SAJU_PRODUCTS_V1} from '../apps/api/src/commerce-saju-upgrade-pricing-v1.js';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const migration=readFileSync(
  new URL('../supabase/migrations/2330_saju_record_scoped_capability_authority_v1.sql',import.meta.url),
  'utf8',
);
const command=readFileSync(
  new URL('../apps/api/src/purchase-intent-create-command-v3.ts',import.meta.url),'utf8',
);
const adapter=readFileSync(
  new URL('../apps/api/src/postgres-purchase-intent-create-v3.ts',import.meta.url),'utf8',
);
const reader=readFileSync(
  new URL('../apps/api/src/commerce-saju-current-grant-fields-v1.ts',import.meta.url),'utf8',
);
const finalizerStart=migration.indexOf('create or replace function public.internal_finalize_account_deletion_db_v1(');
const finalizerEnd=migration.indexOf('$account_finalizer$;',finalizerStart);
const finalizer=migration.slice(finalizerStart,finalizerEnd);

describe('Saju Record-scoped Capability authority',()=>{
  it('adds only the Saju-specific scope mode and a private opaque per-Record identity',()=>{
    expect(migration).toContain("check (scope_mode in ('global','fixed','saju_record'))");
    expect(migration).toContain("(scope_mode='saju_record' and fixed_scope_key is null)");
    expect(migration).toContain('entitlement_scope_id uuid not null default gen_random_uuid()');
    expect(migration).toContain('unique (entitlement_scope_id)');
    expect(migration).toContain('new.entitlement_scope_id is distinct from old.entitlement_scope_id');
    expect(migration).toContain("'saju-record:'||record.entitlement_scope_id::text");
    expect(migration).toContain('internal_commerce_saju_entitlement_key_v1');
    expect(migration).toContain('internal_commerce_saju_product_price_minor_v1');
    expect(migration).not.toMatch(/insert into public\.(products|product_offers)\b/iu);
  });

  it('keeps Product fields and canonical entitlement keys aligned with the governed 13-product policy',()=>{
    const fieldStart=migration.indexOf('create function public.internal_commerce_saju_product_fields_v1(');
    const fieldEnd=migration.indexOf('$saju_overlap_fields$;',fieldStart);
    const fieldFragment=migration.slice(fieldStart,fieldEnd);
    const productFields=new Map(
      [...fieldFragment.matchAll(/when '([^']+)' then array\[([^\]]+)\]::text\[\]/gu)]
        .map(match=>[match[1]!,[...match[2]!.matchAll(/'([^']+)'/gu)].map(x=>x[1]!)]),
    );
    expect(productFields.size).toBe(Object.keys(COMMERCE_SAJU_PRODUCTS_V1).length);
    for(const [key,policy] of Object.entries(COMMERCE_SAJU_PRODUCTS_V1)) {
      expect(productFields.get(key)).toEqual([...policy.fields]);
    }
    const keyStart=migration.indexOf('create function public.internal_commerce_saju_entitlement_key_v1(');
    const keyEnd=migration.indexOf('$saju_entitlement_key$;',keyStart);
    const keyFragment=migration.slice(keyStart,keyEnd);
    const keys=new Map(
      [...keyFragment.matchAll(/when '([^']+)' then '([^']+)'/gu)]
        .map(match=>[match[1]!,match[2]!]),
    );
    const allFields=new Set(Object.values(COMMERCE_SAJU_PRODUCTS_V1).flatMap(x=>[...x.fields]));
    expect(keys.size).toBe(allFields.size);
    for(const field of allFields)expect(keys.get(field)).toBe('saju.'+field);
  });

  it('keeps the database Product price mirror exactly aligned with the governed quote policy',()=>{
    const start=migration.indexOf('create function public.internal_commerce_saju_product_price_minor_v1(');
    const end=migration.indexOf('$saju_product_price$;',start);
    const fragment=migration.slice(start,end);
    const prices=new Map(
      [...fragment.matchAll(/when '([^']+)' then (\d+)::bigint/gu)]
        .map(match=>[match[1]!,Number(match[2])]),
    );
    expect(prices.size).toBe(Object.keys(COMMERCE_SAJU_PRODUCTS_V1).length);
    for(const [key,policy] of Object.entries(COMMERCE_SAJU_PRODUCTS_V1)) {
      expect(prices.get(key)).toBe(policy.priceMinor);
    }
  });

  it('resolves a Saju grant only through the exact verified Receipt, Origin, Subject and Birth revision',()=>{
    const start=migration.indexOf('create or replace function public.internal_apply_entitlement_effect_v1(');
    const end=migration.indexOf('\n$$;',start);
    const effect=migration.slice(start,end);
    for(const part of [
      "when pci.scope_mode='saju_record'",
      'origin.purchase_intent_id=pi.id',
      'origin.subject_id=pi.subject_id',
      'record.birth_revision_id=origin.birth_revision_id',
      'product.product_key in',
      "v_product_key in (",
      "v_scope_mode<>'saju_record'",
    ])expect(effect).toContain(part);
    expect(effect).toContain("v_scope_mode='saju_record' and v_scope_key is not null");
    expect(effect).toContain('internal_commerce_saju_entitlement_key_v1(p_capability_item_key)');
  });

  it('prevents bypass through the generic Purchase Intent command',()=>{
    const start=migration.indexOf('create or replace function public.cmd_create_purchase_intent_v3(');
    const end=migration.indexOf('\n$$;',start);
    const generic=migration.slice(start,end);
    expect(migration).toContain('create table public.commerce_saju_purchase_admission_context_v1');
    expect(migration).toContain('revoke all on public.commerce_saju_purchase_admission_context_v1');
    expect(generic).toContain('cmd_purchase_intent_v3_saju_record_context_required');
    expect(generic).toContain('context.transaction_id=pg_catalog.txid_current()');
    expect(generic).toContain('context.subject_id=p_subject_id');
    expect(generic).toContain('context.product_offer_id=p_product_offer_id');
    expect(generic).toContain('p.product_key');
    expect(generic).toContain('v_product_key');
    expect(generic).toContain('cmd_purchase_intent_v3_saju_scope_mode_mismatch');
    expect(generic).toContain('v_existing_offer_id');
  });

  it('locks and validates the exact Record before creating the Intent and immutable Origin',()=>{
    const start=migration.indexOf('create or replace function public.cmd_create_saju_purchase_intent_v1(');
    const end=migration.indexOf('$saju_admission$;',start);
    const admission=migration.slice(start,end);
    expect(admission).toContain("current_setting('transaction_isolation')<>'read committed'");
    expect(admission).toContain('where r.id=p_saju_record_id and r.subject_id=p_subject_id');
    expect(admission).toContain('for update');
    expect(admission.indexOf('for update')).toBeLessThan(admission.indexOf('cmd_create_purchase_intent_v3('));
    expect(admission).toContain('internal_commerce_saju_product_fields_v1(v_product_key)');
    expect(admission).toContain('internal_commerce_saju_product_price_minor_v1(v_product_key)');
    expect(admission).toContain('item.entitlement_key is distinct from');
    expect(admission).toContain('terms.amount_minor');
    expect(admission).toContain('insert into public.commerce_saju_purchase_origins_v1');
    expect(admission).toContain('commerce_saju_purchase_admission_context_v1');
    expect(migration).toContain('cmd_purchase_intent_v3_saju_record_context_required');
    expect(migration).toContain('SAJU_OVERLAPPING_PENDING_PRODUCT');
    expect(admission).toContain('cmd_saju_purchase_admission_existing_rights_require_upgrade');
    expect(admission).toContain('cmd_saju_purchase_admission_refund_or_cancellation_hold');
    expect(admission).toContain('cmd_saju_purchase_admission_upgrade_charge_terms_unavailable');
  });

  it('keeps Record context out of the public request and binds it into idempotency',()=>{
    expect(command).toContain('readonly sajuOrigin?: SajuPurchaseOriginInputV1');
    expect(command).toContain('sajuRecordId: sajuOrigin.sajuRecordId');
    expect(command).toContain('birthRevisionId: sajuOrigin.birthRevisionId');
    expect(command).toContain('createSajuPurchaseIntent');
    expect(command).toContain("keys.length !== 2");
    expect(command).toContain("hasOwnProperty.call(request, 'productOfferId')");
    expect(command).toContain("hasOwnProperty.call(request, 'idempotencyKey')");
    expect(command).not.toContain("hasOwnProperty.call(request, 'sajuRecordId')");
    expect(adapter).toContain('public.cmd_create_saju_purchase_intent_v1');
    expect(adapter).toContain('CREATE_SAJU_SQL');
  });

  it('reads only Grants in the same opaque Record scope',()=>{
    expect(reader).toContain("item.scope_mode='saju_record'");
    expect(reader).toContain("'saju-record:'||record.entitlement_scope_id::text");
    expect(reader).toContain('record.birth_revision_id=origin.birth_revision_id');
    expect(reader).toContain('item.entitlement_key as "entitlementKey"');
    expect(reader).toContain('row.entitlementKey!==`saju.${row.field}`');
  });

  it('deletes only the personal Record mapping in exact account-finalizer order and retains financial evidence',()=>{
    const links=finalizer.indexOf('delete from public.commerce_saju_upgrade_receipt_links_v1');
    const origins=finalizer.indexOf('delete from public.commerce_saju_purchase_origins_v1',links);
    const records=finalizer.indexOf('delete from public.commerce_saju_records_v1',origins);
    const birth=finalizer.indexOf('delete from public.birth_profile_revisions',records);
    expect(links).toBeGreaterThan(0);
    expect(origins).toBeGreaterThan(links);
    expect(records).toBeGreaterThan(origins);
    expect(birth).toBeGreaterThan(records);
    expect(finalizer).not.toContain('delete from public.commerce_saju_verified_refund_effects_v1');
    expect(finalizer).not.toContain('delete from public.commerce_receipts');
    expect(migration).toContain('SAJU_RECORD_DELETE_REQUIRES_ACCOUNT_FINALIZER');
    expect(migration).toContain('SAJU_SOURCE_LEDGER_IMMUTABLE');
  });
});
