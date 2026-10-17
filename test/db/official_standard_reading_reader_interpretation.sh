#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 -f test/db/official_standard_reading_reader_interpretation.sql

# M1-02 through M1-17: verify source-ledger SELECT remains closed
# while the true API role gains only subject-scoped minimal recovery enum
# EXECUTE. No Writer/public role/paid T2 grants.
bash test/db/official_reader_m1_verified_receipt_d2_private.sh
