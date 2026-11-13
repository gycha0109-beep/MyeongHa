#!/usr/bin/env bash
# Historical CI fixtures must preserve their previously approved catalog and
# synthetic credit SKU. New Commerce SQL is installed only by separate rollout.
# This policy requires exact Git blob fingerprints before excluding any staged file.
skip_staged_portone_migration_from_historical_fixture() {
  local migration="$1" expected
  local inclusion="${2:-historical}" name="${migration##*/}" version actual
  # The old PG15 catalog snapshot must not silently absorb the 59 staged
  # official-Reader/payment migrations. Separate PG17 integrated cases load
  # them verbatim; never change the historical approved schema fingerprint.
  if [[ "$name" =~ ^([0-9]{4})_ ]]; then
    version="${BASH_REMATCH[1]}"
    if (( 10#$version >= 1740 && 10#$version <= 2320 )); then
      [[ "$inclusion" == 'reader-integrated' ]] && return 1
      expected="$(awk -v n="$name" '$1==n {print $2}' \
        test/db/official_reader_staged_migration_hashes_v1.txt)"
      if [[ ! "$expected" =~ ^[a-f0-9]{40}$ ]]; then
        echo 'HOLD_UNREVIEWED_READER_MIGRATION_IN_HISTORICAL_FIXTURE' >&2
        exit 1
      fi
      actual="$(git hash-object "$migration")" || exit 1
      if [[ "$actual" != "$expected" ]]; then
        echo 'HOLD_READER_HISTORICAL_STAGING_FINGERPRINT_DRIFT' >&2
        exit 1
      fi
      echo "Skipping isolated Reader staged migration from historical catalog: $name"
      return 0
    fi
  fi
  # 2370 replaces a private Reader refund confirmer defined by 2310.
  # Historical PG15/PG17 fixtures deliberately exclude 2310 and MUST NOT
  # compile its replacement. Integrated PG17 Reader cases apply both files.
  if [[ "$name" == '2370_commerce_reader_refund_confirm_exact_provider_lineage_v1.sql' ]]; then
    [[ "$inclusion" == 'reader-integrated' ]] && return 1
    expected='4abf6431c1d14212af4cb34363ea4739c21d109f'
    actual="$(git hash-object "$migration")" || {
      echo 'HOLD_READER_REFUND_MIGRATION_FINGERPRINT_UNAVAILABLE' >&2
      exit 1
    }
    if [[ "$actual" != "$expected" ]]; then
      echo 'HOLD_READER_REFUND_MIGRATION_FINGERPRINT_DRIFT' >&2
      exit 1
    fi
    echo "Skipping Reader-only refund confirmation migration from historical catalog: $name"
    return 0
  fi
  # 2380 forward-replaces the private Reader display helper from 2160.
  # Historical fixtures skip 2160; only reader-integrated PG17 loads both.
  if [[ "$name" == '2380_official_reader_current_exact_cancellation_status_provenance_v1.sql' ]]; then
    [[ "$inclusion" == 'reader-integrated' ]] && return 1
    expected='f7dbad4218a9443894f53af4777bd46eb823f99c'
    actual="$(git hash-object "$migration")" || {
      echo 'HOLD_READER_STATUS_MIGRATION_FINGERPRINT_UNAVAILABLE' >&2
      exit 1
    }
    if [[ "$actual" != "$expected" ]]; then
      echo 'HOLD_READER_STATUS_MIGRATION_FINGERPRINT_DRIFT' >&2
      exit 1
    fi
    echo "Skipping Reader-only cancellation status migration from historical catalog: $name"
    return 0
  fi
  # 2390 forward-replaces the exact Reader full-cancel writer from 1890.
  # Only fully migrated Reader-integrated PG17 may compile its replacement.
  if [[ "$name" == '2390_official_reader_full_cancel_exact_event_replay_guard_v1.sql' ]]; then
    [[ "$inclusion" == 'reader-integrated' ]] && return 1
    expected='15767023608188b9269df992f1663a5189528a36'
    actual="$(git hash-object "$migration")" || {
      echo 'HOLD_READER_CANCEL_REPLAY_MIGRATION_FINGERPRINT_UNAVAILABLE' >&2
      exit 1
    }
    if [[ "$actual" != "$expected" ]]; then
      echo 'HOLD_READER_CANCEL_REPLAY_MIGRATION_FINGERPRINT_DRIFT' >&2
      exit 1
    fi
    echo "Skipping Reader cancellation replay migration from historical catalog: $name"
    return 0
  fi
  # 2400 forward-replaces the private 1770 S2 scoped revoke worker.
  # Historical PG15/PG17 fixtures do not install the original Reader 1770.
  if [[ "$name" == '2400_official_reader_replayed_revoke_current_grant_guard_v1.sql' ]]; then
    [[ "$inclusion" == 'reader-integrated' ]] && return 1
    expected='ac0d025948aa6cc30403fa637c2415da98c22526'
    actual="$(git hash-object "$migration")" || {
      echo 'HOLD_READER_REPLAY_CURRENT_MIGRATION_FINGERPRINT_UNAVAILABLE' >&2
      exit 1
    }
    if [[ "$actual" != "$expected" ]]; then
      echo 'HOLD_READER_REPLAY_CURRENT_MIGRATION_FINGERPRINT_DRIFT' >&2
      exit 1
    fi
    echo "Skipping Reader-only replay-current-state migration from historical catalog: $name"
    return 0
  fi
  # 2410 replaces the private Reader 2390 verified cancellation writer.
  if [[ "$name" == '2410_official_reader_unbound_cancel_replay_current_grant_guard_v1.sql' ]]; then
    [[ "$inclusion" == 'reader-integrated' ]] && return 1
    expected='27ade134deb15bd2f7c0aff1c13606f557950930'
    actual="$(git hash-object "$migration")" || {
      echo 'HOLD_UNBOUND_REPLAY_MIGRATION_FINGERPRINT_UNAVAILABLE' >&2
      exit 1
    }
    if [[ "$actual" != "$expected" ]]; then
      echo 'HOLD_UNBOUND_REPLAY_MIGRATION_FINGERPRINT_DRIFT' >&2
      exit 1
    fi
    echo "Skipping Reader-only unbound replay migration from historical catalog: $name"
    return 0
  fi
  # 2420 upgrades the existing 2240 private S7 claim source query;
  # historical DB fixtures never load that original staged Reader function.
  if [[ "$name" == '2420_official_reader_s7_withdrawal_exact_full_cancel_provenance_v1.sql' ]]; then
    [[ "$inclusion" == 'reader-integrated' ]] && return 1
    expected='5da0a5039f643748eac510dd64d18a374ff470ef'
    actual="$(git hash-object "$migration")" || {
      echo 'HOLD_READER_S7_ORIGINAL_CANCEL_MIGRATION_FINGERPRINT_UNAVAILABLE' >&2
      exit 1
    }
    if [[ "$actual" != "$expected" ]]; then
      echo 'HOLD_READER_S7_ORIGINAL_CANCEL_MIGRATION_FINGERPRINT_DRIFT' >&2
      exit 1
    fi
    echo "Skipping S7 private Reader claim source migration from historical catalog: $name"
    return 0
  fi
  case "${migration##*/}" in
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
    20261029012000_owner_kcp_sandbox_remove_daily_limit_v1.sql)
      expected='3903c37f80f860f899fb1086b4bab878e73eab1d' ;;
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
