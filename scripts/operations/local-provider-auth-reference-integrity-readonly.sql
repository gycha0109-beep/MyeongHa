-- Read-only aggregate Provider Auth relation check on disposable CLI 3.1.0 PG17.
-- No IDs, accounts, tokens, object bytes, or user rows are selected.
-- Watchtower-Track: ops
BEGIN TRANSACTION READ ONLY;
WITH
  counters AS (
    SELECT
      (SELECT count(*) FROM auth.users) AS users_count,
      (SELECT count(*) FROM auth.identities) AS identities_count,
      (SELECT count(*) FROM auth.sessions) AS sessions_count,
      (SELECT count(*) FROM auth.refresh_tokens) AS refresh_tokens_count,
      (SELECT count(*) FROM auth.mfa_amr_claims) AS mfa_amr_claims_count
  ),
  orphan_counters AS (
    SELECT
      (SELECT count(*) FROM auth.identities AS x
         WHERE x.user_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM auth.users AS u WHERE u.id = x.user_id))
         AS identity_user_orphans,
      (SELECT count(*) FROM auth.sessions AS s
         WHERE s.user_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM auth.users AS u WHERE u.id = s.user_id))
         AS session_user_orphans,
      (SELECT count(*) FROM auth.refresh_tokens AS t
         WHERE t.session_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM auth.sessions AS s WHERE s.id = t.session_id))
         AS refresh_session_orphans,
      (SELECT count(*) FROM auth.mfa_amr_claims AS a
         WHERE a.session_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM auth.sessions AS s WHERE s.id = a.session_id))
         AS mfa_session_orphans
  ),
  constraint_counters AS (
    SELECT
      (SELECT count(*) FROM pg_catalog.pg_constraint AS co
         JOIN pg_catalog.pg_class AS cl ON cl.oid = co.conrelid
         JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cl.relnamespace
         WHERE ns.nspname IN ('auth','storage') AND co.contype = 'f')
         AS provider_foreign_keys,
      (SELECT count(*) FROM pg_catalog.pg_constraint AS co
         JOIN pg_catalog.pg_class AS cl ON cl.oid = co.conrelid
         JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cl.relnamespace
         WHERE ns.nspname IN ('auth','storage') AND co.contype = 'f'
           AND NOT co.convalidated) AS unvalidated_provider_foreign_keys,
      (SELECT count(*) FROM pg_catalog.pg_trigger AS t
         JOIN pg_catalog.pg_class AS cl ON cl.oid = t.tgrelid
         JOIN pg_catalog.pg_namespace AS ns ON ns.oid = cl.relnamespace
         WHERE ns.nspname IN ('auth','storage') AND t.tgisinternal
           AND t.tgenabled = 'D') AS disabled_internal_provider_triggers
  )
SELECT jsonb_build_object(
  'schemaVersion','ops-provider-local-auth-reference-snapshot-v1',
  'target','disposable-supabase-cli-3.1.0-postgresql17',
  'relationRowsReadAsPayload',false,
  'rowCounts',jsonb_build_object(
    'users',c.users_count,
    'identities',c.identities_count,
    'sessions',c.sessions_count,
    'refreshTokens',c.refresh_tokens_count,
    'mfaAmrClaims',c.mfa_amr_claims_count),
  'orphanCounts',jsonb_build_object(
    'identityWithoutUser',o.identity_user_orphans,
    'sessionWithoutUser',o.session_user_orphans,
    'refreshTokenWithoutSession',o.refresh_session_orphans,
    'mfaClaimWithoutSession',o.mfa_session_orphans),
  'constraints',jsonb_build_object(
    'providerForeignKeys',k.provider_foreign_keys,
    'unvalidatedProviderForeignKeys',k.unvalidated_provider_foreign_keys,
    'disabledInternalProviderTriggers',k.disabled_internal_provider_triggers)
)::text
FROM counters AS c CROSS JOIN orphan_counters AS o
CROSS JOIN constraint_counters AS k;
ROLLBACK;
