-- Preserve Purchase Intent charge-term immutability as an independent trigger.
--
-- 0930 originally enforced charge provenance immutability inside
-- tr_purchase_intent_identity_immutable(). Later additive extensions to Purchase
-- Intent identity must not weaken that payment invariant. Split the charge guard
-- into its own trigger before v3 extends identity with Capability provenance.

create or replace function public.tr_purchase_intent_charge_terms_immutable_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.charge_terms_version is not null
     and row(old.expected_amount_minor, old.expected_currency, old.charge_terms_version)
         is distinct from
         row(new.expected_amount_minor, new.expected_currency, new.charge_terms_version) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_purchase_intent_charge_terms_immutable',
      message = 'pinned purchase charge terms are immutable';
  end if;

  return new;
end;
$$;

create trigger tr_purchase_intent_charge_terms_immutable_v1
  before update of expected_amount_minor, expected_currency, charge_terms_version
  on public.purchase_intents
  for each row execute function public.tr_purchase_intent_charge_terms_immutable_v1();
