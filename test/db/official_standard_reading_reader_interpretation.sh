#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 -f test/db/official_standard_reading_reader_interpretation.sql

# M1-02 through M1-15: verify pooled PG15 connection RESET, explicit
# READ COMMITTED READ ONLY transaction / app ROLE / COMMIT or ROLLBACK and
# old-snapshot safety. All issuance and public T2 remain HOLD.
bash test/db/official_reader_m1_verified_receipt_d2_private.sh
