#!/usr/bin/env bash
set -euo pipefail

readonly MYEONGHA_WAF_MANAGED_RULE_REGISTRY="${MYEONGHA_WAF_MANAGED_RULE_REGISTRY:-config/operations/vercel-waf-managed-rate-limit-rules-v1.json}"

_myeongha_expected_rate_limit_rule_json() {
  local policy_file="${1:?policy file required}"
  local policy_id="${2:?policy id required}"
  jq -ce --arg policy_id "$policy_id" '
    if ((.ruleName? // "") | type) == "string" and ((.ruleName? // "") | length) > 0
    then .
    else ([((.rules // []))[] | select(.policyId == $policy_id)][0] // empty)
    end
  ' "$policy_file"
}

verify_managed_rate_limit_registry_contract() {
  local registry="${1:-$MYEONGHA_WAF_MANAGED_RULE_REGISTRY}"
  test -f "$registry"

  jq -e '
    .contractVersion == "myeongha-vercel-waf-managed-rate-limit-rules-v1"
    and (.managedRules | type) == "array"
    and (.managedRules | length) > 0
    and ([.managedRules[].policyId] | length) == ([.managedRules[].policyId] | unique | length)
    and ([.managedRules[].ruleName] | length) == ([.managedRules[].ruleName] | unique | length)
    and all(.managedRules[];
      (.policyId | type) == "string"
      and (.ruleName | test("^myeongha-[a-z0-9-]+-rate-limit-v1$"))
      and (.policyFile | test("^config/operations/[A-Za-z0-9._/-]+\\.json$"))
      and (.policyFile | contains("..") | not)
      and (.activationAuthority == "production-active" or .activationAuthority == "hold")
    )
  ' "$registry" >/dev/null

  if [[ -n "${VERCEL_PROJECT_ID:-}" ]]; then
    jq -e --arg project "$VERCEL_PROJECT_ID" '.vercelProjectId == $project' "$registry" >/dev/null
  fi
  if [[ -n "${VERCEL_TEAM_ID:-}" ]]; then
    jq -e --arg team "$VERCEL_TEAM_ID" '.vercelTeamId == $team' "$registry" >/dev/null
  fi
  if [[ -n "${VERCEL_PROJECT_NAME:-}" ]]; then
    jq -e --arg name "$VERCEL_PROJECT_NAME" '.vercelProjectName == $name' "$registry" >/dev/null
  fi

  while IFS=$'\t' read -r policy_id rule_name policy_file; do
    test -f "$policy_file"
    local expected
    expected="$(_myeongha_expected_rate_limit_rule_json "$policy_file" "$policy_id")"
    jq -e --arg name "$rule_name" '.ruleName == $name' <<<"$expected" >/dev/null
  done < <(jq -r '.managedRules[] | [.policyId, .ruleName, .policyFile] | @tsv' "$registry")
}

count_foreign_active_rate_limit_rules() {
  local config_file="${1:?config file required}"
  local registry="${2:-$MYEONGHA_WAF_MANAGED_RULE_REGISTRY}"
  jq --slurpfile registry "$registry" '
    ($registry[0].managedRules | map(.ruleName)) as $managed
    | [(.active.rules // [])[]
        | select(
            (
              (.action.mitigate.action // "") == "rate_limit"
              or (.action.mitigate.rateLimit // null) != null
            )
            and ((.name // "") as $name | ($managed | index($name)) == null)
          )]
    | length
  ' "$config_file"
}

_assert_active_rule_matches_policy_contract() {
  local config_file="${1:?config file required}"
  local rule_name="${2:?rule name required}"
  local expected_json="${3:?expected rule json required}"

  jq -e --arg name "$rule_name" --argjson expected "$expected_json" '
    (.active.firewallEnabled == true)
    and ([((.active.rules // []))[] | select(.name == $name)] | length) == 1
    and ([((.active.rules // []))[] | select(.name == $name)][0] as $rule
      | $rule.active == true
      and $rule.valid != false
      and (($rule.validationErrors // []) | length) == 0
      and $rule.conditionGroup == [{
        conditions: [
          {type: "path", op: "eq", neg: false, value: $expected.route},
          {type: "method", op: "eq", neg: false, value: $expected.method}
        ]
      }]
      and $rule.action.mitigate.action == "rate_limit"
      and $rule.action.mitigate.rateLimit.algo == $expected.algorithm
      and ($rule.action.mitigate.rateLimit.window | tonumber) == $expected.windowSeconds
      and ($rule.action.mitigate.rateLimit.limit | tonumber) == $expected.requestLimit
      and $rule.action.mitigate.rateLimit.keys == $expected.keys
      and (
        $rule.action.mitigate.rateLimit.action == $expected.observeRateLimitAction
        or $rule.action.mitigate.rateLimit.action == $expected.enforceRateLimitAction
      )
    )
  ' "$config_file" >/dev/null
}

assert_managed_rate_limit_registry_live_safety() {
  local config_file="${1:?config file required}"
  local mutation_target_name="${2:-}"
  local registry="${3:-$MYEONGHA_WAF_MANAGED_RULE_REGISTRY}"

  verify_managed_rate_limit_registry_contract "$registry"

  local foreign_count
  foreign_count="$(count_foreign_active_rate_limit_rules "$config_file" "$registry")"
  if (( foreign_count > 0 )); then
    echo "::error title=Vercel Firewall foreign rate-limit rule detected::Unregistered active rate-limit rules exist; no governed mutation is permitted." >&2
    return 1
  fi

  while IFS=$'\t' read -r policy_id rule_name policy_file authority; do
    local active_count
    active_count="$(jq --arg name "$rule_name" '
      [(.active.rules // [])[]
        | select(
            .name == $name
            and (
              (.action.mitigate.action // "") == "rate_limit"
              or (.action.mitigate.rateLimit // null) != null
            )
          )]
      | length
    ' "$config_file")"

    if (( active_count > 1 )); then
      echo "::error title=Vercel Firewall managed rule authority ambiguous::Duplicate governed rate-limit rule name detected." >&2
      return 1
    fi

    if [[ "$authority" == "hold" ]]; then
      if (( active_count > 0 )); then
        echo "::error title=Vercel Firewall activation hold violated::A managed rate-limit rule is active while its registry authority is hold." >&2
        return 1
      fi
      continue
    fi

    if [[ "$rule_name" == "$mutation_target_name" ]]; then
      continue
    fi

    if (( active_count != 1 )); then
      echo "::error title=Vercel Firewall managed rule missing::A production-active managed rate-limit rule is not present exactly once." >&2
      return 1
    fi

    local expected
    expected="$(_myeongha_expected_rate_limit_rule_json "$policy_file" "$policy_id")"
    if ! _assert_active_rule_matches_policy_contract "$config_file" "$rule_name" "$expected"; then
      echo "::error title=Vercel Firewall managed rule drift detected::A production-active managed rate-limit rule no longer matches its repository policy contract." >&2
      return 1
    fi
  done < <(jq -r '.managedRules[] | [.policyId, .ruleName, .policyFile, .activationAuthority] | @tsv' "$registry")
}


count_active_bypass_rules() {
  local config_file="${1:?config file required}"
  jq '
    [(.active.rules // [])[]
      | select(
          .active == true
          and (.action.mitigate.action // "") == "bypass"
        )]
    | length
  ' "$config_file"
}

_firewall_semantic_config_json() {
  local config_file="${1:?config file required}"
  local scope="${2:?scope required}"
  jq -Sc --arg scope "$scope" '
    def semantic_rule:
      del(.valid, .validationErrors);
    def semantic_config:
      {
        firewallEnabled: (.firewallEnabled // false),
        crs: (.crs // null),
        rules: [(.rules // [])[] | semantic_rule],
        ips: (.ips // []),
        rulesets: (.rulesets // []),
        managedRules: (.managedRules // null),
        botIdEnabled: (.botIdEnabled // null),
        logHeaders: (.logHeaders // null)
      };
    (if $scope == "active" then .active else .draft end) as $config
    | ($config // {}) | semantic_config
  ' "$config_file"
}

firewall_semantic_fingerprint() {
  local config_file="${1:?config file required}"
  local scope="${2:?scope required}"
  _firewall_semantic_config_json "$config_file" "$scope" | sha256sum | awk '{print $1}'
}

assert_firewall_draft_matches_active() {
  local config_file="${1:?config file required}"
  if jq -e '.draft == null or ((.draft | type) == "object" and (.draft | length) == 0)' "$config_file" >/dev/null; then
    return 0
  fi

  local active_json draft_json
  active_json="$(_firewall_semantic_config_json "$config_file" active)"
  draft_json="$(_firewall_semantic_config_json "$config_file" draft)"
  [[ "$active_json" == "$draft_json" ]]
}

assert_member_auth_probe_delta_only() {
  local config_file="${1:?config file required}"
  local policy_file="${2:?policy file required}"

  jq -e --slurpfile policy "$policy_file" '
    def semantic_rule:
      del(.valid, .validationErrors);
    def semantic_config:
      {
        firewallEnabled: (.firewallEnabled // false),
        crs: (.crs // null),
        rules: [(.rules // [])[] | semantic_rule],
        ips: (.ips // []),
        rulesets: (.rulesets // []),
        managedRules: (.managedRules // null),
        botIdEnabled: (.botIdEnabled // null),
        logHeaders: (.logHeaders // null)
      };

    ($policy[0].rules | map(.ruleName)) as $target_names
    | (.active | semantic_config) as $active
    | (.draft | semantic_config) as $draft
    | [($draft.rules // [])[]
        | select((.name // "") as $name | ($target_names | index($name)) != null)] as $targets
    | ($targets | length) == 3
      and ([$targets[].name] | sort) == ($target_names | sort)
      and (
        [$draft.rules[]
          | select((.name // "") as $name | ($target_names | index($name)) == null)]
        == $active.rules
      )
      and (($draft | .rules = $active.rules) == $active)
  ' "$config_file" >/dev/null
}
