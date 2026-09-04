#!/usr/bin/env bash
set -euo pipefail

expected_file="${1:-test/db/catalog.expected.sha256}"

if [[ ! -f "${expected_file}" ]]; then
  echo "missing expected catalog hash: ${expected_file}" >&2
  exit 2
fi

expected="$(tr -d '[:space:]' < "${expected_file}")"

table_count="$(psql -Atqc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")"
if [[ "${table_count}" != "59" ]]; then
  echo "schema catalog table count mismatch: expected=59 actual=${table_count}" >&2
  exit 3
fi

catalog_stream() {
  psql -At -F '|' <<'SQL'
select 'COLUMN', table_name, lpad(ordinal_position::text, 4, '0'), column_name,
       data_type, udt_name, is_nullable, coalesce(column_default, ''),
       is_generated, coalesce(generation_expression, '')
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

select 'CONSTRAINT', c.relname, con.conname, con.contype,
       con.condeferrable::text, con.condeferred::text,
       pg_get_constraintdef(con.oid, true)
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
order by c.relname, con.conname;

select 'INDEX', t.relname, i.relname, pg_get_indexdef(i.oid)
from pg_index x
join pg_class i on i.oid = x.indexrelid
join pg_class t on t.oid = x.indrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
order by t.relname, i.relname;

select 'TRIGGER', c.relname, tg.tgname,
       regexp_replace(pg_get_triggerdef(tg.oid, true), E'[\\n\\r]+', ' ', 'g')
from pg_trigger tg
join pg_class c on c.oid = tg.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and not tg.tgisinternal
order by c.relname, tg.tgname;

select 'FUNCTION', p.proname, pg_get_function_identity_arguments(p.oid),
       regexp_replace(pg_get_functiondef(p.oid), E'[\\n\\r]+', ' ', 'g')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname, pg_get_function_identity_arguments(p.oid);

select 'RLS', c.relname, c.relrowsecurity::text, c.relforcerowsecurity::text
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
SQL
}

actual="$(catalog_stream | sha256sum | awk '{print $1}')"

if [[ "${actual}" != "${expected}" ]]; then
  echo "schema catalog snapshot mismatch" >&2
  echo "expected=${expected}" >&2
  echo "actual=${actual}" >&2
  exit 4
fi

echo "schema catalog snapshot PASS: tables=${table_count} sha256=${actual}"

psql -v ON_ERROR_STOP=1 -f test/db/api_role_acl_negative.sql