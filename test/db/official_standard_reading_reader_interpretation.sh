#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 -f test/db/official_standard_reading_reader_interpretation.sql

# M1-02 through M1-12: verify atomic 1050/D2 and real TCP COMMIT
# acknowledgement loss on FIRST ISSUE plus replay, followed by source-only
# unknown-COMMIT reconciliation. Production issuer remains unauthorized.
bash test/db/official_reader_m1_verified_receipt_d2_private.sh
