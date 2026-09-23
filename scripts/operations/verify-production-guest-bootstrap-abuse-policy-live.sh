#!/usr/bin/env bash
set -euo pipefail
umask 077

source scripts/operations/vercel-production-common.sh

: "${RUNNER_TEMP:?}"
: "${VERCEL_TOKEN:?}"
: "${MYEONGHA_WATCHTOWER_TRACK:?}"
: "${EXPECTED_ABUSE_POLICY_MODE:?}"

readonly POLICY_FILE="config/operations/guest-bootstrap-abuse-policy-v1.json"
readonly FIREWALL_API="https://api.vercel.com/v1/security/firewall/config?projectId=$VERCEL_PROJECT_ID&teamId=$VERCEL_TEAM_ID"

[[ "$MYEONGHA_WATCHTOWER_TRACK" == "ops" ]]
[[ "$EXPECTED_ABUSE_POLICY_MODE" =~ ^(observe|enforce|disable)$ ]]

verify_governed_vercel_project

config_file="$RUNNER_TEMP/vercel-firewall-live-evidence.json"
trap 'rm -f "$config_file"' EXIT

curl -fsS   -H "Authorization: Bearer $VERCEL_TOKEN"   "$FIREWALL_API"   -o "$config_file"

rule_name="$(jq -r '.ruleName' "$POLICY_FILE")"
rate_action="$(jq -r '.observeRateLimitAction' "$POLICY_FILE")"
[[ "$EXPECTED_ABUSE_POLICY_MODE" == "enforce" ]] && rate_action="$(jq -r '.enforceRateLimitAction' "$POLICY_FILE")"

jq -e   --arg name "$rule_name"   --arg mode "$EXPECTED_ABUSE_POLICY_MODE"   --arg rate_action "$rate_action"   '
    (.active.firewallEnabled == true)
    and ([.active.rules[] | select(.name == $name)] | length) == 1
    and ([.active.rules[] | select(.name == $name)][0] as $rule
      | $rule.valid != false
      and (($rule.validationErrors // []) | length) == 0
      and $rule.conditionGroup == [{
        conditions: [
          {type: "path", op: "eq", neg: false, value: "/api/session/bootstrap"},
          {type: "method", op: "eq", neg: false, value: "POST"}
        ]
      }]
      and $rule.action.mitigate.action == "rate_limit"
      and $rule.action.mitigate.rateLimit.algo == "fixed_window"
      and ($rule.action.mitigate.rateLimit.window | tonumber) == 60
      and ($rule.action.mitigate.rateLimit.limit | tonumber) == 30
      and $rule.action.mitigate.rateLimit.keys == ["ip"]
      and $rule.action.mitigate.rateLimit.action == $rate_action
      and ($rule.active == ($mode != "disable"))
    )
  ' "$config_file" >/dev/null

active_config_id="$(jq -er '.active.id' "$config_file")"
active_config_version="$(jq -er '.active.version' "$config_file")"
active_rule_id="$(jq -er --arg name "$rule_name" '.active.rules[] | select(.name == $name) | .id' "$config_file")"

echo "guest_bootstrap_abuse_policy_evidence=pass"
echo "expected_mode=$EXPECTED_ABUSE_POLICY_MODE"
echo "active_config_id=$active_config_id"
echo "active_config_version=$active_config_version"
echo "active_rule_id=$active_rule_id"
echo "raw_network_identifiers_emitted=false"
