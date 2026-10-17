#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 -f test/db/official_standard_reading_reader_interpretation.sql

# M1-02 through M1-18: strict read-only live cutover catalog gate, role
# ACL-drift HOLD probes and migration-history unit matrix alongside M1-17
# subject-bound minimal read; no operational private issuer or public paid T2.
bash test/db/official_reader_m1_verified_receipt_d2_private.sh
