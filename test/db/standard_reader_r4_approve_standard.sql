insert into public.standard_reader_product_rule_withdrawals_v1(
 product_id,approved_policy_revision,withdrawn_at,withdrawal_record_ref
) values (
 '11392000-0000-0000-0000-000000000001','r4-private-premium-only',
 clock_timestamp(),'test-only:r4-withdraw-premium'
);
insert into public.standard_reader_product_approved_rules_v1(
 product_id,product_spec_version,saju_domain,approved_policy_revision,
 rule_version,policy_kind,target_reader_id,approval_record_ref,
 approved_at,effective_from
) values (
 '11392000-0000-0000-0000-000000000001','v1','relationship',
 'r4-private-standard','r4-private-rule',
 'standard_all_readers',null,'test-only:r4',
 clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day'
);
