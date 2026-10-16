#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 -f test/db/official_standard_reading_reader_interpretation.sql

# M1-02: reuse the existing Official Reading fixture, then verify a *real*
# 1050-persisted Receipt can be consumed only by private D2 owner execution.
bash test/db/official_reader_m1_verified_receipt_d2_private.sh
