#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 -f test/db/official_standard_reading_reader_interpretation.sql

# M1-02 through M1-14: also prove stale REPEATABLE READ persistence
# after another session's FIRST COMMIT and renewed READ COMMITTED authority;
# all missing/old-snapshot outcomes HOLD. Production issuer remains off.
bash test/db/official_reader_m1_verified_receipt_d2_private.sh
