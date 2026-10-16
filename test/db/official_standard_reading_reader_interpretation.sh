#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 -f test/db/official_standard_reading_reader_interpretation.sql

# M1-02 / M1-03: use the existing Official Reading fixture for a real
# 1050 Receipt -> private D2 bridge, including atomic bind-failure rollback
# and retry. This remains an isolated PG role/transaction test, not cutover.
bash test/db/official_reader_m1_verified_receipt_d2_private.sh
