#!/usr/bin/env bash
set -euo pipefail
umask 077

source scripts/operations/vercel-production-common.sh

: "${RUNNER_TEMP:?}"
: "${VERCEL_TOKEN:?}"
: "${MYEONGHA_WATCHTOWER_TRACK:?}"
: "${ABUSE_POLICY_MODE:?}"
: "${DISPATCH_CONFIRM:?}"

readonly POLICY_FILE="config/operations/guest-bootstrap-abuse-policy-v1.json"
readonly FIREWALL_API="https://api.vercel.com/v1/security/firewall/config?projectId=$VERCEL_PROJECT_ID&teamId=$VERCEL_TEAM_ID"
readonly FIREWALL_DRAFT_API="https://api.vercel.com/v1/security/firewall/config/draft?projectId=$VERCEL_PROJECT_ID&teamId=$VERCEL_TEAM_ID"

[[ "$GITHUB_EVENT_NAME" == "workflow_dispatch" ]]
[[ "$GITHUB_REF" == "refs/heads/main" ]]
[[ "$MYEONGHA_WATCHTOWER_TRACK" == "ops" ]]
[[ "$DISPATCH_CONFIRM" == "APPLY_GUEST_BOOTSTRAP_ABUSE_POLICY_V1" ]]
[[ "$ABUSE_POLICY_MODE" =~ ^(observe|enforce|disable)$ ]]

jq -e '
  .contractVersion == "myeongha-guest-bootstrap-abuse-policy-v1"
  and .vercelProjectId == env.VERCEL_PROJECT_ID
  and .vercelTeamId == env.VERCEL_TEAM_ID
  and .vercelProjectName == env.VERCEL_PROJECT_NAME
  and .ruleName == "myeongha-guest-bootstrap-rate-limit-v1"
  and .route == "/api/session/bootstrap"
  and .method == "POST"
  and .algorithm == "fixed_window"
  and .windowSeconds == 60
  and .requestLimit == 30
  and .keys == ["ip"]
  and .observeRateLimitAction == "log"
  and .enforceRateLimitAction == "rate_limit"
  and .durableNetworkIdentifierPersistence == false
  and .applicationRetryOnRateLimit == false
' "$POLICY_FILE" >/dev/null

verify_governed_vercel_project
echo "governed_vercel_project=verified"

firewall_request() {
  local method="${1:?method required}"
  local url="${2:?url required}"
  local output="${3:?output path required}"
  local input="${4:-}"
  local http_code

  if [[ -n "$input" ]]; then
    http_code="$(curl -sS       -X "$method"       -H "Authorization: Bearer $VERCEL_TOKEN"       -H "Content-Type: application/json"       --data-binary "@$input"       -o "$output"       -w '%{http_code}'       "$url")"
  else
    http_code="$(curl -sS       -X "$method"       -H "Authorization: Bearer $VERCEL_TOKEN"       -H "Content-Type: application/json"       -o "$output"       -w '%{http_code}'       "$url")"
  fi

  if [[ ! "$http_code" =~ ^2[0-9][0-9]$ ]]; then
    local error_code error_message
    error_code="$(jq -r '.error.code // .code // "unknown"' "$output" 2>/dev/null || printf 'unknown')"
    error_message="$(jq -r '.error.message // .message // "Vercel API request failed"' "$output" 2>/dev/null || printf 'Vercel API request failed')"
    echo "::error title=Vercel Firewall API request failed::method=$method http=$http_code code=$error_code message=$error_message"
    return 1
  fi
}

before_file="$RUNNER_TEMP/vercel-firewall-before.json"
patch_file="$RUNNER_TEMP/vercel-firewall-patch.json"
patch_response="$RUNNER_TEMP/vercel-firewall-patch-response.json"
activate_request="$RUNNER_TEMP/vercel-firewall-activate-request.json"
activate_response="$RUNNER_TEMP/vercel-firewall-activate.json"
after_file="$RUNNER_TEMP/vercel-firewall-after.json"

cleanup() {
  exit_code=$?
  trap - EXIT
  rm -f "$before_file" "$patch_file" "$patch_response" "$activate_request" "$activate_response" "$after_file"
  exit "$exit_code"
}
trap cleanup EXIT

firewall_request GET "$FIREWALL_API" "$before_file"
echo "firewall_config_read=verified"

rule_name="$(jq -r '.ruleName' "$POLICY_FILE")"
same_name_count="$(jq --arg name "$rule_name" '[((.active.rules // []) + (.draft.rules // []))[] | select(.name == $name)] | unique_by(.id) | length' "$before_file")"
if (( same_name_count > 1 )); then
  echo "::error title=Guest bootstrap firewall authority ambiguous::More than one managed rule exists with the governed name."
  exit 1
fi

