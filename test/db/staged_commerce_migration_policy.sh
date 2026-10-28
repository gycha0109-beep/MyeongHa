#!/usr/bin/env bash
# Historical CI fixtures must preserve their previously approved catalog and
# synthetic credit SKU. New Commerce SQL is installed only by separate rollout.
# This policy requires exact Git blob fingerprints before excluding any staged file.
skip_staged_portone_migration_from_historical_fixture() {
  local migration="$1" expected
  case "${migration##*/}" in
    20261028125751_commerce_verified_credit_receipt_fulfillment_v1.sql)
      expected='9c8f500a528c0cd5f52a0b5d60e47caacf2fb918' ;;
    20261026100200_portone_chat_credit_catalog_staged_v1.sql)
      expected='a55bd7aa06d6625523090e997f6f76f5539abee1' ;;
    20261026110300_owner_admin_credit_testing_v1.sql)
      expected='186ffa2085e5922ec8319d4e5dd345a41597f3cd' ;;
    20261027101000_chat_credit_paid_validity_and_verified_mint_v1.sql)
      expected='5e5270466e700f98b2d41cac338298735dc1ad99' ;;
    20261027125500_chat_credit_delivered_ack_private_v1.sql)
      expected='5e5db487aa8a155cfded83b8d58c363e20f1a7b0' ;;
    20261027163500_commerce_owner_sandbox_credit_checkout_v1.sql)
      expected='b5a47d794c8ffb0e62fecfb25d81c0b6c9312f70' ;;
    20261027185000_owner_kcp_sandbox_private_prepare_v1.sql)
      expected='3f2d10daa1b7a22b647d50bd4498408c58e1639b' ;;
    20261028110500_owner_sandbox_signed_receipt_persistence_v1.sql)
      expected='59a2d005cace08cb46da9cf57351131620218d0b' ;;
    20261027054525_digital_reading_checkout_notice_evidence_v1.sql)
      expected='550e2ff3dd86d16d30334220c223650387b71ca7' ;;
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
