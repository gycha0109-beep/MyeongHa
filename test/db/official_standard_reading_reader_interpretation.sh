#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 -f test/db/official_standard_reading_reader_interpretation.sql

# M1-02 through M1-07: reuse the actual verified 1050 Receipt, D2
# original-effect replay, caller denial and issuer probes; also execute the
# TypeScript private-recovery authority query against this PG fixture. HOLD.
bash test/db/official_reader_m1_verified_receipt_d2_private.sh
