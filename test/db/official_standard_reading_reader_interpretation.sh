#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 -f test/db/official_standard_reading_reader_interpretation.sql

# M1-02 through M1-19: strict live cutover catalog, owner-reviewed
# historical SeYeon bundle provenance + 45 unapplied SQL migration impact
# inventory; no operational private issuer, migration repair or paid T2.
bash test/db/official_reader_m1_verified_receipt_d2_private.sh
