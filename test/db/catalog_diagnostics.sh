#!/usr/bin/env bash
set -euo pipefail

label="${1:-catalog}"
tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

emit_section() {
  local section="$1"
  local sql="$2"
  local file="${tmpdir}/${section}.txt"
  psql -X -At -F '|' -c "${sql}" > "${file}"
  printf 'CATALOG_DIAG label=%s section=%s sha256=%s lines=%s\n' \
    "${label}" "${section}" \
    "$(sha256sum "${file}" | awk '{print $1}')" \
    "$(wc -l < "${file}" | tr -d '[:space:]')"
}

emit_section COLUMN "
select 'COLUMN', table_name, lpad(ordinal_position::text, 4, '0'), column_name,
       data_type, udt_name, is_nullable, coalesce(column_default, ''),
       is_generated, coalesce(generation_expression, '')
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
"

emit_section CONSTRAINT "
select 'CONSTRAINT', c.relname, con.conname, con.contype,
       con.condeferrable::text, con.condeferred::text,
       pg_get_constraintdef(con.oid, true)
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
order by c.relname, con.conname;
"

emit_section INDEX "
select 'INDEX', t.relname, i.relname, pg_get_indexdef(i.oid)
from pg_index x
join pg_class i on i.oid = x.indexrelid
join pg_class t on t.oid = x.indrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
order by t.relname, i.relname;
"

emit_section TRIGGER "
select 'TRIGGER', c.relname, tg.tgname,
       regexp_replace(pg_get_triggerdef(tg.oid, true), E'[\\n\\r]+', ' ', 'g')
from pg_trigger tg
join pg_class c on c.oid = tg.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and not tg.tgisinternal
order by c.relname, tg.tgname;
"

emit_section FUNCTION "
select 'FUNCTION', p.proname, pg_get_function_identity_arguments(p.oid),
       regexp_replace(pg_get_functiondef(p.oid), E'[\\n\\r]+', ' ', 'g')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname, pg_get_function_identity_arguments(p.oid);
"

emit_section RLS "
select 'RLS', c.relname, c.relrowsecurity::text, c.relforcerowsecurity::text
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
"

cat \
  "${tmpdir}/COLUMN.txt" \
  "${tmpdir}/CONSTRAINT.txt" \
  "${tmpdir}/INDEX.txt" \
  "${tmpdir}/TRIGGER.txt" \
  "${tmpdir}/FUNCTION.txt" \
  "${tmpdir}/RLS.txt" \
  > "${tmpdir}/TOTAL.txt"

printf 'CATALOG_DIAG label=%s section=TOTAL sha256=%s lines=%s\n' \
  "${label}" \
  "$(sha256sum "${tmpdir}/TOTAL.txt" | awk '{print $1}')" \
  "$(wc -l < "${tmpdir}/TOTAL.txt" | tr -d '[:space:]')"
