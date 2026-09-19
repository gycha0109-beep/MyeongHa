#!/usr/bin/env bash
set -euo pipefail

violations=""

while IFS= read -r file; do
  [[ "${file}" == "test/db/catalog_snapshot.sh" ]] && continue
  [[ "${file}" == "test/db/verify_no_schema_cardinality_hardcoding.sh" ]] && continue

  if grep -q "information_schema\.tables" "${file}"     && grep -Eq "table_type[[:space:]]*=[[:space:]]*['\"]BASE TABLE['\"]" "${file}"; then
    violations+="${file}"$'\n'
  fi
done < <(grep -RIl --include='*.sh' --include='*.sql' "information_schema\.tables" test/db || true)

if [[ -n "${violations}" ]]; then
  echo "global public-schema table cardinality checks are forbidden outside catalog_snapshot.sh; SHA256 catalog snapshot is the schema-drift authority" >&2
  printf '%s' "${violations}" >&2
  exit 1
fi

echo "schema cardinality hardcoding guard PASS"