conflicting_rate_limit_count="$(jq --arg name "$rule_name" '
  [(.active.rules // [])[]
    | select(
        .name != $name
        and ((.action.mitigate.action // "") == "rate_limit" or (.action.mitigate.rateLimit // null) != null)
      )]
  | length
' "$before_file")"
if (( conflicting_rate_limit_count > 0 )); then
  echo "::error title=Guest bootstrap firewall rate-limit slot conflict::A different active rate-limit rule already exists; no mutation was attempted."
  exit 1
fi

managed_rule_id="$(jq -r --arg name "$rule_name" '
  ([((.draft.rules // []) + (.active.rules // []))[] | select(.name == $name) | .id][0] // "")
' "$before_file")"

if [[ "$ABUSE_POLICY_MODE" == "disable" && -z "$managed_rule_id" ]]; then
  echo "::error title=Guest bootstrap firewall rule missing::Disable requires the exact governed rule to exist."
  exit 1
fi

rule_active=true
rate_limit_action="$(jq -r '.observeRateLimitAction' "$POLICY_FILE")"
case "$ABUSE_POLICY_MODE" in
  observe)
    rate_limit_action="$(jq -r '.observeRateLimitAction' "$POLICY_FILE")"
    ;;
  enforce)
    rate_limit_action="$(jq -r '.enforceRateLimitAction' "$POLICY_FILE")"
    ;;
  disable)
    rule_active=false
    rate_limit_action="$(jq -r '.observeRateLimitAction' "$POLICY_FILE")"
    ;;
esac

rule_value="$(jq -nc   --arg name "$rule_name"   --arg route "$(jq -r '.route' "$POLICY_FILE")"   --arg method "$(jq -r '.method' "$POLICY_FILE")"   --arg algo "$(jq -r '.algorithm' "$POLICY_FILE")"   --arg action "$rate_limit_action"   --argjson window "$(jq '.windowSeconds' "$POLICY_FILE")"   --argjson limit "$(jq '.requestLimit' "$POLICY_FILE")"   --argjson active "$rule_active"   '{
    active: $active,
    name: $name,
    description: "MyeongHa governed Guest bootstrap durable-row abuse bound v1",
    conditionGroup: [{
      conditions: [
        {type: "path", op: "eq", neg: false, value: $route},
        {type: "method", op: "eq", neg: false, value: $method}
      ]
    }],
    action: {
      mitigate: {
        action: "rate_limit",
        rateLimit: {
          algo: $algo,
          window: $window,
          limit: $limit,
          keys: ["ip"],
          action: $action
        },
        redirect: null,
        actionDuration: null
      }
    }
  }')"

if [[ -z "$managed_rule_id" ]]; then
  jq -n --argjson value "$rule_value" '{
    action: "rules.insert",
    id: null,
    value: $value
  }' > "$patch_file"
else
  jq -n --arg id "$managed_rule_id" --argjson value "$rule_value" '{
    action: "rules.update",
    id: $id,
    value: $value
  }' > "$patch_file"
fi

firewall_request PATCH "$FIREWALL_DRAFT_API" "$patch_response" "$patch_file"
echo "firewall_draft_mutation=accepted"

jq -e   --arg name "$rule_name"   --arg mode "$ABUSE_POLICY_MODE"   --arg rate_action "$rate_limit_action"   '
    (.firewallEnabled == true)
    and ([((.rules // []))[] | select(.name == $name)] | length) == 1
    and ([((.rules // []))[] | select(.name == $name)][0] as $rule
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
  ' "$patch_response" >/dev/null
echo "firewall_draft_readback=verified"

printf '{}\n' > "$activate_request"
firewall_request POST "https://api.vercel.com/v1/security/firewall/config/draft/activate?projectId=$VERCEL_PROJECT_ID&teamId=$VERCEL_TEAM_ID" "$activate_response" "$activate_request"
echo "firewall_draft_activation=accepted"

firewall_request GET "$FIREWALL_API" "$after_file"

jq -e   --arg name "$rule_name"   --arg mode "$ABUSE_POLICY_MODE"   --arg rate_action "$rate_limit_action"   '
    (.active.firewallEnabled == true)
    and ([((.active.rules // []))[] | select(.name == $name)] | length) == 1
    and ([((.active.rules // []))[] | select(.name == $name)][0] as $rule
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
  ' "$after_file" >/dev/null

active_config_id="$(jq -er '.active.id' "$after_file")"
active_config_version="$(jq -er '.active.version' "$after_file")"
active_rule_id="$(jq -er --arg name "$rule_name" '.active.rules[] | select(.name == $name) | .id' "$after_file")"

echo "guest_bootstrap_abuse_policy_status=success"
echo "mode=$ABUSE_POLICY_MODE"
echo "active_config_id=$active_config_id"
echo "active_config_version=$active_config_version"
echo "active_rule_id=$active_rule_id"
echo "route=/api/session/bootstrap"
echo "method=POST"
echo "window_seconds=60"
echo "request_limit=30"
echo "keys=ip"
echo "rate_limit_action=$rate_limit_action"
echo "durable_network_identifier_persistence=false"
