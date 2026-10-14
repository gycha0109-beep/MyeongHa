-- One exact Premium target is NOT Standard entitlement. Synthetic only.
insert into public.standard_reader_product_approved_rules_v1(
 product_id,product_spec_version,saju_domain,approved_policy_revision,
 rule_version,policy_kind,target_reader_id,approval_record_ref,
 approved_at,effective_from
) values (
 '11392000-0000-0000-0000-000000000001','v1','relationship',
 'r4-private-premium-only','r4-private-rule',
 'premium_character_bound','seyeon','test-only:r4',
 clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day'
);
