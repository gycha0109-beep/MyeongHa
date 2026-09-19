#!/usr/bin/env bash
set -euo pipefail

violations="$(
  grep -RInE     --include='*.sh'     --include='*.sql'     "(information_schema\.tables.*(==|!=|<>).*['\"]?[0-9]+|table_count[^[:alnum:]_].*(==|!=|<>)[^0-9]*[0-9]+|(?:public )?table catalog remains [0-9]+|schema catalog table count mismatch: expected=[0-9]+)"     test/db || true
)"

if [[ -n "${violations}" ]]; then
  echo "numeric public-schema cardinality assertions are forbidden; catalog_snapshot.sh SHA256 is the schema-drift authority" >&2
  echo "${violations}" >&2
  exit 1
fi

echo "schema cardinality hardcoding guard PASS"
