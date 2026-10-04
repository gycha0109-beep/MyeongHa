#!/usr/bin/env bash
set -euo pipefail
umask 077

source scripts/operations/vercel-production-common.sh
source scripts/operations/vercel-waf-managed-rule-common.sh

: "${RUNNER_TEMP:?}"
: "${VERCEL_TOKEN:?}"
: "${MYEONGHA_WATCHTOWER_TRACK:?}"
: "${DISPATCH_CONFIRM:?}"

readonly POLICY_FILE="config/operations/member-auth-abuse-policy-v1.json"
readonly FIREWALL_API="https://api.vercel.com/v1/security/firewall/config?projectId=$VERCEL_PROJECT_ID&teamId=$VERCEL_TEAM_ID"
readonly FIREWALL_DRAFT_API="https://api.vercel.com/v1/security/firewall/config/draft?projectId=$VERCEL_PROJECT_ID&teamId=$VERCEL_TEAM_ID"

[[ "$GITHUB_EVENT_NAME" == "workflow_dispatch" ]]
[[ "$GITHUB_REF" == "refs/heads/main" ]]
[[ "$MYEONGHA_WATCHTOWER_TRACK" == "ops" ]]
[[ "$DISPATCH_CONFIRM" == "PROBE_MEMBER_AUTH_PREVIEW_WAF_CAPABILITY_V1" ]]

jq -e '
  .contractVersion == "myeongha-member-auth-abuse-policy-v1"
  and .activationState == "hold"
  and .draftAuthority == "preview-capability-probe"
  and .vercelProjectId == env.VERCEL_PROJECT_ID
  and .vercelTeamId == env.VERCEL_TEAM_ID
  and .vercelProjectName == env.VERCEL_PROJECT_NAME
  and (.rules | length) == 3
  and all(.rules[];
    .method == "POST"
    and .algorithm == "fixed_window"
    and .windowSeconds == 60
    and .requestLimit == 30
    and .keys == ["ip"]
    and .enforceRateLimitAction == "rate_limit"
  )
' "$POLICY_FILE" >/dev/null

verify_governed_vercel_project
echo "governed_vercel_project=verified"

probe_dir="$(mktemp -d "$RUNNER_TEMP/member-auth-waf-capability.XXXXXX")"
before_file="$probe_dir/before.json"
staged_file="$probe_dir/staged.json"
final_file="$probe_dir/final.json"
cleanup_file="$probe_dir/cleanup.json"

baseline_active_id=""
baseline_active_version=""
baseline_active_fingerprint=""
inserted_rule_ids=()
untracked_mutation_possible=false

firewall_request() {
  local method="${1:?method required}"
  local url="${2:?url required}"
  local output="${3:?output path required}"
  local input="${4:-}"
  local http_code

  if [[ -n "$input" ]]; then
    http_code="$(curl -sS -X "$method" \
      -H "Authorization: Bearer $VERCEL_TOKEN" \
      -H "Content-Type: application/json" \
      --data-binary "@$input" \
      -o "$output" \
      -w '%{http_code}' \
      "$url")"
  else
    http_code="$(curl -sS -X "$method" \
      -H "Authorization: Bearer $VERCEL_TOKEN" \
      -H "Content-Type: application/json" \
      -o "$output" \
      -w '%{http_code}' \
      "$url")"
  fi

  if [[ ! "$http_code" =~ ^2[0-9][0-9]$ ]]; then
    local error_code error_message
    error_code="$(jq -r '.error.code // .code // "unknown"' "$output" 2>/dev/null || printf 'unknown')"
    error_message="$(jq -r '.error.message // .message // "Vercel API request failed"' "$output" 2>/dev/null || printf 'Vercel API request failed')"
    echo "::error title=Vercel Firewall API request failed::method=$method http=$http_code code=$error_code message=$error_message" >&2
    return 1
  fi
}

assert_active_baseline_unchanged() {
  local config_file="${1:?config file required}"
  local current_id current_version current_fingerprint
  current_id="$(jq -er '.active.id' "$config_file")"
  current_version="$(jq -er '.active.version | tostring' "$config_file")"
  current_fingerprint="$(firewall_semantic_fingerprint "$config_file" active)"
  [[ "$current_id" == "$baseline_active_id" ]]
  [[ "$current_version" == "$baseline_active_version" ]]
  [[ "$current_fingerprint" == "$baseline_active_fingerprint" ]]
}

