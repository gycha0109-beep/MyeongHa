#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 -f test/db/official_standard_reading_reader_interpretation.sql

# M1-02 through M1-06: reuse Official Reading fixture for real 1050
# Receipt -> private D2 rollback/retry, actual app-role/issuer probe denial,
# and original effect semantic replay with immutable ledger; production HOLD.
bash test/db/official_reader_m1_verified_receipt_d2_private.sh
