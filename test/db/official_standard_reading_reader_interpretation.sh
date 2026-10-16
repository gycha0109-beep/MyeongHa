#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 -f test/db/official_standard_reading_reader_interpretation.sql

# M1-02 through M1-11: verify 1050/D2 atomic rollback, replay,
# source-based unknown-COMMIT reconciliation and actual loopback TCP COMMIT
# acknowledgement interception. No production private issuer activation.
bash test/db/official_reader_m1_verified_receipt_d2_private.sh
