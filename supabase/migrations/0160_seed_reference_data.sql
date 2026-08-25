-- Stable product domain identity only. This does not encode Saju interpretation semantics.

insert into public.saju_domains (saju_domain, created_at)
values
  ('general', now()),
  ('family', now()),
  ('relationship', now()),
  ('compatibility', now()),
  ('career', now()),
  ('business', now()),
  ('wealth', now()),
  ('life_stage', now()),
  ('question_specific', now())
on conflict (saju_domain) do nothing;
