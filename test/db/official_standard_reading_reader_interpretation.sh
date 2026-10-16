#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 -f test/db/official_standard_reading_reader_interpretation.sql

# M1-02 through M1-09: verify real 1050/D2 replay, runtime issuer
# session isolation, and post-issue SQL timeout rollback/recovery before the
# same Receipt's private atomic D2 retry. Production issuer remains HOLD.
bash test/db/official_reader_m1_verified_receipt_d2_private.sh
