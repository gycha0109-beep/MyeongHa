#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 -f test/db/official_standard_reading_reader_interpretation.sql

# M1-02 through M1-08: verify real 1050/D2 replay plus true-session-user
# isolation from a synthetic NOLOGIN D2 issuer (not just SET LOCAL ROLE via
# postgres superuser), and read-only TypeScript recovery source. All HOLD.
bash test/db/official_reader_m1_verified_receipt_d2_private.sh
