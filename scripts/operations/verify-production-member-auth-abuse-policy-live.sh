#!/usr/bin/env bash
set -euo pipefail
umask 077

source scripts/operations/vercel-production-common.sh
source scripts/operations/vercel-waf-managed-rule-common.sh

: "${RUNNER_TEMP:?}"
: "${VERCEL_TOKEN:?}"
: "${MYEONGHA_WATCHTOWER_TRACK:?}"

readonly POLICY_FILE="config/operations/member-auth-abuse-policy-v1.json"
readonly FIREWALL_API="https://api.vercel.com/v1/security/firewall/config?projectId=$VERCEL_PROJECT_ID&teamId=$VERCEL_TEAM_ID"

[[ "$MYEONGHA_WATCHTOWER_TRACK" == "ops" ]]
jq -e '.activationState == "hold"' "$POLICY_FILE" >/dev/null

verify_governed_vercel_project

config_file="$RUNNER_TEMP/vercel-firewall-member-auth-phase-a.json"
trap 'rm -f "$config_file"' EXIT

curl -fsS \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  "$FIREWALL_API" \
  -o "$config_file"

assert_managed_rate_limit_registry_live_safety "$config_file" ""

member_rule_names="$(jq -c '[.rules[].ruleName]' "$POLICY_FILE")"
present_count="$(jq --argjson names "$member_rule_names" '
  [(.active.rules // [])[] | select((.name // "") as $name | ($names | index($name)) != null)] | length
' "$config_file")"
if (( present_count != 0 )); then
  echo "::error title=Member Auth activation hold violated::A governed Member Auth rate-limit rule is already present in the active Firewall configuration." >&2
  exit 1
fi

foreign_count="$(count_foreign_active_rate_limit_rules "$config_file")"

echo "member_auth_abuse_policy_live_evidence=pass"
echo "member_auth_policy_activation=hold"
echo "member_auth_managed_rule_present_count=0"
echo "foreign_active_rate_limit_rule_count=$foreign_count"
echo "production_mutation_authorized=false"
echo "raw_network_identifiers_emitted=false"
