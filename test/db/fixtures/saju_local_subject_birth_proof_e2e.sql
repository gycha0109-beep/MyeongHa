-- Disposable CI-only synthetic Subject + Birth revisions for real HTTP/DB E2E.
-- Watchtower-Track: saju-bridge
-- Must run ONLY in the fresh GitHub service database after the complete
-- checked-in migrations. This file must never be applied to Production.
DO $$
BEGIN
  IF current_database() <> 'myeongha_saju_local_verify' THEN
    RAISE EXCEPTION 'Refusing to seed a non-disposable Saju bridge database';
  END IF;
END
$$;

insert into auth.users(id) values
  ('8c310001-0000-4000-8000-000000000001'),
  ('8c310002-0000-4000-8000-000000000002');

insert into public.subjects (
  id, kind, auth_user_id, status, merged_into_subject_id, created_at, updated_at
) values
  ('8c320001-0000-4000-8000-000000000001', 'member',
   '8c310001-0000-4000-8000-000000000001', 'active', null,
   timestamptz '2026-10-10 00:00:00+00', timestamptz '2026-10-10 00:00:00+00'),
  ('8c320002-0000-4000-8000-000000000002', 'member',
   '8c310002-0000-4000-8000-000000000002', 'active', null,
   timestamptz '2026-10-10 00:00:00+00', timestamptz '2026-10-10 00:00:00+00');

insert into public.birth_profiles (
  id, subject_id, profile_kind, label, current_revision_id,
  archived_at, created_at, updated_at
) values (
  '8c330001-0000-4000-8000-000000000001',
  '8c320001-0000-4000-8000-000000000001',
  'self', 'synthetic-sole-self', null, null,
  timestamptz '2026-10-10 00:00:00+00',
  timestamptz '2026-10-10 00:00:00+00'
);

-- Two immutable revisions contain the SAME birth values on purpose.
-- Changing only the canonical Revision identity must invalidate a Proof.
insert into public.birth_profile_revisions (
  id, birth_profile_id, subject_id, revision_no, calendar_type,
  birth_date, birth_time, time_known, is_leap_month, sex,
  input_hash, created_at
) values
  ('8c340001-0000-4000-8000-000000000001',
   '8c330001-0000-4000-8000-000000000001',
   '8c320001-0000-4000-8000-000000000001',
   1, 'solar', date '2024-03-10', time '12:00:00',
   true, false, 'unspecified', 'sha256:synthetic-current-birth-r1',
   timestamptz '2026-10-10 00:00:00+00'),
  ('8c340002-0000-4000-8000-000000000002',
   '8c330001-0000-4000-8000-000000000001',
   '8c320001-0000-4000-8000-000000000001',
   2, 'solar', date '2024-03-10', time '12:00:00',
   true, false, 'unspecified', 'sha256:synthetic-current-birth-r2-same-input',
   timestamptz '2026-10-10 00:00:00+00');

update public.birth_profiles
set current_revision_id = '8c340001-0000-4000-8000-000000000001'
where id = '8c330001-0000-4000-8000-000000000001';
