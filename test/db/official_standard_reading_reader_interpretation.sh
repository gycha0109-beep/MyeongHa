#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 -f test/db/official_standard_reading_reader_interpretation.sql

# M1-02 / M1-03 / M1-04: reuse the existing Official Reading fixture
# for real 1050 Receipt -> private D2 atomic rollback/retry plus actual
# Commerce/Member SET LOCAL ROLE execute-denial; no production cutover.
bash test/db/official_reader_m1_verified_receipt_d2_private.sh
