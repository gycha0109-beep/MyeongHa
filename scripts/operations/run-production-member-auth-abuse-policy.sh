#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${MYEONGHA_WATCHTOWER_TRACK:?}"
: "${MEMBER_AUTH_ABUSE_POLICY_MODE:?}"
: "${DISPATCH_CONFIRM:?}"

readonly POLICY_FILE="config/operations/member-auth-abuse-policy-v1.json"

[[ "$GITHUB_EVENT_NAME" == "workflow_dispatch" ]]
[[ "$GITHUB_REF" == "refs/heads/main" ]]
[[ "$MYEONGHA_WATCHTOWER_TRACK" == "ops" ]]
[[ "$DISPATCH_CONFIRM" == "VERIFY_MEMBER_AUTH_ABUSE_POLICY_V1" ]]
[[ "$MEMBER_AUTH_ABUSE_POLICY_MODE" =~ ^(verify|observe|enforce|disable)$ ]]

jq -e '
  .contractVersion == "myeongha-member-auth-abuse-policy-v1"
  and .activationState == "hold"
  and (.rules | length) == 3
  and .durableNetworkIdentifierPersistence == false
  and .applicationRetryOnRateLimit == false
  and .supabaseSecretKeyRequired == false
' "$POLICY_FILE" >/dev/null

if [[ "$MEMBER_AUTH_ABUSE_POLICY_MODE" == "verify" ]]; then
  exec bash scripts/operations/verify-production-member-auth-abuse-policy-live.sh
fi

echo "::error title=Member Auth abuse policy activation hold::Phase A contains no Production mutation path. Observe, enforce, and disable require a separate reviewed Phase B activation change." >&2
exit 1