remove_inserted_probe_rules() {
  local idx rule_id patch_file response_file
  for (( idx=${#inserted_rule_ids[@]} - 1; idx >= 0; idx-- )); do
    rule_id="${inserted_rule_ids[$idx]}"
    patch_file="$probe_dir/remove-$idx.json"
    response_file="$probe_dir/remove-$idx-response.json"
    jq -n --arg id "$rule_id" '{
      action: "rules.remove",
      id: $id,
      value: null
    }' > "$patch_file"
    firewall_request PATCH "$FIREWALL_DRAFT_API" "$response_file" "$patch_file"
    unset 'inserted_rule_ids[idx]'
  done
  inserted_rule_ids=()
}

verify_restored_state() {
  firewall_request GET "$FIREWALL_API" "$cleanup_file"
  assert_active_baseline_unchanged "$cleanup_file"
  assert_firewall_draft_matches_active "$cleanup_file"
  jq -e --slurpfile policy "$POLICY_FILE" '
    ($policy[0].rules | map(.ruleName)) as $names
    | [((.active.rules // []) + (.draft.rules // []))[]
        | select((.name // "") as $name | ($names | index($name)) != null)]
      | length == 0
  ' "$cleanup_file" >/dev/null
}

cleanup() {
  local original_status=$?
  local cleanup_status=0
  trap - EXIT

  if (( ${#inserted_rule_ids[@]} > 0 )); then
    if ! remove_inserted_probe_rules; then
      cleanup_status=1
    elif [[ -n "$baseline_active_fingerprint" ]] && ! verify_restored_state; then
      cleanup_status=1
    fi
  fi

  if [[ "$untracked_mutation_possible" == "true" ]]; then
    cleanup_status=1
  fi

  rm -rf "$probe_dir"

  if (( cleanup_status != 0 )); then
    echo "::error title=Member Auth WAF capability probe cleanup failed::DRAFT_RESIDUE_REQUIRES_MANUAL_REVIEW" >&2
    exit 97
  fi

  exit "$original_status"
}
trap cleanup EXIT

firewall_request GET "$FIREWALL_API" "$before_file"
assert_managed_rate_limit_registry_live_safety "$before_file" ""
echo "managed_rate_limit_registry_safety=verified"

bypass_count="$(count_active_bypass_rules "$before_file")"
if (( bypass_count > 0 )); then
  echo "::error title=Member Auth WAF capability probe blocked::BYPASS_REVIEW_REQUIRED" >&2
  exit 1
fi

if ! assert_firewall_draft_matches_active "$before_file"; then
  echo "::error title=Member Auth WAF capability probe blocked::FIREWALL_DRAFT_NOT_CLEAN" >&2
  exit 1
fi

baseline_active_id="$(jq -er '.active.id' "$before_file")"
baseline_active_version="$(jq -er '.active.version | tostring' "$before_file")"
baseline_active_fingerprint="$(firewall_semantic_fingerprint "$before_file" active)"

mapfile -t policy_rules < <(jq -c '.rules[]' "$POLICY_FILE")
for idx in "${!policy_rules[@]}"; do
  rule_json="${policy_rules[$idx]}"
  rule_name="$(jq -r '.ruleName' <<<"$rule_json")"
  patch_file="$probe_dir/insert-$idx.json"
  patch_response="$probe_dir/insert-$idx-response.json"
  step_file="$probe_dir/step-$idx.json"

  rule_value="$(jq -nc \
    --arg name "$rule_name" \
    --arg route "$(jq -r '.route' <<<"$rule_json")" \
    --arg method "$(jq -r '.method' <<<"$rule_json")" \
    --arg algo "$(jq -r '.algorithm' <<<"$rule_json")" \
    --argjson window "$(jq '.windowSeconds' <<<"$rule_json")" \
    --argjson limit "$(jq '.requestLimit' <<<"$rule_json")" \
    '{
      active: false,
      name: $name,
      description: "MyeongHa Member Auth preview capability probe v1",
      conditionGroup: [{
        conditions: [
          {type: "path", op: "eq", neg: false, value: $route},
          {type: "method", op: "eq", neg: false, value: $method},
          {type: "environment", op: "eq", neg: false, value: "preview"}
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
            action: "rate_limit"
          },
          redirect: null,
          actionDuration: null
        }
      }
    }')"

  jq -n --argjson value "$rule_value" '{
    action: "rules.insert",
    id: null,
    value: $value
  }' > "$patch_file"

  insert_request_status=0
  if ! firewall_request PATCH "$FIREWALL_DRAFT_API" "$patch_response" "$patch_file"; then
    insert_request_status=1
  fi

  firewall_request GET "$FIREWALL_API" "$step_file"
  assert_active_baseline_unchanged "$step_file"

  same_name_count="$(jq --arg name "$rule_name" '[.draft.rules[]? | select(.name == $name)] | length' "$step_file")"

  if (( insert_request_status != 0 )); then
    if (( same_name_count == 0 )); then
      rejection_code="$(jq -r '.error.code // .code // "unknown"' "$patch_response" 2>/dev/null || printf 'unknown')"
      rejection_message="$(jq -r '.error.message // .message // "Vercel API request failed"' "$patch_response" 2>/dev/null || printf 'Vercel API request failed')"
      verify_restored_state

      echo "preview_rule_set_supported=false"
      echo "active_config_unchanged=true"
      echo "draft_restored=true"
      echo "production_publish_performed=false"

      if [[ "$rejection_code" == "unauthorized" && "$rejection_message" == *"Rate limiting is not available for this plan"* ]]; then
        echo "member_auth_waf_capability_probe=blocked"
        echo "capability_blocker=rate_limiting_not_available_for_plan"
        echo "::error title=Member Auth WAF capability blocked::Vercel rejected the first governed Auth rate-limit insert because rate limiting is not available for the current plan. Active config and draft were verified unchanged." >&2
        exit 78
      fi

      echo "member_auth_waf_capability_probe=rejected_without_mutation"
      echo "::error title=Member Auth WAF capability probe insert rejected::The API rejected the insert and no target rule was created; active config and draft were verified unchanged." >&2
      exit 1
    fi

    if (( same_name_count == 1 )); then
      inserted_rule_id="$(jq -er --arg name "$rule_name" '.draft.rules[] | select(.name == $name) | .id' "$step_file")"
      inserted_rule_ids+=("$inserted_rule_id")
      echo "::error title=Member Auth WAF capability probe insert rejected after mutation::The API rejected the request but one target draft rule exists; exact-ID cleanup is required." >&2
      exit 1
    fi

    untracked_mutation_possible=true
    echo "::error title=Member Auth WAF capability probe authority ambiguous::Rejected insert left an ambiguous target-rule count." >&2
    exit 1
  fi

  if (( same_name_count != 1 )); then
    untracked_mutation_possible=true
    echo "::error title=Member Auth WAF capability probe authority ambiguous::Accepted insert could not be resolved to one exact draft rule ID." >&2
    exit 1
  fi

  inserted_rule_id="$(jq -er --arg name "$rule_name" '.draft.rules[] | select(.name == $name) | .id' "$step_file")"
  inserted_rule_ids+=("$inserted_rule_id")

  jq -e --arg name "$rule_name" --argjson expected "$rule_json" '
    [.draft.rules[] | select(.name == $name)][0] as $rule
    | $rule.active == false
      and $rule.valid != false
      and (($rule.validationErrors // []) | length) == 0
      and $rule.conditionGroup == [{
        conditions: [
          {type: "path", op: "eq", neg: false, value: $expected.route},
          {type: "method", op: "eq", neg: false, value: $expected.method},
          {type: "environment", op: "eq", neg: false, value: "preview"}
        ]
      }]
      and $rule.action.mitigate.action == "rate_limit"
      and $rule.action.mitigate.rateLimit.algo == $expected.algorithm
      and ($rule.action.mitigate.rateLimit.window | tonumber) == $expected.windowSeconds
      and ($rule.action.mitigate.rateLimit.limit | tonumber) == $expected.requestLimit
      and $rule.action.mitigate.rateLimit.keys == $expected.keys
      and $rule.action.mitigate.rateLimit.action == $expected.enforceRateLimitAction
  ' "$step_file" >/dev/null

  echo "probe_rule_$idx=validated"
done

firewall_request GET "$FIREWALL_API" "$staged_file"
assert_active_baseline_unchanged "$staged_file"
assert_member_auth_probe_delta_only "$staged_file" "$POLICY_FILE"

jq -e --slurpfile policy "$POLICY_FILE" '
  all($policy[0].rules[];
    . as $expected
    | ([.draft.rules[] | select(.name == $expected.ruleName)] | length) == 1
    and ([.draft.rules[] | select(.name == $expected.ruleName)][0] as $rule
      | $rule.active == false
      and $rule.valid != false
      and (($rule.validationErrors // []) | length) == 0
      and $rule.conditionGroup == [{
        conditions: [
          {type: "path", op: "eq", neg: false, value: $expected.route},
          {type: "method", op: "eq", neg: false, value: $expected.method},
          {type: "environment", op: "eq", neg: false, value: "preview"}
        ]
      }]
      and $rule.action.mitigate.action == "rate_limit"
      and $rule.action.mitigate.rateLimit.algo == $expected.algorithm
      and ($rule.action.mitigate.rateLimit.window | tonumber) == $expected.windowSeconds
      and ($rule.action.mitigate.rateLimit.limit | tonumber) == $expected.requestLimit
      and $rule.action.mitigate.rateLimit.keys == $expected.keys
      and $rule.action.mitigate.rateLimit.action == $expected.enforceRateLimitAction
    )
  )
' "$staged_file" >/dev/null

echo "member_auth_waf_capability_validation=pass"

remove_inserted_probe_rules
verify_restored_state
firewall_request GET "$FIREWALL_API" "$final_file"
assert_active_baseline_unchanged "$final_file"
assert_firewall_draft_matches_active "$final_file"

final_target_count="$(jq --slurpfile policy "$POLICY_FILE" '
  ($policy[0].rules | map(.ruleName)) as $names
  | [((.active.rules // []) + (.draft.rules // []))[]
      | select((.name // "") as $name | ($names | index($name)) != null)]
    | length
' "$final_file")"
(( final_target_count == 0 ))

echo "member_auth_waf_capability_probe=pass"
echo "preview_rule_set_supported=true"
echo "target_rule_count=3"
echo "probe_rules_enabled=false"
echo "active_config_unchanged=true"
echo "draft_restored=true"
echo "production_publish_performed=false"
echo "raw_network_identifiers_emitted=false"
