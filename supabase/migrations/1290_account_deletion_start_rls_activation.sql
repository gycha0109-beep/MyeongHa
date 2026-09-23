-- Activate the account-deletion start owner's existing row-level security policies.
--
-- Migration 1260 intentionally narrowed table privileges and created owner-scoped
-- policies for the account-deletion runtime owner, but the five target tables
-- remained with row-level security disabled. This forward-only migration activates
-- those already-defined policies without changing table ownership, FORCE RLS,
-- policy predicates, function bodies, or ACLs.

alter table public.data_deletion_jobs enable row level security;
alter table public.device_installations enable row level security;
alter table public.notifications enable row level security;
alter table public.outbox_events enable row level security;
alter table public.share_artifacts enable row level security;

DO $$
DECLARE
  v_table text;
  v_rls boolean;
  v_force_rls boolean;
  v_role_bypass boolean;
  v_policy_count integer;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'data_deletion_jobs',
    'device_installations',
    'notifications',
    'outbox_events',
    'share_artifacts'
  ]
  LOOP
    SELECT c.relrowsecurity, c.relforcerowsecurity
      INTO v_rls, v_force_rls
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = v_table
      AND c.relkind = 'r';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'account-deletion RLS activation target missing: %', v_table;
    END IF;

    IF v_rls IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'account-deletion RLS activation failed for %', v_table;
    END IF;

    IF v_force_rls IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'account-deletion RLS activation unexpectedly enabled FORCE RLS for %', v_table;
    END IF;
  END LOOP;

  SELECT r.rolbypassrls
    INTO v_role_bypass
  FROM pg_catalog.pg_roles r
  WHERE r.rolname = 'myeongha_account_deletion_start_owner';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'managed account-deletion start owner is missing';
  END IF;

  IF v_role_bypass IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'managed account-deletion start owner unexpectedly bypasses RLS';
  END IF;

  SELECT count(*)
    INTO v_policy_count
  FROM pg_catalog.pg_policy p
  JOIN pg_catalog.pg_class c ON c.oid = p.polrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND (
      (c.relname = 'data_deletion_jobs' AND p.polname IN (
        'data_deletion_jobs_account_deletion_start_owner_select_v1',
        'data_deletion_jobs_account_deletion_start_owner_insert_v1'
      ))
      OR
      (c.relname = 'device_installations' AND p.polname IN (
        'device_installations_account_deletion_start_owner_select_v1',
        'device_installations_account_deletion_start_owner_update_v1'
      ))
      OR
      (c.relname = 'notifications' AND p.polname IN (
        'notifications_account_deletion_start_owner_select_v1',
        'notifications_account_deletion_start_owner_update_v1'
      ))
      OR
      (c.relname = 'outbox_events' AND p.polname =
        'outbox_events_account_deletion_start_owner_insert_v1')
      OR
      (c.relname = 'share_artifacts' AND p.polname IN (
        'share_artifacts_account_deletion_start_owner_select_v1',
        'share_artifacts_account_deletion_start_owner_update_v1'
      ))
    );

  IF v_policy_count <> 9 THEN
    RAISE EXCEPTION 'account-deletion RLS policy set is incomplete: expected 9, found %', v_policy_count;
  END IF;
END
$$;
