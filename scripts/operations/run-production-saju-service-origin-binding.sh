#!/usr/bin/env bash
set -euo pipefail
umask 077

source scripts/operations/vercel-production-common.sh

[[ "$GITHUB_EVENT_NAME" == 'workflow_dispatch' ]]
[[ "$GITHUB_REF" == 'refs/heads/main' ]]
[[ "${DISPATCH_CONFIRM:-}" == 'BIND_SAJU_ORIGIN' ]]
: "${SAJU_SERVICE_ORIGIN_ENV_KEY:?}"
: "${SAJU_SERVICE_ORIGIN:?}"

python3 - <<'PY'
import os
from urllib.parse import urlsplit
value = os.environ['SAJU_SERVICE_ORIGIN']
parsed = urlsplit(value)
if (
    parsed.scheme != 'https'
    or parsed.username is not None
    or parsed.password is not None
    or parsed.path not in ('', '/')
    or parsed.query
    or parsed.fragment
    or value != f"{parsed.scheme}://{parsed.netloc}"
):
    raise SystemExit('SAJU_SERVICE_ORIGIN must be an exact HTTPS origin.')
PY

verify_governed_vercel_project

payload_file="$RUNNER_TEMP/vercel-saju-origin.json"
response_file="$RUNNER_TEMP/vercel-saju-origin-response.json"
readback_file="$RUNNER_TEMP/vercel-saju-origin-readback.json"
trap 'rm -f "$payload_file" "$response_file" "$readback_file"' EXIT

jq -n   --arg key "$SAJU_SERVICE_ORIGIN_ENV_KEY"   --arg origin "$SAJU_SERVICE_ORIGIN" '
    [{
      key: $key,
      value: $origin,
      type: "encrypted",
      target: ["production"],
      comment: "MyeongHa authoritative Saju Cloud Run production origin v1"
    }]
  ' > "$payload_file"

curl -fsS   -X POST   -H "Authorization: Bearer $VERCEL_TOKEN"   -H 'Content-Type: application/json'   --data-binary "@$payload_file"   "https://api.vercel.com/v10/projects/$VERCEL_PROJECT_ID/env?upsert=true&teamId=$VERCEL_TEAM_ID"   -o "$response_file"

jq -e '((.failed // []) | length) == 0' "$response_file" >/dev/null

curl -fsS   -H "Authorization: Bearer $VERCEL_TOKEN"   "https://api.vercel.com/v10/projects/$VERCEL_PROJECT_ID/env?teamId=$VERCEL_TEAM_ID"   -o "$readback_file"

jq -e   --arg key "$SAJU_SERVICE_ORIGIN_ENV_KEY" '
    (.envs | type) == "array"
    and ([.envs[]
      | select(
          .key == $key
          and .type == "encrypted"
          and (.target | type) == "array"
          and (.target | index("production")) != null
        )] | length) == 1
  ' "$readback_file" >/dev/null

IFS=$'\t' read -r source_id source_name < <(wait_exact_main_deployment)
redeploy_id="$(request_exact_redeploy "$source_id" "$source_name")"
test -n "$redeploy_id"
wait_exact_redeploy_ready "$redeploy_id"
verify_canonical_alias_and_readiness "$redeploy_id"

echo 'Production Saju origin binding and governed redeploy completed.'
