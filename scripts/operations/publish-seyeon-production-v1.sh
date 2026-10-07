#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${SUPABASE_PROJECT_ID:?SUPABASE_PROJECT_ID is required}"
: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD is required}"
: "${POOL_HOST:?POOL_HOST is required}"
: "${POOL_PORT:?POOL_PORT is required}"
: "${POOL_DB:?POOL_DB is required}"
: "${ADMIN_POOL_USER:?ADMIN_POOL_USER is required}"

[[ "$SUPABASE_PROJECT_ID" == 'cnsfpcdiyofqvhpcegfc' ]]
[[ "$ADMIN_POOL_USER" == "postgres.$SUPABASE_PROJECT_ID" ]]
[[ "$POOL_HOST" == *.pooler.supabase.com ]]
[[ "$POOL_PORT" == '5432' ]]
[[ "$POOL_DB" == 'postgres' ]]

artifact_path='docs/character/seyeon-production-publication-artifact-v1.json'
expected_content_hash='sha256:v1:ff08ad287054db544ae354b1135e355a5223a8b0259148c0d3b76106cf6d2cdb'
actual_content_hash="sha256:v1:$(sha256sum "$artifact_path" | awk '{print $1}')"
[[ "$actual_content_hash" == "$expected_content_hash" ]]

artifact_json="$(cat "$artifact_path")"
export PGPASSWORD="$SUPABASE_DB_PASSWORD"
export PGSSLMODE=require

psql_base=(
  psql -X -q -v ON_ERROR_STOP=1
  -h "$POOL_HOST"
  -p "$POOL_PORT"
  -U "$ADMIN_POOL_USER"
  -d "$POOL_DB"
)

"${psql_base[@]}" -v manifest="$artifact_json" <<'SQL'
begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';
set local application_name = 'myeongha_seyeon_initial_publication_v1';

do $bootstrap_preflight$
declare
  v_current_user text := current_user;
  v_bundle_count bigint;
  v_release_count bigint;
  v_character_count bigint;
  v_runtime_count bigint;
begin
  if v_current_user <> 'postgres' then
    raise exception 'Production Seyeon bootstrap requires the governed postgres deployment principal';
  end if;

  select count(*) into v_bundle_count from public.content_bundles;
  select count(*) into v_release_count from public.content_releases;
  select count(*) into v_character_count from public.characters;
  select count(*) into v_runtime_count from public.character_runtime_catalog;

  if row(v_bundle_count, v_release_count, v_character_count, v_runtime_count)
     is distinct from row(0::bigint, 0::bigint, 0::bigint, 0::bigint) then
    raise exception
      'Production Character content is no longer empty: bundles=%, releases=%, characters=%, runtime=%',
      v_bundle_count, v_release_count, v_character_count, v_runtime_count;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'myeongha_content_operator') then
    raise exception 'myeongha_content_operator role is unavailable';
  end if;

  if not pg_has_role('postgres', 'myeongha_content_operator', 'MEMBER') then
    raise exception 'postgres must hold the governed myeongha_content_operator membership';
  end if;
end
$bootstrap_preflight$;

set local role myeongha_content_operator;

select public.cmd_publish_character_content_bundle_v1(
  '7439af18-36b3-495b-a87e-64fa4a3d2fef'::uuid,
  'seyeon-production-publication-v1',
  'sha256:v1:ff08ad287054db544ae354b1135e355a5223a8b0259148c0d3b76106cf6d2cdb',
  'docs/character/seyeon-production-publication-artifact-v1.json',
  'seyeon-production-publication-artifact-v1',
  'character-chat-theme-v1',
  'sha256:v1:ca769bd9b211e5d04f64128fea1fb2e3d1eca3f91d2d34c6fe14f39b62591a4d',
  'character-static-presentation-v1',
  :'manifest'::jsonb,
  (:'manifest'::jsonb)->'characterCatalog',
  (:'manifest'::jsonb)->'characterCapabilities',
  (:'manifest'::jsonb)->'characterRelations'
);

select public.cmd_create_content_release_v1(
  '6e126006-d953-43ec-b512-c15647584828'::uuid,
  'seyeon-production-publication-v1',
  '7439af18-36b3-495b-a87e-64fa4a3d2fef'::uuid,
  '{"characterIds":["seyeon"],"lane":"seyeon","surface":"web-chat"}'::jsonb,
  'character-single-lane-rollout-v1',
  'seyeon-production-publication-v1'
);

select public.cmd_activate_content_release_v1(
  '6e126006-d953-43ec-b512-c15647584828'::uuid,
  true
);

reset role;
commit;
SQL

summary="$("${psql_base[@]}" -A -t <<'SQL'
begin read only;
set local statement_timeout = '30s';
select concat_ws('|',
  (select count(*) from public.content_bundles where id = '7439af18-36b3-495b-a87e-64fa4a3d2fef'::uuid and retired_at is null),
  (select count(*) from public.content_releases where id = '6e126006-d953-43ec-b512-c15647584828'::uuid and status = 'active' and is_default = true),
  (select count(*) from public.character_runtime_catalog where content_bundle_id = '7439af18-36b3-495b-a87e-64fa4a3d2fef'::uuid and character_id = 'seyeon' and enabled = true and availability = 'available'),
  (select count(*) from public.character_runtime_catalog where content_bundle_id = '7439af18-36b3-495b-a87e-64fa4a3d2fef'::uuid),
  (select count(*) from public.characters)
);
rollback;
SQL
)"

IFS='|' read -r bundle_count default_release_count seyeon_runtime_count runtime_count character_count <<< "$summary"
[[ "$bundle_count" == '1' ]]
[[ "$default_release_count" == '1' ]]
[[ "$seyeon_runtime_count" == '1' ]]
[[ "$runtime_count" == '1' ]]
[[ "$character_count" == '1' ]]

printf 'Seyeon Production publication passed: bundle=1, activeDefaultRelease=1, seyeonRuntime=1, runtimeRows=1, canonicalCharacters=1, otherCharactersPublished=0.\n'
