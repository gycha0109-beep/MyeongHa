#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${MYEONGHA_WATCHTOWER_TRACK:?}"
: "${MEMBER_AUTH_ABUSE_POLICY_MODE:?}"
: "${DISPATCH_CONFIRM:?}"

readonly POLICY_FILE="config/operations/member-auth-abuse-policy-v1.json"
readonly ONE_SHOT_MARKER_FILE=".github/ops/sec-02-b1a-preview-waf-capability.once"
readonly ONE_SHOT_MARKER_VALUE="SEC-02-B1A-PREVIEW-WAF-CAPABILITY-PROBE-V1"

if [[ "$GITHUB_EVENT_NAME" == "workflow_dispatch" ]]; then
  :
elif [[ "$GITHUB_EVENT_NAME" == "push" ]]; then
  [[ "$MEMBER_AUTH_ABUSE_POLICY_MODE" == "probe-preview-capability" ]]
  [[ "$DISPATCH_CONFIRM" == "PROBE_MEMBER_AUTH_PREVIEW_WAF_CAPABILITY_V1" ]]
  [[ -f "$ONE_SHOT_MARKER_FILE" ]]
  [[ "$(tr -d '\r\n' < "$ONE_SHOT_MARKER_FILE")" == "$ONE_SHOT_MARKER_VALUE" ]]
else
  echo "::error title=Member Auth abuse policy event rejected::Unsupported trigger event." >&2
  exit 1
fi
[[ "$GITHUB_REF" == "refs/heads/main" ]]
[[ "$MYEONGHA_WATCHTOWER_TRACK" == "ops" ]]
[[ "$DISPATCH_CONFIRM" == "VERIFY_MEMBER_AUTH_ABUSE_POLICY_V1" || "$DISPATCH_CONFIRM" == "PROBE_MEMBER_AUTH_PREVIEW_WAF_CAPABILITY_V1" ]]
[[ "$MEMBER_AUTH_ABUSE_POLICY_MODE" =~ ^(verify-live|probe-preview-capability)$ ]]

jq -e '
  .contractVersion == "myeongha-member-auth-abuse-policy-v1"
  and .activationState == "hold"
  and .draftAuthority == "preview-capability-probe"
  and (.rules | length) == 3
  and .durableNetworkIdentifierPersistence == false
  and .applicationRetryOnRateLimit == false
  and .supabaseSecretKeyRequired == false
' "$POLICY_FILE" >/dev/null

case "$MEMBER_AUTH_ABUSE_POLICY_MODE" in
  verify-live)
    [[ "$DISPATCH_CONFIRM" == "VERIFY_MEMBER_AUTH_ABUSE_POLICY_V1" ]]
    exec bash scripts/operations/verify-production-member-auth-abuse-policy-live.sh
    ;;
  probe-preview-capability)
    [[ "$DISPATCH_CONFIRM" == "PROBE_MEMBER_AUTH_PREVIEW_WAF_CAPABILITY_V1" ]]
    exec bash scripts/operations/probe-production-member-auth-waf-capability.sh
    ;;
esac

echo "::error title=Member Auth abuse policy mode rejected::Unsupported governed mode." >&2
exit 1
