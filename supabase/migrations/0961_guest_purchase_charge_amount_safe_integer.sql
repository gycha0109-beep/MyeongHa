-- Align authoritative charge amounts with the TypeScript/JSON safe-integer boundary.
--
-- Purchase Intent v2 persists amount_minor as bigint, while provider-neutral
-- VerifiedCommerceEvidenceV2 is interpreted through JavaScript numbers. Reject values
-- that cannot round-trip exactly through Number before any saleable charge authority
-- can be configured.

alter table public.product_offer_charge_terms
  add constraint product_offer_charge_terms_amount_safe_integer
  check (amount_minor <= 9007199254740991);
