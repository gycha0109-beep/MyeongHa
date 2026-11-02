-- PortOne V2 credit Product and Offer. Not publicly saleable.
-- Watchtower-Track: commerce-payment
alter table public.products drop constraint products_type_check;
alter table public.products add constraint products_type_check
  check (product_type in ('reading','episode','subscription','bundle','credit'));

insert into public.products (
 id,product_key,product_type,enabled,metadata_jsonb,created_at
) values (
 '26100000-0000-4000-8000-000000000001',
 'chat_credits_300_v1','credit',false,
 '{"schemaVersion":"chat-credit-offer-v1","creditQuantity":300,"purchaseType":"one_off","activationState":"awaiting_portone_merchant_activation"}'::jsonb,
 now()
);

insert into public.product_capability_sets (
 id,product_id,definition_version,definition_hash,created_at
) values (
 '26100000-0000-4000-8000-000000000002',
 '26100000-0000-4000-8000-000000000001','v1',
 'sha256:bc63849774ca5f39a9ddcbf37693a77bb50fbb33a643317519e5a8ca1e566142',
 now()
);

insert into public.product_capability_items (
 capability_set_id,item_key,entitlement_key,scope_mode,
 fixed_scope_key,validity_mode,duration_seconds
) values (
 '26100000-0000-4000-8000-000000000002',
 'credit-pack-300','commerce.chat_credits_300_v1','global',
 null,'unbounded',null
);

insert into public.product_offers (
 id,product_id,platform,provider,external_product_id,currency,
 display_price_minor,enabled,created_at,capability_set_id
) values (
 '26100000-0000-4000-8000-000000000003',
 '26100000-0000-4000-8000-000000000001',
 'web','portone_v2','myeongha-chat-credits-300-v1',
 'KRW',1900,false,now(),
 '26100000-0000-4000-8000-000000000002'
);

insert into public.product_offer_charge_terms (
 id,product_offer_id,terms_version,amount_minor,currency
) values (
 '26100000-0000-4000-8000-000000000004',
 '26100000-0000-4000-8000-000000000003',
 'krw-1900-v1',1900,'KRW'
);
-- The Product and Offer remain disabled until provider verification,
-- refund/reversal, and trusted delivery settlement have passed E2E.
