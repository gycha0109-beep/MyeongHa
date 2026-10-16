#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 -f test/db/official_standard_reading_reader_interpretation.sql

# M1-02 through M1-05: reuse Official Reading fixture for real 1050
# Receipt -> private D2 rollback/retry, actual app-role denial and a disposable
# EXECUTE-only synthetic issuer privilege probe; production remains HOLD.
bash test/db/official_reader_m1_verified_receipt_d2_private.sh
