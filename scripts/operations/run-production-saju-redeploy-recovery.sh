#!/usr/bin/env bash
set -euo pipefail
umask 077

source scripts/operations/vercel-production-common.sh

case "$GITHUB_EVENT_NAME" in
  workflow_dispatch)
    [[ "$GITHUB_REF" == 'refs/heads/main' ]]
    [[ "${DISPATCH_CONFIRM:-}" == 'REDEPLOY_SAJU_PRODUCTION' ]]
    ;;
  push)
    [[ "$GITHUB_REF" == 'refs/heads/main' ]]
    ;;
  *)
    echo "Unsupported trigger: $GITHUB_EVENT_NAME" >&2
    exit 1
    ;;
esac

verify_governed_vercel_project
IFS=$'\t' read -r source_id source_name < <(wait_exact_main_deployment)
redeploy_id="$(request_exact_redeploy "$source_id" "$source_name")"
test -n "$redeploy_id"
wait_exact_redeploy_ready "$redeploy_id"
verify_canonical_alias_and_readiness "$redeploy_id"

echo 'Governed Production Saju redeploy recovery completed.'
