-- Product Capability trigger execution-context hardening.
--
-- 0982 adds three new Commerce trigger functions and replaces the existing
-- tr_product_offer_mapping_immutable() body so Offer capability_set_id becomes part of
-- historical identity. CREATE OR REPLACE resets the existing 0940 per-function
-- search_path configuration, so every function introduced/replaced by 0982 is pinned
-- again here.
--
-- This migration changes no payment/provider authority and grants no new privilege.

alter function public.tr_product_capability_set_immutable()
  set search_path = pg_catalog, public;

alter function public.tr_product_capability_item_immutable()
  set search_path = pg_catalog, public;

alter function public.tr_product_offer_capability_pin_authority()
  set search_path = pg_catalog, public;

alter function public.tr_product_offer_mapping_immutable()
  set search_path = pg_catalog, public;

-- Fail closed in the migration itself so a future refactor cannot silently ship a
-- caller-dependent Commerce trigger execution context.
DO $$
DECLARE
  v_function text;
  v_config text;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'tr_product_capability_set_immutable',
    'tr_product_capability_item_immutable',
    'tr_product_offer_capability_pin_authority',
    'tr_product_offer_mapping_immutable'
  ]
  LOOP
    SELECT coalesce(array_to_string(p.proconfig, ','), '')
      INTO v_config
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = v_function
      AND pg_catalog.pg_get_function_identity_arguments(p.oid) = '';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product Capability trigger function missing: %', v_function;
    END IF;

    IF v_config NOT LIKE '%search_path=pg_catalog, public%' THEN
      RAISE EXCEPTION 'Product Capability trigger function % has unsafe proconfig: %',
        v_function, v_config;
    END IF;
  END LOOP;
END
$$;