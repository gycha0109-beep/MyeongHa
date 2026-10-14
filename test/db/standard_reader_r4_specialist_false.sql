-- Verified Standard must not require specialist can_initiate=true.
insert into public.character_capabilities(
 id,content_bundle_id,character_id,saju_domain,role,can_initiate,
 capability_version
) values (
 'b4280000-0000-4000-8000-000000000001',
 '11391000-0000-0000-0000-000000000001',
 'seyeon','relationship','primary',false,'r4-test-specialist-false'
);
