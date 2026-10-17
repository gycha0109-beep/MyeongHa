#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 -f test/db/official_standard_reading_reader_interpretation.sql

# M1-02 through M1-13: verify MVCC invisibility and lock exclusion
# during a pending first issue, first-issue and replay COMMIT-ACK loss, plus
# source-only unknown-COMMIT HOLD. No production issuer authorization.
bash test/db/official_reader_m1_verified_receipt_d2_private.sh
