#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 -f test/db/official_standard_reading_reader_interpretation.sql

# M1-02 through M1-16: verify true app session's protected source
# SELECT/RLS/column ACL denial using literal M1-10 recovery SQL, in addition
# to existing read-only lifecycle and MVCC tests. All T2 and issuer HOLD.
bash test/db/official_reader_m1_verified_receipt_d2_private.sh
