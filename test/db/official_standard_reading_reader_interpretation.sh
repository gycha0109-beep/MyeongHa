#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 -f test/db/official_standard_reading_reader_interpretation.sql

# M1-02 through M1-10: verify 1050/D2 atomic rollback and replay,
# strict issuer role isolation, real post-issue timeout, and read-only
# unknown-COMMIT reconciliation before/after D2. All production HOLD.
bash test/db/official_reader_m1_verified_receipt_d2_private.sh
