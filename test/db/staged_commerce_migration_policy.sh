#!/usr/bin/env bash
# Historical CI fixtures must preserve their previously approved catalog and
# synthetic credit SKU. New Commerce SQL is installed only by separate rollout.
# This policy requires exact Git blob fingerprints before excluding either file.
skip_staged_portone_migration_from_historical_fixture() {
  local migration="$1" expected
  case "${migration##*/}" in
    20261026100200_portone_chat_credit_catalog_staged_v1.sql)
      expected='a55bd7aa06d6625523090e997f6f76f5539abee1' ;;
    20261026110300_owner_admin_credit_testing_v1.sql)
      expected='186ffa2085e5922ec8319d4e5dd345a41597f3cd' ;;
    20261027101000_chat_credit_paid_validity_and_verified_mint_v1.sql)
      expected='5e5270466e700f98b2d41cac338298735dc1ad99' ;;
    *) return 1 ;;
  esac
  local actual
  actual="$(git hash-object "$migration")" || {
    echo 'HOLD_STAGED_COMMERCE_SQL_FINGERPRINT_UNAVAILABLE' >&2
    exit 1
  }
  if [[ "$actual" != "$expected" ]]; then
    echo 'HOLD_STAGED_COMMERCE_SQL_FINGERPRINT_DRIFT' >&2
    exit 1
  fi
  echo "Skipping reviewed post-frontier migration from historical fixture: ${migration##*/}"
  return 0
}
